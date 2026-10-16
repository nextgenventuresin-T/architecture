import { useMemo, useState } from 'react';
import { Layers, Plus, Pencil, Trash2, Save, X } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import ProgressBar from '../ui/ProgressBar';
import { InputField, SelectField } from '../ui/Field';
import useAsync from '../../hooks/useAsync';
import { projectsApi } from '../../api/projectsApi';
import { toApiError } from '../../api/axiosClient';
import { formatCurrency } from '../../utils/format';
import { AREA_TYPE_OPTIONS, AREA_TYPE_LABELS } from '../../utils/areaOptions';

const EMPTY = { name: '', area_type: 'floor', site_id: '', parent_id: '', description: '' };

/**
 * Site areas of a project - areas, floors, rooms, zones - and the work in each:
 * tasks, subtasks, progress, planned budget and the materials / tools requested
 * and delivered for that area.
 */
export default function AreasTab({ detail, projectId, canEdit = true }) {
  const sites = detail?.sites ?? [];
  const { data, isLoading, error, reload } = useAsync(() => projectsApi.areaSummary(projectId), [projectId]);
  const rows = data?.rows ?? [];
  const areas = rows.filter((r) => r.id);

  const [editing, setEditing] = useState(null); // null | 'new' | area
  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);
  const [siteFilter, setSiteFilter] = useState('all');

  const visible = useMemo(
    () => (siteFilter === 'all' ? rows : rows.filter((r) => (siteFilter === 'project' ? !r.siteId && r.id : String(r.siteId) === siteFilter))),
    [rows, siteFilter]
  );

  const open = (area) => {
    setEditing(area || 'new');
    setValues(area
      ? { name: area.name, area_type: area.areaType || 'area', site_id: area.siteId ? String(area.siteId) : '', parent_id: area.parentId ? String(area.parentId) : '', description: area.description || '' }
      : EMPTY);
    setFieldErrors({});
    setFormError(null);
  };
  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setFieldErrors((f) => ({ ...f, [key]: undefined }));
  };

  // Only top-level areas can contain others (Floor › Room), on the same site or project-wide.
  const parentOptions = areas
    .filter((a) => !a.parentId && (editing === 'new' || a.id !== editing?.id))
    .filter((a) => !values.site_id || !a.siteId || String(a.siteId) === values.site_id)
    .map((a) => ({ value: String(a.id), label: `${a.name}${a.siteName ? ` (${a.siteName})` : ''}` }));

  async function save(e) {
    e.preventDefault();
    if (!values.name.trim()) {
      setFieldErrors({ name: 'Enter the area name.' });
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      name: values.name.trim(),
      area_type: values.area_type,
      site_id: values.site_id ? Number(values.site_id) : null,
      parent_id: values.parent_id ? Number(values.parent_id) : null,
      description: values.description.trim() || null,
    };
    try {
      if (editing === 'new') await projectsApi.createArea(projectId, payload);
      else await projectsApi.updateArea(projectId, editing.id, payload);
      setBanner({ tone: 'success', message: editing === 'new' ? `Area "${payload.name}" added.` : 'Area updated.' });
      setEditing(null);
      reload();
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setFormError(apiError);
    } finally {
      setSaving(false);
    }
  }

  async function remove(area) {
    const inner = areas.filter((a) => a.parentId === area.id).length;
    const msg = `Delete "${area.label}"${inner ? ` and the ${inner} area(s) inside it` : ''}? Tasks, subtasks and purchase requests in it are kept - they just lose their area.`;
    if (!window.confirm(msg)) return;
    try {
      await projectsApi.deleteArea(projectId, area.id);
      setBanner({ tone: 'success', message: 'Area deleted.' });
      reload();
    } catch (caught) {
      setBanner({ tone: 'error', message: toApiError(caught).message });
    }
  }

  return (
    <div className="space-y-4">
      {banner && <Alert tone={banner.tone}>{banner.message}</Alert>}

      <Card>
        <CardHeader
          title="Areas, floors & rooms"
          description="Organise tasks, subtasks and material / tool requests by where the work happens."
          action={canEdit && (
            <Button size="sm" onClick={() => open(null)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add area
            </Button>
          )}
        />
        <CardBody>
          {sites.length > 0 && (
            <div className="mb-4 w-56">
              <SelectField
                label="Show"
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'All areas' },
                  { value: 'project', label: 'Project-wide areas' },
                  ...sites.map((s) => ({ value: String(s.id), label: s.name })),
                ]}
              />
            </div>
          )}

          {error && <Alert tone="error" title="Could not load areas">{error.message}</Alert>}
          {isLoading && <p className="text-sm text-ink-subtle">Loading areas…</p>}

          {!isLoading && !error && rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Layers className="h-8 w-8 text-ink-subtle" aria-hidden="true" />
              <p className="font-medium text-ink">No areas yet</p>
              <p className="max-w-md text-sm text-ink-muted">Add floors, rooms or zones (e.g. “Ground Floor”, then “Kitchen” inside it) and assign tasks to them to track progress area by area.</p>
            </div>
          )}

          {visible.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-subtle">
                    <th className="py-2 pr-3">Area</th>
                    <th className="py-2 pr-3">Site</th>
                    <th className="py-2 pr-3">Tasks</th>
                    <th className="py-2 pr-3">Progress</th>
                    <th className="py-2 pr-3 text-right">Planned budget</th>
                    <th className="py-2 pr-3">Materials & tools</th>
                    {canEdit && <th className="py-2 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((r) => (
                    <tr key={r.id ?? 'none'} className={r.id ? '' : 'bg-canvas/60'}>
                      <td className="py-2.5 pr-3">
                        <div className={r.parentId ? 'pl-5' : ''}>
                          <p className="font-medium text-ink">{r.parentId ? `↳ ${r.name}` : r.label}</p>
                          {r.areaType && <Badge tone="neutral" className="mt-0.5">{AREA_TYPE_LABELS[r.areaType] ?? r.areaType}</Badge>}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-ink-muted">{r.id ? (r.siteName || 'Whole project') : '—'}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-ink-muted">
                        {r.tasks} task{r.tasks === 1 ? '' : 's'} · {r.subtasks} subtask{r.subtasks === 1 ? '' : 's'}
                        <p className="text-xs text-ink-subtle">{r.completedTasks} completed</p>
                      </td>
                      <td className="py-2.5 pr-3">
                        {r.taskProgress != null ? <div className="w-28"><ProgressBar value={Number(r.taskProgress)} status="on-track" showLabel /></div> : <span className="text-ink-subtle">—</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{r.plannedBudget != null ? formatCurrency(r.plannedBudget) : '—'}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-ink-muted">
                        {r.materialRequests} material · {r.toolRequests} machine
                        <p className="text-xs text-ink-subtle">{r.deliveredRequests} delivered · {r.inTransitRequests} on order</p>
                      </td>
                      {canEdit && (
                        <td className="py-2.5 text-right">
                          {r.id && (
                            <div className="flex justify-end gap-1">
                              <button type="button" onClick={() => open(r)} className="rounded-md p-1.5 text-ink-muted hover:bg-canvas hover:text-ink" aria-label={`Edit ${r.label}`}>
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button type="button" onClick={() => remove(r)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${r.label}`}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add area' : 'Edit area'}
        description="An area can be a floor, room, zone or block - nest a room inside a floor to track it on its own."
      >
        <form onSubmit={save} noValidate className="space-y-4">
          {formError && !Object.keys(fieldErrors).length && <Alert tone="error">{formError.message}</Alert>}
          <InputField label="Name" required value={values.name} onChange={set('name')} error={fieldErrors.name} placeholder="Ground Floor / Kitchen / Zone A" />
          <SelectField label="Type" value={values.area_type} onChange={set('area_type')} options={AREA_TYPE_OPTIONS} error={fieldErrors.area_type} />
          {sites.length > 0 && (
            <SelectField label="Site" value={values.site_id} onChange={set('site_id')} placeholder="Whole project (all sites)" error={fieldErrors.site_id}
              options={sites.map((s) => ({ value: String(s.id), label: s.name }))} />
          )}
          <SelectField label="Inside" value={values.parent_id} onChange={set('parent_id')} placeholder="— Top level —" error={fieldErrors.parent_id}
            options={parentOptions} hint="e.g. put “Kitchen” inside “Ground Floor”." />
          <InputField label="Description" value={values.description} onChange={set('description')} error={fieldErrors.description} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}><X className="h-4 w-4" aria-hidden="true" />Cancel</Button>
            <Button type="submit" isLoading={saving} loadingText="Saving…"><Save className="h-4 w-4" aria-hidden="true" />Save area</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
