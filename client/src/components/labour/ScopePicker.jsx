import { useEffect, useState } from 'react';
import { SelectField } from '../ui/Field';
import { projectsApi } from '../../api/projectsApi';
import { tasksApi } from '../../api/tasksApi';

/**
 * Project -> Site -> Task -> Subtask -> Area pickers. `value` is
 * { projectId, siteId, taskId, subtaskId, areaId } (strings); `onChange` receives the
 * next value. Changing a level clears the levels below it.
 */
export function useScopeOptions(value) {
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [areas, setAreas] = useState([]);

  useEffect(() => {
    projectsApi.list({ pageSize: 50 }).then((d) => setProjects(d.projects || [])).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!value.projectId) { setSites([]); setTasks([]); setAreas([]); return; }
    projectsApi.detail(value.projectId).then((d) => setSites(d.sites || [])).catch(() => setSites([]));
    tasksApi.list({ projectId: value.projectId }).then((t) => setTasks(t || [])).catch(() => setTasks([]));
    projectsApi.areas(value.projectId).then((d) => setAreas(d.areas || [])).catch(() => setAreas([]));
  }, [value.projectId]);

  const siteTasks = tasks.filter((t) => !value.siteId || !t.siteId || String(t.siteId) === String(value.siteId));
  const task = tasks.find((t) => String(t.id) === String(value.taskId));
  const subtasks = task?.subtasks || [];
  const siteAreas = areas.filter((a) => !value.siteId || !a.siteId || String(a.siteId) === String(value.siteId));
  return { projects, sites, tasks: siteTasks, subtasks, areas: siteAreas, task };
}

export default function ScopePicker({ value, onChange, required = {}, show = {}, errors = {}, className = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5' }) {
  const { projects, sites, tasks, subtasks, areas, task } = useScopeOptions(value);
  const visible = { site: true, task: true, subtask: true, area: true, ...show };

  const set = (key) => (e) => {
    const v = e.target.value;
    const next = { ...value, [key]: v };
    if (key === 'projectId') Object.assign(next, { siteId: '', taskId: '', subtaskId: '', areaId: '' });
    if (key === 'siteId') Object.assign(next, { taskId: '', subtaskId: '', areaId: '' });
    if (key === 'taskId') {
      const t = tasks.find((x) => String(x.id) === v);
      Object.assign(next, { subtaskId: '', areaId: t?.areaId ? String(t.areaId) : '' });
      if (t?.siteId && !value.siteId) next.siteId = String(t.siteId);
    }
    if (key === 'subtaskId') {
      const st = subtasks.find((x) => String(x.id) === v);
      next.areaId = st?.areaId ? String(st.areaId) : (task?.areaId ? String(task.areaId) : '');
    }
    onChange(next);
  };

  return (
    <div className={className}>
      <SelectField label="Project" required={required.project} value={value.projectId} onChange={set('projectId')} error={errors.project_id}
        placeholder={required.project ? 'Select project' : 'All projects'}
        options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))} />
      {visible.site && (
        <SelectField label="Site" value={value.siteId} onChange={set('siteId')} error={errors.site_id} disabled={!value.projectId}
          placeholder="All sites" options={sites.map((s) => ({ value: String(s.id), label: s.name }))} />
      )}
      {visible.task && (
        <SelectField label="Task" required={required.task} value={value.taskId} onChange={set('taskId')} error={errors.task_id} disabled={!value.projectId}
          placeholder={required.task ? 'Select task' : 'All tasks'} options={tasks.map((t) => ({ value: String(t.id), label: t.name }))} />
      )}
      {visible.subtask && (
        <SelectField label="Subtask" value={value.subtaskId} onChange={set('subtaskId')} error={errors.subtask_id} disabled={!subtasks.length}
          placeholder={subtasks.length ? 'Main task' : 'No subtasks'} options={subtasks.map((st) => ({ value: String(st.id), label: st.name }))} />
      )}
      {visible.area && (
        <SelectField label="Area" value={value.areaId} onChange={set('areaId')} error={errors.area_id} disabled={!value.projectId}
          placeholder={areas.length ? 'No specific area' : 'No areas defined'} options={areas.map((a) => ({ value: String(a.id), label: a.label }))} />
      )}
    </div>
  );
}
