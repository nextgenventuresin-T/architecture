import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { InputField, SelectField, TextAreaField } from '../ui/Field';
import { pmApi } from '../../api/pmApi';
import { dailyWorkApi } from '../../api/dailyWorkApi';
import { tasksApi } from '../../api/tasksApi';
import { toApiError } from '../../api/axiosClient';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * A Project Manager records work done / progress on an ASSIGNED site. The update is stored against
 * the PM as author and against the contractor responsible for that site; the server refuses any
 * project or site outside the PM's assignment.
 */
export default function PmWorkUpdateModal({ isOpen, onClose, onSaved }) {
  const [scope, setScope] = useState({ projects: [] });
  const [subtasks, setSubtasks] = useState([]);
  const [v, setV] = useState({ project_id: '', site_id: '', task_id: '', subtask_id: '', work_date: today(), work_done: '', progress_percentage: '', work_status: 'in-progress', remarks: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    pmApi.scope().then(setScope).catch((e) => setError(toApiError(e).message));
  }, [isOpen]);

  // Subtasks of the chosen main task (progress can be reported per subtask).
  useEffect(() => {
    if (!isOpen || !v.task_id) { setSubtasks([]); return undefined; }
    let active = true;
    tasksApi.listSubtasks(v.task_id).then((list) => active && setSubtasks(list || [])).catch(() => active && setSubtasks([]));
    return () => { active = false; };
  }, [isOpen, v.task_id]);

  if (!isOpen) return null;

  const project = scope.projects.find((p) => String(p.id) === String(v.project_id));
  const site = project?.sites.find((s) => String(s.id) === String(v.site_id));
  const set = (k) => (e) => {
    setV((c) => ({ ...c, [k]: e.target.value, ...(k === 'project_id' ? { site_id: '', task_id: '', subtask_id: '' } : {}), ...(k === 'site_id' ? { task_id: '', subtask_id: '' } : {}), ...(k === 'task_id' ? { subtask_id: '' } : {}) }));
    setErrors((c) => ({ ...c, [k]: undefined }));
  };

  async function save() {
    const errs = {};
    if (!v.project_id) errs.project_id = 'Select a project.';
    if (!v.site_id) errs.site_id = 'Select a site.';
    if (!v.work_done.trim()) errs.work_done = 'Describe the work done.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('project_id', v.project_id);
      form.append('site_id', v.site_id);
      if (v.task_id) form.append('task_id', v.task_id);
      if (v.task_id && v.subtask_id) form.append('subtask_id', v.subtask_id);
      form.append('work_date', v.work_date);
      form.append('work_done', v.work_done.trim());
      form.append('work_status', v.work_status);
      form.append('progress_percentage', v.progress_percentage || '0');
      if (v.remarks.trim()) form.append('remarks', v.remarks.trim());
      await dailyWorkApi.create(form);
      setV((c) => ({ ...c, work_done: '', progress_percentage: '', remarks: '' }));
      onSaved('Daily work update recorded.');
    } catch (caught) {
      const e = toApiError(caught);
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Record daily work / progress"
      description="Linked to you, the project, site, task and the contractor responsible for the site."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={saving}>Save update</Button></>}
    >
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Project"
          required
          value={v.project_id}
          onChange={set('project_id')}
          error={errors.project_id}
          placeholder={scope.projects.length ? 'Select project' : 'No projects assigned to you'}
          options={scope.projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))}
        />
        <SelectField
          label="Site"
          required
          value={v.site_id}
          onChange={set('site_id')}
          error={errors.site_id}
          disabled={!project}
          placeholder={project ? 'Select site' : 'Select project first'}
          options={(project?.sites ?? []).map((s) => ({ value: String(s.id), label: s.name }))}
        />
        <SelectField
          label="Task"
          value={v.task_id}
          onChange={set('task_id')}
          disabled={!site}
          placeholder="No specific task"
          options={(site?.tasks ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
        />
        {subtasks.length > 0 && (
          <SelectField
            label="Subtask"
            value={v.subtask_id}
            onChange={set('subtask_id')}
            placeholder="Main task (not a specific subtask)"
            options={subtasks.map((st) => ({ value: String(st.id), label: `${st.name} (${st.progress}%)` }))}
          />
        )}
        <InputField label="Date" type="date" value={v.work_date} max={today()} onChange={set('work_date')} />
        <TextAreaField className="sm:col-span-2" label="Work done" required rows={3} value={v.work_done} onChange={set('work_done')} error={errors.work_done} />
        <InputField label="Progress (%)" type="number" min="0" max="100" value={v.progress_percentage} onChange={set('progress_percentage')} />
        <SelectField
          label="Status"
          value={v.work_status}
          onChange={set('work_status')}
          options={[{ value: 'in-progress', label: 'In progress' }, { value: 'completed', label: 'Completed' }]}
        />
        <TextAreaField className="sm:col-span-2" label="Remarks" rows={2} value={v.remarks} onChange={set('remarks')} />
      </div>
    </Modal>
  );
}
