import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { SelectField } from '../ui/Field';
import { contractorsApi } from '../../api/contractorsApi';
import { projectsApi } from '../../api/projectsApi';
import { toApiError } from '../../api/axiosClient';

/**
 * Assigns a contractor to a project, and — once a project is picked — lets
 * the admin narrow that down to one of the project's sites. Reuses the same
 * project/site endpoints Interface 3 already exposes, so nothing about how
 * projects or sites store their contractor changes.
 */
export default function AssignContractorDialog({ contractor, onClose, onSaved }) {
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!contractor) return;
    setError(null);
    setProjectId('');
    setSiteId('');
    setSites([]);
    setIsLoadingProjects(true);
    projectsApi
      .list({ pageSize: 50 })
      .then((data) => setProjects(data.projects ?? []))
      .catch((caught) => setError(toApiError(caught)))
      .finally(() => setIsLoadingProjects(false));
  }, [contractor]);

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

  if (!contractor) return null;

  async function handleSave() {
    if (!projectId) {
      setError({ message: 'Select a project first.' });
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (siteId) {
        await contractorsApi.assignSite(contractor.id, siteId);
        onSaved(`${contractor.name} was assigned to the selected site.`);
      } else {
        await contractorsApi.assignProject(contractor.id, projectId);
        onSaved(`${contractor.name} was assigned to the selected project.`);
      }
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setIsSaving(false);
    }
  }

  const projectOptions = projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }));
  const siteOptions = sites.map((s) => ({ value: String(s.id), label: s.name }));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Assign to project / site"
      description={contractor.name}
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
          options={projectOptions}
          disabled={isLoadingProjects}
        />
        <SelectField
          label="Site (optional)"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          placeholder={
            !projectId ? 'Select a project first' : isLoadingSites ? 'Loading sites…' : 'Whole project (no specific site)'
          }
          options={siteOptions}
          disabled={!projectId || isLoadingSites}
          hint="Leave unset to assign this contractor as the project's overall contractor instead of one site."
        />
      </div>
    </Modal>
  );
}
