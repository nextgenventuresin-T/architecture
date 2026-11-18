import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { SelectField } from '../ui/Field';
import MultiCheckSelect from '../ui/MultiCheckSelect';
import { projectsApi } from '../../api/projectsApi';
import { toApiError } from '../../api/axiosClient';
import { toOptions } from '../../utils/projectOptions';

/** Reassigns the four team roles on a project without opening the full form. */
export default function AssignTeamDialog({ project, lookups, onClose, onSaved }) {
  const [values, setValues] = useState({});
  const [engineerIds, setEngineerIds] = useState([]);
  const [contractorIds, setContractorIds] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!project) return;
    setError(null);
    setValues({
      project_manager_id: project.team.projectManager?.id ? String(project.team.projectManager.id) : '',
      architect_id: project.team.architect?.id ? String(project.team.architect.id) : '',
    });
    // Several engineers and contractors may share a project.
    setEngineerIds((project.team.siteEngineers?.length ? project.team.siteEngineers : [project.team.siteEngineer].filter(Boolean)).map((e) => String(e.id)));
    setContractorIds((project.contractors?.length ? project.contractors : [project.contractor].filter(Boolean)).map((c) => String(c.id)));
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
      onSaved(await projectsApi.assignTeam(project.id, {
        ...payload,
        site_engineer_ids: engineerIds.map(Number),
        contractor_ids: contractorIds.map(Number),
      }));
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
        <TeamPicker label="Site engineers" noun="engineers" value={engineerIds} onChange={setEngineerIds}
          options={toOptions(lookups?.siteEngineers ?? [], 'full_name')} />
        <TeamPicker label="Contractors" noun="contractors" value={contractorIds} onChange={setContractorIds}
          options={toOptions(lookups?.contractors ?? [])}
          hint="All contractors share the project's sites equally. A site shared by several contractors uses its own Site Store." />
      </div>
    </Modal>
  );
}

/** Labelled multi-pick for a team list (empty = unassigned). */
export function TeamPicker({ label, noun, value, onChange, options, hint }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <MultiCheckSelect label={label} allLabel="Unassigned" noun={noun} options={options}
        value={value} onChange={onChange} className="[&>button]:h-10 [&>button]:rounded-xl" />
      {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
    </div>
  );
}
