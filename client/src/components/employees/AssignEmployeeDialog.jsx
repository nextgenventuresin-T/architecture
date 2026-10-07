import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, SelectField, TextAreaField } from '../ui/Field';
import { employeesApi } from '../../api/employeesApi';
import { projectsApi } from '../../api/projectsApi';
import { toApiError } from '../../api/axiosClient';

/**
 * Posts an employee to a project and, once a project is picked, optionally to
 * one of its sites. Writes only to the Interface 5 assignments table — the
 * team columns Interface 3 keeps on projects/sites are never touched here.
 */
export default function AssignEmployeeDialog({ employee, onClose, onSaved }) {
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [role, setRole] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!employee) return;
    setError(null);
    setProjectId('');
    setSiteId('');
    setRole(employee.designation ?? '');
    setNotes('');
    setSites([]);
    setIsLoadingProjects(true);
    projectsApi
      .list({ pageSize: 50 })
      .then((data) => setProjects(data.projects ?? []))
      .catch((caught) => setError(toApiError(caught)))
      .finally(() => setIsLoadingProjects(false));
  }, [employee]);

  useEffect(() => {
    if (!projectId) {
      setSites([]);
      setSiteId('');
      return;
    }
    setIsLoadingSites(true);
    projectsApi
      .detail(projectId)
      .then((data) => setSites(data.sites ?? []))
      .catch((caught) => setError(toApiError(caught)))
      .finally(() => setIsLoadingSites(false));
  }, [projectId]);

  if (!employee) return null;

  async function handleSave() {
    if (!projectId) {
      setError({ message: 'Select a project first.' });
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await employeesApi.assign(employee.id, {
        project_id: Number(projectId),
        site_id: siteId ? Number(siteId) : null,
        role: role.trim() || null,
        notes: notes.trim() || null,
      });
      const where = siteId
        ? sites.find((s) => String(s.id) === String(siteId))?.name
        : projects.find((p) => String(p.id) === String(projectId))?.name;
      onSaved(`${employee.fullName} was assigned to ${where ?? 'the selection'}.`);
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Assign to project / site"
      description={`${employee.employeeCode} · ${employee.fullName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} isLoading={isSaving} loadingText="Assigning…">Assign</Button>
        </>
      }
    >
      {error && <Alert tone="error" className="mb-4">{error.message}</Alert>}

      <div className="space-y-4">
        <SelectField
          label="Project"
          required
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          placeholder={isLoadingProjects ? 'Loading projects…' : 'Select a project'}
          options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))}
          disabled={isLoadingProjects}
        />
        <SelectField
          label="Site (optional)"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          placeholder={
            !projectId ? 'Select a project first' : isLoadingSites ? 'Loading sites…' : 'Whole project (no specific site)'
          }
          options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
          disabled={!projectId || isLoadingSites}
          hint="Leave unset to post this employee to the project rather than one site."
        />
        <InputField
          label="Role on this assignment"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Site Supervisor"
          hint="Defaults to their designation."
        />
        <TextAreaField
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything worth recording about this posting…"
        />
      </div>
    </Modal>
  );
}
