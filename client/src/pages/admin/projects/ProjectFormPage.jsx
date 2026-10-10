import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import {
  Save,
  X,
  Plus,
  Minus,
  Trash2,
  Upload,
  FileText,
  Download,
  Users,
  Building2,
  Calendar,
  Layers,
  ListTodo,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import { InputField, SelectField, TextAreaField } from '../../../components/ui/Field';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Badge from '../../../components/ui/Badge';
import Skeleton from '../../../components/ui/Skeleton';
import ClientModal from '../../../components/clients/ClientModal';
import useAsync from '../../../hooks/useAsync';
import { projectsApi } from '../../../api/projectsApi';
import { hrApi } from '../../../api/hrApi';
import { toApiError } from '../../../api/axiosClient';
import { PROJECT_STATUSES, PROJECT_TYPES, toOptions } from '../../../utils/projectOptions';
import { formatCurrency, formatNumber } from '../../../utils/format';

function calcWorkingDays(start, end) {
  if (!start || !end) return 1;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s) || isNaN(e) || e < s) return 1;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    if (cur.getDay() !== 0) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, count);
}

const EMPTY = {
  name: '',
  client_id: '',
  client_contract_value: '',
  project_type: 'residential',
  description: '',
  location: '',
  start_date: '',
  expected_completion: '',
  project_manager_id: '',
  architect_id: '',
  site_engineer_id: '',
  contractor_id: '',
  status: 'on-track',
};

const toDateInput = (value) => (value ? String(value).slice(0, 10) : '');

function calculateDurationMonths(startDate, completionDate) {
  if (!startDate || !completionDate) return 0;
  const start = new Date(startDate);
  const end = new Date(completionDate);
  const diff = (end - start) / (1000 * 60 * 60 * 24);
  if (diff <= 0) return 0;
  return Math.round((diff / 30.4375) * 10) / 10;
}

const TASK_STATUS_OPTIONS = [
  { value: 'on-track', label: 'On Track' },
  { value: 'needs-attention', label: 'Needs Attention' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'completed', label: 'Completed' },
];

function createEmptyTask(defaultSiteId = '', durationDays = 14) {
  return {
    tempId: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    siteId: defaultSiteId,
    description: '',
    status: 'on-track',
    startDate: '',
    endDate: '',
    durationDays,
    materials: [],
    tools: [],
    labour: [],
    misc: [],
  };
}

// Rented machines are budgeted per day (Qty x Rate/Day x Days), like labour; purchases are one-time.
function machineLineTotal(tl) {
  const days = tl.rentalType === 'Purchase' ? 1 : Number(tl.workingDays || 1);
  return Number(tl.quantity || 1) * Number(tl.cost || 0) * days;
}

