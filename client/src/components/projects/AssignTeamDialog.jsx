import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { SelectField } from '../ui/Field';
import { projectsApi } from '../../api/projectsApi';
import { toApiError } from '../../api/axiosClient';
import { toOptions } from '../../utils/projectOptions';

/** Reassigns the four team roles on a project without opening the full form. */
export default function AssignTeamDialog({ project, lookups, onClose, onSaved }) {
  const [values, setValues] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!project) return;
    setError(null);
    setValues({
      project_manager_id: project.team.projectManager?.id ? String(project.team.projectManager.id) : '',
      architect_id: project.team.architect?.id ? String(project.team.architect.id) : '',
      site_engineer_id: project.team.siteEngineer?.id ? String(project.team.siteEngineer.id) : '',
      contractor_id: project.contractor?.id ? String(project.contractor.id) : '',
    });
  }, [project]);

  if (!project) return null;

  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      // Empty string means "unassigned" — send null so the column clears.
      const payload = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, value === '' ? null : Number(value)])
      );
      onSaved(await projectsApi.assignTeam(project.id, payload));
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
      title="Assign project team"
      description={project.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} isLoading={isSaving} loadingText="Saving…">Save team</Button>
        </>
      }
    >
      {error && <Alert tone="error" className="mb-4">{error.message}</Alert>}

      <div className="space-y-4">
        <SelectField label="Project manager" value={values.project_manager_id} onChange={set('project_manager_id')}
          placeholder="Unassigned" options={toOptions(lookups?.projectManagers ?? [], 'full_name')} />
        <SelectField label="Architect" value={values.architect_id} onChange={set('architect_id')}
          placeholder="Unassigned" options={toOptions(lookups?.architects ?? [], 'full_name')} />
        <SelectField label="Site engineer" value={values.site_engineer_id} onChange={set('site_engineer_id')}
          placeholder="Unassigned" options={toOptions(lookups?.siteEngineers ?? [], 'full_name')} />
        <SelectField label="Contractor" value={values.contractor_id} onChange={set('contractor_id')}
          placeholder="Unassigned" options={toOptions(lookups?.contractors ?? [])} />
      </div>
    </Modal>
  );
}