export default function ProjectFormPage({ mode = 'create' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === 'edit';

  const [searchParams] = useSearchParams();
  const queryClientId = searchParams.get('client_id');

  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Client modal
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);

  // Document upload state
  const [newFiles, setNewFiles] = useState([]);
  const [existingDocs, setExistingDocs] = useState([]);

  // Manual Tasks State
  const [tasks, setTasks] = useState([]);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [workforceList, setWorkforceList] = useState([]);

  useEffect(() => {
    if (!isEdit && queryClientId) {
      setValues((v) => ({ ...v, client_id: String(queryClientId) }));
    }
  }, [isEdit, queryClientId]);

  useEffect(() => {
    hrApi.labourDirectory
      .workforceLookup()
      .then((data) => setWorkforceList(Array.isArray(data) ? data : (data?.workforce || data?.workers || [])))
      .catch((err) => {
        console.error('Failed to load workforce:', err);
        setWorkforceList([]);
      });
  }, []);

  const { data: lookups, isLoading: loadingLookups, reload: reloadLookups } = useAsync(() => projectsApi.lookups(), []);
  const { data: existing, isLoading: loadingProject, error: loadError } = useAsync(
    () => (isEdit ? projectsApi.detail(id) : Promise.resolve(null)),
    [isEdit, id]
  );

  const availableSites = existing?.sites || [];

  useEffect(() => {
    if (!existing?.project) return;
    const p = existing.project;
    setValues({
      code: p.code ?? '',
      name: p.name ?? '',
      client_id: p.client?.id ? String(p.client.id) : '',
      client_contract_value: p.clientContractValue != null ? String(p.clientContractValue) : (p.estimatedBudget != null ? String(p.estimatedBudget) : ''),
      project_type: p.projectType ?? 'residential',
      description: p.description ?? '',
      location: p.location ?? '',
      start_date: toDateInput(p.startDate),
      expected_completion: toDateInput(p.expectedCompletion),
      project_manager_id: p.team.projectManager?.id ? String(p.team.projectManager.id) : '',
      architect_id: p.team.architect?.id ? String(p.team.architect.id) : '',
      site_engineer_id: p.team.siteEngineer?.id ? String(p.team.siteEngineer.id) : '',
      contractor_id: p.contractor?.id ? String(p.contractor.id) : '',
      status: p.status ?? 'on-track',
    });

    if (existing.documents) {
      setExistingDocs(existing.documents);
    }

    if (existing.tasks && existing.tasks.length > 0) {
      setTasks(
        existing.tasks.map((t, idx) => ({
          id: t.id,
          tempId: `task-${t.id || idx}`,
          name: t.name || '',
          siteId: t.siteId ? String(t.siteId) : '',
          description: t.description || '',
          status: t.status || 'on-track',
          startDate: toDateInput(t.startDate),
          endDate: toDateInput(t.endDate),
          durationDays: Number(t.durationDays || 0) || 14,
          materials: (t.materials || []).map((m) => ({
            materialId: m.materialId || m.material_id || '',
            quantity: Number(m.quantity || 0),
            costPerUnit: Number(m.costPerUnit ?? m.cost_per_unit ?? 0),
          })),
          tools: (t.tools || []).map((tl) => ({
            toolId: tl.toolId || tl.tool_id || '',
            toolName: tl.toolName || tl.tool_name || '',
            rentalType: tl.rentalType || tl.rental_type || 'Rent',
            quantity: Number(tl.quantity || 1),
            cost: Number(tl.cost || 0),
            workingDays: Number(tl.workingDays || tl.working_days || 1),
          })),
          labour: (t.labour || []).map((l) => {
            const isCompany = (l.labourType || l.labour_type || l.worker_type || '').toLowerCase().includes('company');
            const lStart = l.start_date || l.startDate ? (l.start_date || l.startDate).slice(0, 10) : (t.start_date ? t.start_date.slice(0, 10) : '');
            const lEnd = l.end_date || l.endDate ? (l.end_date || l.endDate).slice(0, 10) : (t.end_date ? t.end_date.slice(0, 10) : '');
            const days = Number(l.workingDays ?? l.working_days ?? calcWorkingDays(lStart, lEnd));
            const wage = isCompany ? 0 : Number(l.dailyWage ?? l.daily_wage ?? 0);
            return {
              workerId: l.worker_id || l.workerId || null,
              workerType: l.worker_type || l.workerType || (isCompany ? 'company_labour' : 'labour'),
              labourName: l.person_name || l.labourName || l.labour_name || '',
              labourType: isCompany ? 'Company Labour' : 'Labour',
              skillTrade: l.person_trade || l.skill_trade || l.skillTrade || '',
              startDate: lStart,
              endDate: lEnd,
              workerCount: 1,
              dailyWage: wage,
              workingDays: days,
              remarks: l.remarks || '',
            };
          }),
          misc: (t.misc || []).map((mc) => ({
            description: mc.description || '',
            amount: Number(mc.amount || 0),
          })),
        }))
      );
    } else if (existing.phases && existing.phases.length > 0) {
      // Compatibility fallback: migrate old phase budgets into tasks if project only had phases
      const activePhases = existing.phases.filter(
        (p) =>
          (p.materials && p.materials.length > 0) ||
          (p.tools && p.tools.length > 0) ||
          (p.labour && p.labour.length > 0) ||
          (p.misc && p.misc.length > 0) ||
          Number(p.durationMonths || 0) > 0
      );
      if (activePhases.length > 0) {
        setTasks(
          activePhases.map((p, idx) => ({
            tempId: `task-migrated-${idx}`,
            name: p.title || `Phase ${p.phaseNumber} Work`,
            siteId: '',
            description: '',
            status: p.status || 'on-track',
            startDate: '',
            endDate: '',
            durationDays: Math.round(Number(p.durationMonths || 1) * 25),
            materials: (p.materials || []).map((m) => ({
              materialId: m.materialId || m.material_id || '',
              quantity: Number(m.quantity || 0),
              costPerUnit: Number(m.costPerUnit ?? m.cost_per_unit ?? 0),
            })),
            tools: (p.tools || []).map((tl) => ({
              toolId: tl.toolId || tl.tool_id || '',
              toolName: tl.toolName || tl.tool_name || '',
              rentalType: tl.rentalType || tl.rental_type || 'Rent',
              quantity: Number(tl.quantity || 1),
              cost: Number(tl.cost || 0),
              workingDays: Number(tl.workingDays || tl.working_days || 1),
            })),
            labour: (p.labour || []).map((l) => ({
              labourName: l.labourName || l.labour_name || '',
              labourType: l.labourType || l.labour_type || 'Mason',
              workerCount: Number(l.workerCount ?? l.worker_count ?? 1),
              dailyWage: Number(l.dailyWage ?? l.daily_wage ?? 0),
              workingDays: Math.round(Number(p.durationMonths || 1) * 25),
            })),
            misc: (p.misc || []).map((mc) => ({
              description: mc.description || '',
              amount: Number(mc.amount || 0),
            })),
          }))
        );
      }
    }
  }, [existing]);

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  };

  const toggleTask = (tempId) => {
    setExpandedTasks((prev) => ({ ...prev, [tempId]: !prev[tempId] }));
  };

  const updateTask = (tempId, updater) => {
    setTasks((prev) =>
      prev.map((t) => (t.tempId === tempId ? updater(t) : t))
    );
  };

  const addTask = () => {
    const defaultSiteId = availableSites[0]?.id ? String(availableSites[0].id) : '';
    const newTask = createEmptyTask(defaultSiteId);
    setTasks((prev) => [...prev, newTask]);
    setExpandedTasks((prev) => ({ ...prev, [newTask.tempId]: true }));
  };

  const removeTask = (tempId) => {
    setTasks((prev) => prev.filter((t) => t.tempId !== tempId));
  };

  // Duration
  const durationMonths = calculateDurationMonths(values.start_date, values.expected_completion);

  // Live Task Calculations
  const taskCalculations = tasks.map((t) => {
    const matTotal = (t.materials || []).reduce(
      (sum, m) => sum + (Number(m.quantity || 0) * Number(m.costPerUnit || 0)),
      0
    );
    const toolTotal = (t.tools || []).reduce(
      (sum, tl) => sum + machineLineTotal(tl),
      0
    );
    const labourTotal = (t.labour || []).reduce((sum, l) => {
      const workerCount = Number(l.workerCount ?? 1);
      const dailyWage = Number(l.dailyWage ?? 0);
      const days = Number(l.workingDays ?? t.durationDays ?? 0);
      return sum + (workerCount * dailyWage * days);
    }, 0);
    const miscTotal = (t.misc || []).reduce((sum, mc) => sum + Number(mc.amount || 0), 0);
    const taskTotal = matTotal + toolTotal + labourTotal + miscTotal;

    return {
      tempId: t.tempId,
      id: t.id,
      name: t.name,
      siteId: t.siteId,
      durationDays: Number(t.durationDays || 0),
      matTotal,
      toolTotal,
      labourTotal,
      miscTotal,
      taskTotal,
    };
  });

  const totalProjectBudget = taskCalculations.reduce((sum, c) => sum + c.taskTotal, 0);

  // Documents
  const handleFileChange = (e) => {
    if (e.target.files?.length) {
      setNewFiles((prev) => [...prev, ...Array.from(e.target.files)]);
    }
  };

  const removeNewFile = (idx) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDeleteExistingDoc = async (docId) => {
    if (!window.confirm('Are you sure you want to remove this document?')) return;
    try {
      await projectsApi.deleteDocument(id, docId);
      setExistingDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      alert(err.message || 'Could not delete document.');
    }
  };

  // Validation
  function validate() {
    const errors = {};
    if (!values.name.trim()) errors.name = 'Enter a project name.';
    if (!values.location.trim()) errors.location = 'Enter the project location.';
    if (!values.start_date) errors.start_date = 'Enter a start date.';
    if (!values.expected_completion) errors.expected_completion = 'Enter the expected completion date.';
    if (
      values.start_date &&
      values.expected_completion &&
      new Date(values.expected_completion) < new Date(values.start_date)
    ) {
      errors.expected_completion = 'Completion date cannot fall before the start date.';
    }
    if (tasks.some((t) => !t.name || !t.name.trim())) {
      errors.tasks = 'Please provide a name for all tasks, or remove empty task rows.';
    }
    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const formattedTasks = tasks
      .filter((t) => t.name && t.name.trim())
      .map((t) => {
        const durationDays = Number(t.durationDays || 0);
        return {
          id: t.id ? Number(t.id) : undefined,
          name: t.name.trim(),
          siteId: t.siteId ? Number(t.siteId) : null,
          site_id: t.siteId ? Number(t.siteId) : null,
          description: t.description ? t.description.trim() : null,
          status: t.status || 'on-track',
          startDate: t.startDate || null,
          start_date: t.startDate || null,
          endDate: t.endDate || null,
          end_date: t.endDate || null,
          durationDays,
          duration_days: durationDays,
          materials: (t.materials || [])
            .filter((m) => m.materialId)
            .map((m) => ({
              materialId: Number(m.materialId),
              material_id: Number(m.materialId),
              quantity: Number(m.quantity || 0),
              costPerUnit: Number(m.costPerUnit || 0),
              cost_per_unit: Number(m.costPerUnit || 0),
              totalCost: Number(m.quantity || 0) * Number(m.costPerUnit || 0),
            })),
          tools: (t.tools || [])
            .filter((tl) => (tl.toolName || '').trim() || tl.toolId)
            .map((tl) => ({
              toolId: tl.toolId ? Number(tl.toolId) : null,
              tool_id: tl.toolId ? Number(tl.toolId) : null,
              toolName: (tl.toolName || '').trim(),
              tool_name: (tl.toolName || '').trim(),
              rentalType: tl.rentalType || 'Rent',
              rental_type: tl.rentalType || 'Rent',
              quantity: Number(tl.quantity || 1),
              cost: Number(tl.cost || 0),
              workingDays: tl.rentalType === 'Purchase' ? 1 : Number(tl.workingDays || 1),
              working_days: tl.rentalType === 'Purchase' ? 1 : Number(tl.workingDays || 1),
              totalCost: machineLineTotal(tl),
            })),
          labour: (t.labour || []).map((l) => {
            const isCompany = l.labourType === 'Company Labour' || l.labourType === 'Company Employee' || l.workerType === 'company_labour';
            const dw = isCompany ? 0 : Number(l.dailyWage || 0);
            const wd = Number(l.workingDays || calcWorkingDays(l.startDate, l.endDate));
            return {
              workerId: l.workerId || null,
              worker_id: l.workerId || null,
              workerType: l.workerType || (isCompany ? 'company_labour' : 'labour'),
              worker_type: l.workerType || (isCompany ? 'company_labour' : 'labour'),
              labourName: (l.labourName || '').trim() || null,
              labour_name: (l.labourName || '').trim() || null,
              labourType: l.labourType || 'Labour',
              labour_type: l.labourType || 'Labour',
              skillTrade: l.skillTrade || null,
              startDate: l.startDate || null,
              start_date: l.startDate || null,
              endDate: l.endDate || null,
              end_date: l.endDate || null,
              workerCount: 1,
              worker_count: 1,
              dailyWage: dw,
              daily_wage: dw,
              workingDays: wd,
              working_days: wd,
              totalCost: isCompany ? 0 : dw * wd,
              total_cost: isCompany ? 0 : dw * wd,
              remarks: (l.remarks || '').trim() || null,
            };
          }),
          misc: (t.misc || [])
            .filter((mc) => (mc.description || '').trim())
            .map((mc) => ({
              description: (mc.description || '').trim(),
              amount: Number(mc.amount || 0),
            })),
        };
      });

    const payload = { ...values, tasks: formattedTasks };
    for (const key of ['client_id', 'project_manager_id', 'architect_id', 'site_engineer_id', 'contractor_id']) {
      payload[key] = payload[key] === '' ? null : Number(payload[key]);
    }

    if (values.client_contract_value !== '' && values.client_contract_value != null) {
      payload.client_contract_value = Number(values.client_contract_value);
      payload.clientContractValue = Number(values.client_contract_value);
    } else {
      payload.client_contract_value = totalProjectBudget > 0 ? totalProjectBudget : null;
      payload.clientContractValue = totalProjectBudget > 0 ? totalProjectBudget : null;
    }

    try {
      const saved = isEdit
        ? await projectsApi.update(id, payload)
        : await projectsApi.create(payload);

      // Upload newly attached documents
      if (newFiles.length > 0) {
        const formData = new FormData();
        newFiles.forEach((file) => formData.append('documents', file));
        await projectsApi.uploadDocuments(saved.id, formData);
      }

      navigate(`/admin/projects/${saved.id}`, {
        replace: true,
        state: { flash: isEdit ? 'Project updated with task budgets.' : 'Project created with task budgets.' },
      });
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setFormError(apiError);
      setIsSaving(false);
    }
  }

  const isLoading = loadingLookups || (isEdit && loadingProject);
  const cancelTo = isEdit ? `/admin/projects/${id}` : '/admin/projects';

  if (loadError) {
    return (
      <>
        <PageHeader title="Edit project" breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Projects', to: '/admin/projects' }, { label: 'Edit' }]} showBack />
        <Alert tone="error" title="Could not load this project">{loadError.message}</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit project' : 'New project'}
        description={isEdit ? 'Update project details, documents and task budget planning.' : 'Create project with auto-code, client assignment, documents and task budget planning.'}
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Projects', to: '/admin/projects' },
          ...(isEdit ? [{ label: existing?.project?.name ?? 'Project', to: `/admin/projects/${id}` }] : []),
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        showBack
      />

      {formError && <Alert tone="error" title="Could not save" className="mb-4">{formError.message}</Alert>}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {/* SECTION 1: Project Information */}
          <Card>
            <CardHeader title="Project Information" description="Basic project credentials and location." />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1.5">
                  Project Code
                </label>
                <div className="flex h-11 items-center rounded-xl border border-line bg-canvas-subtle px-3.5 font-mono text-sm font-semibold text-ink-muted">
                  {isEdit ? values.code || '(Auto-generated)' : 'Auto-generated by system (PRJ-XXXX)'}
                </div>
                <p className="mt-1 text-xs text-ink-subtle">Unique project identifier generated automatically upon creation.</p>
              </div>

              <InputField
                label="Project Name"
                required
                value={values.name}
                onChange={set('name')}
                error={fieldErrors.name}
                placeholder="Silverleaf Residency — Tower C"
              />

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                    Client
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsClientModalOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Client
                  </button>
                </div>
                <SelectField
                  value={values.client_id}
                  onChange={set('client_id')}
                  placeholder="Select a client"
                  options={toOptions(lookups?.clients ?? [])}
                  error={fieldErrors.client_id}
                />
              </div>

              <SelectField
                label="Project Type"
                value={values.project_type}
                onChange={set('project_type')}
                options={PROJECT_TYPES}
                error={fieldErrors.project_type}
              />

              <InputField
                label="Client Contract Value (₹)"
                type="number"
                min="0"
                step="any"
                value={values.client_contract_value}
                onChange={set('client_contract_value')}
                placeholder="Optional (defaults to task budget rollup)"
                helperText="Total contract/revenue value billed to client."
              />

              <InputField
                label="Location"
                required
                value={values.location}
                onChange={set('location')}
                error={fieldErrors.location}
                placeholder="Rajpura Road, Patiala"
                className="sm:col-span-2"
              />

              <TextAreaField
                label="Description"
                value={values.description}
                onChange={set('description')}
                rows={3}
                className="sm:col-span-2"
                placeholder="Scope of work, storeys, structural details..."
              />
            </CardBody>
          </Card>

          {/* SECTION 2: Schedule & Automatic Duration */}
          <Card>
            <CardHeader title="Schedule & Timeline" description="Project timeline with auto-calculated duration." />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <InputField
                label="Start Date"
                type="date"
                required
                value={values.start_date}
                onChange={set('start_date')}
                error={fieldErrors.start_date}
              />

              <InputField
                label="Expected Completion Date"
                type="date"
                required
                value={values.expected_completion}
                onChange={set('expected_completion')}
                error={fieldErrors.expected_completion}
              />

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1.5">
                  Expected Completion Duration
                </label>
                <div className="flex h-11 items-center rounded-xl border border-line bg-canvas-subtle px-3.5 text-sm font-semibold text-brand-700">
                  {durationMonths > 0 ? `${durationMonths} Months` : 'Select valid dates'}
                </div>
                <p className="mt-1 text-xs text-ink-subtle">Automatically calculated from Start Date to Expected Completion.</p>
              </div>

              <div className="sm:col-span-3">
                <SelectField
                  label="Project Status"
                  value={values.status}
                  onChange={set('status')}
                  options={PROJECT_STATUSES}
                  error={fieldErrors.status}
                />
              </div>
            </CardBody>
          </Card>

          {/* SECTION 3: Documents Management */}
          <Card>
            <CardHeader
              title="Project & Site Documents"
              description="Upload architectural blueprints, structural drawings, contract agreements, and site specs (PDF, Images, CAD/DWG, Word, Excel up to 25MB)."
            />
            <CardBody className="space-y-4">
              {/* Existing documents (if edit mode) */}
              {existingDocs.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2">Uploaded Documents</h4>
                  <ul className="divide-y divide-line rounded-xl border border-line bg-white">
                    {existingDocs.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between p-3 text-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-5 w-5 text-brand-700 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-ink truncate">{doc.name || doc.fileName}</p>
                            <p className="text-xs text-ink-subtle">
                              {doc.documentType} · Uploaded on {doc.uploadedOn}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={doc.downloadUrl || `/api/projects/${id}/documents/${doc.id}/download`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteExistingDoc(doc.id)}
                            className="p-1 text-red-600 hover:text-red-700"
                            aria-label="Delete document"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Upload Dropzone */}
              <div>
                <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-line p-6 hover:bg-canvas cursor-pointer">
                  <Upload className="h-8 w-8 text-brand-700 mb-2" />
                  <span className="text-sm font-semibold text-ink">Click or drag files to upload documents</span>
                  <span className="text-xs text-ink-subtle mt-1">Multiple files supported. Previously uploaded documents are preserved.</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              {/* New files queued for upload */}
              {newFiles.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2">Files queued for upload ({newFiles.length})</h4>
                  <ul className="divide-y divide-line rounded-xl border border-line bg-white">
                    {newFiles.map((file, idx) => (
                      <li key={idx} className="flex items-center justify-between p-3 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-brand-700 shrink-0" />
                          <span className="font-medium text-ink truncate">{file.name}</span>
                          <span className="text-xs text-ink-subtle">({Math.round(file.size / 1024)} KB)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeNewFile(idx)}
                          className="text-ink-subtle hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          {/* SECTION 4: Team Assignment */}
          <Card>
            <CardHeader title="Project Team" description="Assign managers, architects, engineers and contractors (optional — can be assigned later)." />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <SelectField
                label="Project Manager"
                value={values.project_manager_id}
                onChange={set('project_manager_id')}
                placeholder="Unassigned"
                options={toOptions(lookups?.projectManagers ?? [], 'full_name')}
              />
              <SelectField
                label="Architect"
                value={values.architect_id}
                onChange={set('architect_id')}
                placeholder="Unassigned"
                options={toOptions(lookups?.architects ?? [], 'full_name')}
              />
              <SelectField
                label="Site Engineer"
                value={values.site_engineer_id}
                onChange={set('site_engineer_id')}
                placeholder="Unassigned"
                options={toOptions(lookups?.siteEngineers ?? [], 'full_name')}
              />
              <SelectField
                label="Contractor"
                value={values.contractor_id}
                onChange={set('contractor_id')}
                placeholder="Unassigned"
                options={toOptions(lookups?.contractors ?? [])}
              />
            </CardBody>
          </Card>

          {/* SECTION 5: Project Tasks & Detailed Budget Planning */}
          <Card>
            <CardHeader
              title="Project Tasks & Budget Planning"
              description="Manually create tasks for this project/site. Plan detailed Materials, Machines/Tools, Labour (with individual worker names), and Miscellaneous expenses task-wise."
              action={
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={addTask}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Task
                </Button>
              }
            />
            <CardBody className="space-y-4">
              {fieldErrors.tasks && (
                <Alert tone="error" title="Tasks Validation">
                  {fieldErrors.tasks}
                </Alert>
              )}

              <datalist id="labour-roles-list">
                <option value="Mason" />
                <option value="Helper" />
                <option value="Carpenter" />
                <option value="Bar Bender" />
                <option value="Electrician" />
                <option value="Plumber" />
                <option value="Painter" />
                <option value="Welder" />
                <option value="Site Supervisor" />
                <option value="Tile Fitter" />
                <option value="Glazier" />
              </datalist>

              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-line rounded-xl bg-canvas-subtle/50">
                  <div className="h-12 w-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-3">
                    <ListTodo className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold text-ink text-sm">No Tasks Created Yet</h3>
                  <p className="text-xs text-ink-subtle max-w-md mt-1 mb-4">
                    Admin manually creates tasks for each project/site (e.g. Excavation, Foundation Work, Brick Work, Electrical Work, Flooring, Painting...). Each task includes its own materials, equipment, labour with worker names, and miscellaneous budget.
                  </p>
                  <Button type="button" variant="primary" size="sm" onClick={addTask}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add First Task
                  </Button>
                </div>
              ) : (
                tasks.map((t, tIdx) => {
                  const isExpanded = Boolean(expandedTasks[t.tempId]);
                  const calc = taskCalculations.find((c) => c.tempId === t.tempId);
                  const siteObj = availableSites.find((s) => String(s.id) === String(t.siteId));

                  return (
                    <div key={t.tempId || tIdx} className="rounded-xl border border-line bg-white overflow-hidden shadow-xs">
                      {/* Task Accordion Header */}
                      <div
                        onClick={() => toggleTask(t.tempId)}
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-canvas-subtle transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-700 font-bold text-xs shrink-0">
                            {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-ink text-sm">
                                {t.name ? t.name : `Task #${tIdx + 1} (Untitled)`}
                              </span>
                              {siteObj && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                  Site: {siteObj.name}
                                </span>
                              )}
                              <Badge tone={t.status === 'completed' ? 'neutral' : t.status === 'delayed' ? 'error' : t.status === 'needs-attention' ? 'warning' : 'brand'}>
                                {TASK_STATUS_OPTIONS.find((s) => s.value === t.status)?.label || t.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-ink-subtle mt-0.5">
                              {t.durationDays > 0 ? `${t.durationDays} days · ` : ''}
                              {calc?.taskTotal > 0 ? formatCurrency(calc.taskTotal) : 'No budget planned'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge tone={calc?.taskTotal > 0 ? 'brand' : 'neutral'}>
                            {formatCurrency(calc?.taskTotal || 0)}
                          </Badge>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Are you sure you want to remove task "${t.name || `Task #${tIdx + 1}`}"?`)) {
                                removeTask(t.tempId);
                              }
                            }}
                            title="Delete task"
                            className="text-ink-subtle hover:text-red-600 transition-colors p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-ink-subtle" /> : <ChevronRight className="h-4 w-4 text-ink-subtle" />}
                        </div>
                      </div>

                      {/* Task Expanded Content */}
                      {isExpanded && (
                        <div className="border-t border-line bg-canvas-subtle p-5 space-y-6">
                          {/* Task Details Fields */}
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 bg-white p-4 rounded-xl border border-line">
                            <div className="lg:col-span-2">
                              <InputField
                                label="Task Name"
                                required
                                value={t.name}
                                onChange={(e) => updateTask(t.tempId, (task) => ({ ...task, name: e.target.value }))}
                                placeholder="e.g. Foundation Work, Brick Work, Electrical Work..."
                              />
                            </div>

                            {availableSites.length > 0 && (
                              <div>
                                <SelectField
                                  label="Assigned Site"
                                  value={t.siteId}
                                  onChange={(e) => updateTask(t.tempId, (task) => ({ ...task, siteId: e.target.value }))}
                                  options={[
                                    { value: '', label: 'General / All Sites' },
                                    ...availableSites.map((s) => ({ value: String(s.id), label: s.name })),
                                  ]}
                                />
                              </div>
                            )}

                            <div>
                              <SelectField
                                label="Task Status"
                                value={t.status}
                                onChange={(e) => updateTask(t.tempId, (task) => ({ ...task, status: e.target.value }))}
                                options={TASK_STATUS_OPTIONS}
                              />
                            </div>

                            <div>
                              <InputField
                                label="Start Date"
                                type="date"
                                value={t.startDate}
                                onChange={(e) => {
                                  const newStart = e.target.value;
                                  updateTask(t.tempId, (task) => {
                                    let newDuration = task.durationDays;
                                    if (newStart && task.endDate) {
                                      const diff = Math.round((new Date(task.endDate) - new Date(newStart)) / (1000 * 60 * 60 * 24));
                                      if (diff > 0) newDuration = diff;
                                    }
                                    return { ...task, startDate: newStart, durationDays: newDuration };
                                  });
                                }}
                              />
                            </div>

                            <div>
                              <InputField
                                label="Expected Completion Date"
                                type="date"
                                value={t.endDate}
                                onChange={(e) => {
                                  const newEnd = e.target.value;
                                  updateTask(t.tempId, (task) => {
                                    let newDuration = task.durationDays;
                                    if (task.startDate && newEnd) {
                                      const diff = Math.round((new Date(newEnd) - new Date(task.startDate)) / (1000 * 60 * 60 * 24));
                                      if (diff > 0) newDuration = diff;
                                    }
                                    return { ...task, endDate: newEnd, durationDays: newDuration };
                                  });
                                }}
                              />
                            </div>

                            <div>
                              <InputField
                                label="Duration (Working Days)"
                                type="number"
                                min="1"
                                value={t.durationDays}
                                onChange={(e) => updateTask(t.tempId, (task) => ({ ...task, durationDays: Math.max(1, Number(e.target.value || 1)) }))}
                                placeholder="e.g. 14"
                              />
                            </div>

                            <div className="sm:col-span-2 lg:col-span-3">
                              <InputField
                                label="Task Description / Scope"
                                value={t.description}
                                onChange={(e) => updateTask(t.tempId, (task) => ({ ...task, description: e.target.value }))}
                                placeholder="Brief description of task work, milestones or requirements..."
                              />
                            </div>
                          </div>

                          {/* Table 1: Materials */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                                1. Material Budget (Total: {formatCurrency(calc?.matTotal || 0)})
                              </h4>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  updateTask(t.tempId, (task) => ({
                                    ...task,
                                    materials: [...task.materials, { materialId: '', quantity: 1, costPerUnit: 0 }],
                                  }))
                                }
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" /> Add Material
                              </Button>
                            </div>

                            {t.materials.length === 0 ? (
                              <p className="text-xs text-ink-subtle italic bg-white p-3 rounded-lg border border-line">
                                No materials added to this task.
                              </p>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border border-line bg-white">
                                <table className="w-full text-left text-xs">
                                  <thead className="border-b border-line bg-canvas-subtle text-ink-subtle font-semibold uppercase">
                                    <tr>
                                      <th className="p-2.5">Material</th>
                                      <th className="p-2.5 w-28">Quantity</th>
                                      <th className="p-2.5 w-32">Cost Per Unit (₹)</th>
                                      <th className="p-2.5 w-32">Total Cost (₹)</th>
                                      <th className="p-2.5 w-12 text-center"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-line">
                                    {t.materials.map((m, mIdx) => {
                                      const lineTotal = Number(m.quantity || 0) * Number(m.costPerUnit || 0);
                                      return (
                                        <tr key={mIdx}>
                                          <td className="p-2">
                                            <select
                                              value={m.materialId}
                                              onChange={(e) => {
                                                const selId = Number(e.target.value);
                                                const mat = lookups?.materials?.find((it) => it.id === selId);
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.materials];
                                                  copy[mIdx] = {
                                                    ...copy[mIdx],
                                                    materialId: selId,
                                                    costPerUnit: mat?.procurement_rate ? Number(mat.procurement_rate) : copy[mIdx].costPerUnit,
                                                  };
                                                  return { ...task, materials: copy };
                                                });
                                              }}
                                              className="w-full rounded-lg border border-line bg-white p-1.5 text-xs text-ink"
                                            >
                                              <option value="">Select Material</option>
                                              {lookups?.materials?.map((mat) => (
                                                <option key={mat.id} value={mat.id}>
                                                  {mat.name} ({mat.category} - {mat.unit})
                                                </option>
                                              ))}
                                            </select>
                                          </td>
                                          <td className="p-2">
                                            <input
                                              type="number"
                                              min="0"
                                              step="any"
                                              value={m.quantity}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.materials];
                                                  copy[mIdx].quantity = e.target.value;
                                                  return { ...task, materials: copy };
                                                })
                                              }
                                              className="w-full rounded-lg border border-line p-1.5 text-xs text-ink"
                                            />
                                          </td>
                                          <td className="p-2">
                                            <input
                                              type="number"
                                              min="0"
                                              step="any"
                                              value={m.costPerUnit}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.materials];
                                                  copy[mIdx].costPerUnit = e.target.value;
                                                  return { ...task, materials: copy };
                                                })
                                              }
                                              className="w-full rounded-lg border border-line p-1.5 text-xs text-ink"
                                            />
                                          </td>
                                          <td className="p-2 font-semibold text-ink">
                                            {formatCurrency(lineTotal)}
                                          </td>
                                          <td className="p-2 text-center">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                updateTask(t.tempId, (task) => ({
                                                  ...task,
                                                  materials: task.materials.filter((_, i) => i !== mIdx),
                                                }))
                                              }
                                              className="text-ink-subtle hover:text-red-600"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* Table 2: Machines & Tools */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                                2. Machines & Tools Budget (Total: {formatCurrency(calc?.toolTotal || 0)})
                              </h4>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  updateTask(t.tempId, (task) => ({
                                    ...task,
                                    tools: [...task.tools, { toolId: '', toolName: '', rentalType: 'Rent', quantity: 1, cost: 0, workingDays: Number(task.durationDays || 1) }],
                                  }))
                                }
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" /> Add Machine / Tool
                              </Button>
                            </div>

                            {t.tools.length === 0 ? (
                              <p className="text-xs text-ink-subtle italic bg-white p-3 rounded-lg border border-line">
                                No tools or machines added to this task.
                              </p>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border border-line bg-white">
                                <table className="w-full text-left text-xs">
                                  <thead className="border-b border-line bg-canvas-subtle text-ink-subtle font-semibold uppercase">
                                    <tr>
                                      <th className="p-2.5">Tool / Machine</th>
                                      <th className="p-2.5 w-28">Type</th>
                                      <th className="p-2.5 w-24">Quantity</th>
                                      <th className="p-2.5 w-28">Rate/Day or Cost (₹)</th>
                                      <th className="p-2.5 w-20">Days</th>
                                      <th className="p-2.5 w-28">Total Cost (₹)</th>
                                      <th className="p-2.5 w-12 text-center"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-line">
                                    {t.tools.map((tl, tlIdx) => {
                                      const lineTotal = machineLineTotal(tl);
                                      return (
                                        <tr key={tlIdx}>
                                          <td className="p-2">
                                            <select
                                              value={tl.toolId}
                                              onChange={(e) => {
                                                const selId = Number(e.target.value);
                                                const found = lookups?.tools?.find((it) => it.id === selId);
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.tools];
                                                  copy[tlIdx].toolId = selId;
                                                  copy[tlIdx].toolName = found ? found.name : '';
                                                  return { ...task, tools: copy };
                                                });
                                              }}
                                              className="w-full rounded-lg border border-line bg-white p-1.5 text-xs text-ink"
                                            >
                                              <option value="">Select Machine / Tool</option>
                                              {lookups?.tools?.map((toolItem) => (
                                                <option key={toolItem.id} value={toolItem.id}>
                                                  {toolItem.name} ({toolItem.type})
                                                </option>
                                              ))}
                                            </select>
                                          </td>
                                          <td className="p-2">
                                            <select
                                              value={tl.rentalType}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.tools];
                                                  copy[tlIdx].rentalType = e.target.value;
                                                  return { ...task, tools: copy };
                                                })
                                              }
                                              className="w-full rounded-lg border border-line bg-white p-1.5 text-xs text-ink"
                                            >
                                              <option value="Rent">Rent</option>
                                              <option value="Purchase">Purchase</option>
                                            </select>
                                          </td>
                                          <td className="p-2">
                                            <input
                                              type="number"
                                              min="1"
                                              value={tl.quantity}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.tools];
                                                  copy[tlIdx].quantity = e.target.value;
                                                  return { ...task, tools: copy };
                                                })
                                              }
                                              className="w-full rounded-lg border border-line p-1.5 text-xs text-ink"
                                            />
                                          </td>
                                          <td className="p-2">
                                            <input
                                              type="number"
                                              min="0"
                                              value={tl.cost}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.tools];
                                                  copy[tlIdx].cost = e.target.value;
                                                  return { ...task, tools: copy };
                                                })
                                              }
                                              className="w-full rounded-lg border border-line p-1.5 text-xs text-ink"
                                            />
                                          </td>
                                          <td className="p-2">
                                            {tl.rentalType === 'Purchase' ? (
                                              <span className="text-ink-subtle">—</span>
                                            ) : (
                                              <input
                                                type="number"
                                                min="1"
                                                value={tl.workingDays ?? 1}
                                                onChange={(e) =>
                                                  updateTask(t.tempId, (task) => {
                                                    const copy = [...task.tools];
                                                    copy[tlIdx].workingDays = e.target.value;
                                                    return { ...task, tools: copy };
                                                  })
                                                }
                                                className="w-full rounded-lg border border-line p-1.5 text-xs text-ink"
                                              />
                                            )}
                                          </td>
                                          <td className="p-2 font-semibold text-ink">
                                            {formatCurrency(lineTotal)}
                                          </td>
                                          <td className="p-2 text-center">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                updateTask(t.tempId, (task) => ({
                                                  ...task,
                                                  tools: task.tools.filter((_, i) => i !== tlIdx),
                                                }))
                                              }
                                              className="text-ink-subtle hover:text-red-600"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* Table 3: Labour (with Labour Name support) */}
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                                  3. Labour Budget (Total: {formatCurrency(calc?.labourTotal || 0)})
                                </h4>
                                <p className="text-[11px] text-ink-muted mt-0.5">
                                  Task Duration: <strong className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-semibold">{t.durationDays || 14} working days</strong>
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  updateTask(t.tempId, (task) => {
                                    const sDate = task.startDate || new Date().toISOString().slice(0, 10);
                                    const eDate = task.endDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
                                    const days = calcWorkingDays(sDate, eDate);
                                    return {
                                      ...task,
                                      labour: [
                                        ...task.labour,
                                        {
                                          workerId: null,
                                          workerType: 'labour',
                                          labourName: '',
                                          labourType: 'Labour',
                                          skillTrade: '',
                                          startDate: sDate,
                                          endDate: eDate,
                                          workerCount: 1,
                                          dailyWage: 750,
                                          workingDays: days,
                                          remarks: '',
                                        },
                                      ],
                                    };
                                  })
                                }
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" /> Add Labour
                              </Button>
                            </div>

                            {t.labour.length === 0 ? (
                              <p className="text-xs text-ink-subtle italic bg-white p-3 rounded-lg border border-line">
                                No labour assigned to this task. Click &ldquo;Add Labour&rdquo; above to assign workers from the directory.
                              </p>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border border-line bg-white">
                                <table className="w-full text-left text-xs">
                                  <thead className="border-b border-line bg-canvas-subtle text-ink-subtle font-semibold uppercase text-[11px]">
                                    <tr>
                                      <th className="p-2.5 min-w-[180px]">Role / Category</th>
                                      <th className="p-2.5 w-28 text-right">Workers</th>
                                      <th className="p-2.5 w-28 text-right">Working Days</th>
                                      <th className="p-2.5 w-32 text-right">Daily Wage (₹)</th>
                                      <th className="p-2.5 w-36 text-right">Planned Labour Cost (₹)</th>
                                      <th className="p-2.5 min-w-[140px]">Remarks</th>
                                      <th className="p-2.5 w-10 text-center"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-line">
                                    {t.labour.map((l, lIdx) => {
                                      const wc = Number(l.workerCount || 1);
                                      const wd = Number(l.workingDays || 0);
                                      const dw = Number(l.dailyWage || 0);
                                      const lineTotal = wc * wd * dw;

                                      return (
                                        <tr key={lIdx} className="hover:bg-canvas-subtle/50 transition-colors">
                                          <td className="p-2">
                                            <input
                                              type="text"
                                              value={l.role || l.labourType || ''}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  copy[lIdx] = { ...copy[lIdx], role: e.target.value, labourType: e.target.value };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              placeholder="e.g. Mason, Helper, Carpenter"
                                              className="w-full rounded-lg border border-line bg-white p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            />
                                          </td>

                                          <td className="p-2 text-right">
                                            <input
                                              type="number"
                                              min="1"
                                              value={l.workerCount || 1}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  copy[lIdx] = { ...copy[lIdx], workerCount: Math.max(1, Number(e.target.value) || 1) };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              className="w-full text-right rounded-lg border border-line p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            />
                                          </td>

                                          <td className="p-2 text-right">
                                            <input
                                              type="number"
                                              min="1"
                                              value={l.workingDays || 0}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  copy[lIdx] = { ...copy[lIdx], workingDays: Math.max(0, Number(e.target.value) || 0) };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              className="w-full text-right rounded-lg border border-line p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            />
                                          </td>

                                          <td className="p-2 text-right">
                                            <input
                                              type="number"
                                              min="0"
                                              value={l.dailyWage || 0}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  copy[lIdx] = { ...copy[lIdx], dailyWage: Math.max(0, Number(e.target.value) || 0) };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              className="w-full text-right rounded-lg border border-line p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            />
                                          </td>

                                          <td className="p-2 text-right font-semibold text-brand-700 tabular-nums">
                                            {formatCurrency(lineTotal)}
                                          </td>

                                          <td className="p-2">
                                            <input
                                              type="text"
                                              placeholder="Planning remarks..."
                                              value={l.remarks || ''}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  copy[lIdx] = { ...copy[lIdx], remarks: e.target.value };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              className="w-full rounded-lg border border-line bg-white p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            />
                                          </td>

                                          <td className="p-2 text-center">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                updateTask(t.tempId, (task) => ({
                                                  ...task,
                                                  labour: task.labour.filter((_, i) => i !== lIdx),
                                                }))
                                              }
                                              className="text-ink-subtle hover:text-red-600 transition-colors p-1"
                                              title="Remove row"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                <div className="flex items-center justify-between text-[11px] text-ink-subtle px-3 py-2 bg-canvas/30 border-t border-line">
                                  <span>💡 Formula: <strong className="text-ink font-medium">Labour Cost = Expected Working Days × Daily Wage (₹0 for Company Employee)</strong></span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Table 4: Miscellaneous */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                                4. Miscellaneous Expenses (Total: {formatCurrency(calc?.miscTotal || 0)})
                              </h4>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  updateTask(t.tempId, (task) => ({
                                    ...task,
                                    misc: [...task.misc, { description: '', amount: 0 }],
                                  }))
                                }
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" /> Add Misc Expense
                              </Button>
                            </div>

                            {t.misc.length === 0 ? (
                              <p className="text-xs text-ink-subtle italic bg-white p-3 rounded-lg border border-line">
                                No miscellaneous expenses added to this task.
                              </p>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border border-line bg-white">
                                <table className="w-full text-left text-xs">
                                  <thead className="border-b border-line bg-canvas-subtle text-ink-subtle font-semibold uppercase">
                                    <tr>
                                      <th className="p-2.5">Expense Description</th>
                                      <th className="p-2.5 w-40">Amount (₹)</th>
                                      <th className="p-2.5 w-12 text-center"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-line">
                                    {t.misc.map((mc, mcIdx) => (
                                      <tr key={mcIdx}>
                                        <td className="p-2">
                                          <input
                                            type="text"
                                            placeholder="e.g. Local transport / Municipal inspection fee / Site tea & water"
                                            value={mc.description}
                                            onChange={(e) =>
                                              updateTask(t.tempId, (task) => {
                                                const copy = [...task.misc];
                                                copy[mcIdx].description = e.target.value;
                                                return { ...task, misc: copy };
                                              })
                                            }
                                            className="w-full rounded-lg border border-line p-1.5 text-xs text-ink"
                                          />
                                        </td>
                                        <td className="p-2">
                                          <input
                                            type="number"
                                            min="0"
                                            value={mc.amount}
                                            onChange={(e) =>
                                              updateTask(t.tempId, (task) => {
                                                const copy = [...task.misc];
                                                copy[mcIdx].amount = e.target.value;
                                                return { ...task, misc: copy };
                                              })
                                            }
                                            className="w-full rounded-lg border border-line p-1.5 text-xs text-ink"
                                          />
                                        </td>
                                        <td className="p-2 text-center">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateTask(t.tempId, (task) => ({
                                                ...task,
                                                misc: task.misc.filter((_, i) => i !== mcIdx),
                                              }))
                                            }
                                            className="text-ink-subtle hover:text-red-600"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* Task Total Summary Footer */}
                          <div className="flex items-center justify-between rounded-lg bg-white p-3 border border-line text-sm font-semibold">
                            <span className="text-ink">
                              Task Total (Materials + Tools + Labour + Misc):
                            </span>
                            <span className="text-brand-700 text-base">
                              {formatCurrency(calc?.taskTotal || 0)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>

          {/* SECTION 6: Project Summary & Calculated Total Budget */}
          <Card className="border-2 border-brand-500/20 bg-brand-50/20">
            <CardHeader
              title="Project Budget Summary Table"
              description="Task-wise totals automatically rollup to establish the official project estimated budget."
            />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line bg-canvas-subtle font-semibold uppercase text-ink-subtle">
                    <tr>
                      <th className="px-5 py-3">Task Name</th>
                      {availableSites.length > 0 && <th className="px-5 py-3">Site</th>}
                      <th className="px-5 py-3 text-center">Duration</th>
                      <th className="px-5 py-3 text-center">Status</th>
                      <th className="px-5 py-3 text-right">Material</th>
                      <th className="px-5 py-3 text-right">Tools / Machines</th>
                      <th className="px-5 py-3 text-right">Labour</th>
                      <th className="px-5 py-3 text-right">Misc.</th>
                      <th className="px-5 py-3 text-right">Task Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {taskCalculations.length === 0 ? (
                      <tr>
                        <td colSpan={availableSites.length > 0 ? 9 : 8} className="px-5 py-6 text-center text-ink-subtle italic">
                          No tasks added yet. Click &quot;Add Task&quot; above to create tasks and calculate the project budget.
                        </td>
                      </tr>
                    ) : (
                      taskCalculations.map((c, idx) => {
                        const taskObj = tasks.find((t) => t.tempId === c.tempId);
                        const siteObj = availableSites.find((s) => String(s.id) === String(c.siteId));
                        return (
                          <tr key={c.tempId || idx} className="hover:bg-white/50">
                            <td className="px-5 py-3 font-medium text-ink">
                              {c.name || <span className="italic text-ink-subtle">Untitled Task #{idx + 1}</span>}
                            </td>
                            {availableSites.length > 0 && (
                              <td className="px-5 py-3 text-ink-muted">
                                {siteObj ? siteObj.name : 'General'}
                              </td>
                            )}
                            <td className="px-5 py-3 text-center text-ink-muted">
                              {c.durationDays > 0 ? `${c.durationDays} days` : '—'}
                            </td>
                            <td className="px-5 py-3 text-center">
                              <Badge tone={taskObj?.status === 'completed' ? 'neutral' : taskObj?.status === 'delayed' ? 'error' : taskObj?.status === 'needs-attention' ? 'warning' : 'brand'}>
                                {TASK_STATUS_OPTIONS.find((s) => s.value === taskObj?.status)?.label || taskObj?.status || 'on-track'}
                              </Badge>
                            </td>
                            <td className="px-5 py-3 text-right text-ink-muted">{formatCurrency(c.matTotal)}</td>
                            <td className="px-5 py-3 text-right text-ink-muted">{formatCurrency(c.toolTotal)}</td>
                            <td className="px-5 py-3 text-right text-ink-muted">{formatCurrency(c.labourTotal)}</td>
                            <td className="px-5 py-3 text-right text-ink-muted">{formatCurrency(c.miscTotal)}</td>
                            <td className="px-5 py-3 text-right font-semibold text-ink">
                              {formatCurrency(c.taskTotal)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot className="border-t-2 border-line bg-white font-bold text-sm">
                    <tr>
                      <td colSpan={availableSites.length > 0 ? 8 : 7} className="px-5 py-4 text-ink uppercase tracking-wider">
                        TOTAL PROJECT BUDGET (Sum of all tasks)
                      </td>
                      <td className="px-5 py-4 text-right text-brand-700 text-base">
                        {formatCurrency(totalProjectBudget)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardBody>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="lg" isLoading={isSaving} loadingText="Saving…">
              <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {isEdit ? 'Save Project Changes' : 'Create Project'}
            </Button>
            <Link to={cancelTo}>
              <Button type="button" variant="secondary" size="lg">
                <X className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      )}

      {/* Add Client Modal */}
      <ClientModal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        onSaved={(newClient) => {
          reloadLookups();
          setValues((prev) => ({ ...prev, client_id: String(newClient.id) }));
        }}
      />
    </>
  );
}
