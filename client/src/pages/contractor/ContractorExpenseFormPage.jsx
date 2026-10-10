import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Save,
  AlertTriangle,
  Info,
  ArrowLeft,
  Upload,
  FileCheck,
  Package,
  Receipt,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { InputField, SelectField, TextAreaField } from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import { projectsApi } from '../../api/projectsApi';
import { financeApi } from '../../api/financeApi';
import { toApiError } from '../../api/axiosClient';
import { CONTRACTOR_EXPENSE_CATEGORY_OPTIONS } from '../../utils/financeOptions';
import { formatCurrency, formatNumber } from '../../utils/format';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ContractorExpenseFormPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Mode: 'material' (consumption from warehouse inventory) or 'expense' (financial cash expense)
  const [mode, setMode] = useState(
    searchParams.get('type') === 'expense' ? 'expense' : 'material'
  );

  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingSites, setLoadingSites] = useState(false);

  // Contractor Warehouse Inventory (only available stock > 0)
  const [inventory, setInventory] = useState([]);
  const [warehouseInfo, setWarehouseInfo] = useState(null);
  const [loadingInventory, setLoadingInventory] = useState(true);

  // Material Consumption form values
  const [materialValues, setMaterialValues] = useState({
    expense_date: todayISO(),
    project_id: '',
    site_id: '',
    task_id: '',
    subtask_id: '',
    phase_number: '1',
    subcategory: '',
    material_id: '',
    quantity_used: '',
    remarks: '',
  });

  // Cash / Financial expense form values
  const [expenseValues, setExpenseValues] = useState({
    expense_date: todayISO(),
    project_id: '',
    site_id: '',
    task_id: '',
    subtask_id: '',
    category: 'Site Expense',
    amount: '',
    remarks: '',
    party_name: '',
  });

  const [billFile, setBillFile] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Load contractor's assigned projects on mount
  useEffect(() => {
    projectsApi
      .list({ pageSize: 50 })
      .then((res) => setProjects(res.projects ?? []))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, []);

  // Load contractor warehouse inventory on mount
  useEffect(() => {
    setLoadingInventory(true);
    financeApi
      .contractorInventory()
      .then((res) => {
        setWarehouseInfo(res.warehouse || null);
        // Ensure only items with availableStock > 0 are present
        const availableItems = (res.inventory || []).filter(
          (item) => Number(item.availableStock || 0) > 0
        );
        setInventory(availableItems);
      })
      .catch((err) => {
        console.error('Failed to load contractor inventory:', err);
        setInventory([]);
      })
      .finally(() => setLoadingInventory(false));
  }, []);

  // Sync active project selection between modes to load sites
  const activeProjectId =
    mode === 'material' ? materialValues.project_id : expenseValues.project_id;

  // When active project changes, load sites and tasks under that project
  useEffect(() => {
    if (!activeProjectId) {
      setSites([]);
      setTasks([]);
      setMaterialValues((v) => ({ ...v, site_id: '', task_id: '', subtask_id: '' }));
      setExpenseValues((v) => ({ ...v, site_id: '', task_id: '', subtask_id: '' }));
      return;
    }
    setLoadingSites(true);
    projectsApi
      .detail(activeProjectId)
      .then((res) => {
        setSites(res.sites ?? []);
        setTasks(res.tasks ?? []);
      })
      .catch(() => {
        setSites([]);
        setTasks([]);
      })
      .finally(() => setLoadingSites(false));
  }, [activeProjectId]);

  const subtasksOf = (taskId) => (taskId ? tasks.find((t) => String(t.id) === String(taskId))?.subtasks ?? [] : []);

  // Derived selected material details
  const selectedMaterial = useMemo(() => {
    if (!materialValues.material_id) return null;
    return inventory.find(
      (item) => String(item.material_id || item.id) === String(materialValues.material_id)
    );
  }, [inventory, materialValues.material_id]);



  // Handle Mode Switch
  const switchMode = (newMode) => {
    setMode(newMode);
    setSearchParams(newMode === 'material' ? { type: 'material' } : { type: 'expense' });
    setFieldErrors({});
    setFormError(null);
  };

  const handleMaterialChange = (field) => (e) => {
    const val = e.target.value;
    setMaterialValues((prev) => ({ ...prev, [field]: val }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleExpenseChange = (field) => (e) => {
    const val = e.target.value;
    setExpenseValues((prev) => ({ ...prev, [field]: val }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setBillFile(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFieldErrors((prev) => ({ ...prev, bill: 'File size must be 10 MB or less.' }));
      setBillFile(null);
      return;
    }
    setFieldErrors((prev) => ({ ...prev, bill: undefined }));
    setBillFile(file);
  };

  // Cash expense checks
  const isInvoicePayment = expenseValues.category === 'Invoice Payment';
  const isAdvanceWages = expenseValues.category === 'Advance Wages';
  const isRoomRent = ['Room Rent', 'Labour Room Rent'].includes(expenseValues.category);

  // Submit Material Consumption
  async function handleMaterialSubmit(e) {
    e.preventDefault();
    setFormError(null);
    const errors = {};

    if (!materialValues.project_id) errors.project_id = 'Select an assigned project.';
    if (!materialValues.material_id) errors.material_id = 'Select a material or tool.';
    if (tasks.length > 0 && !materialValues.task_id) errors.task_id = 'Select a task.';

    const qty = Number(materialValues.quantity_used);
    if (!materialValues.quantity_used || isNaN(qty) || qty <= 0) {
      errors.quantity_used = 'Enter a quantity greater than zero.';
    } else if (selectedMaterial && qty > Number(selectedMaterial.availableStock)) {
      errors.quantity_used = `Quantity (${qty} ${selectedMaterial.unit}) cannot exceed available stock (${selectedMaterial.availableStock} ${selectedMaterial.unit}).`;
    }

    if (!materialValues.expense_date) errors.expense_date = 'Enter the date.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      await financeApi.recordConsumption({
        project_id: materialValues.project_id,
        site_id: materialValues.site_id ? materialValues.site_id : null,
        task_id: materialValues.task_id ? Number(materialValues.task_id) : undefined,
        subtask_id: materialValues.task_id && materialValues.subtask_id ? Number(materialValues.subtask_id) : undefined,
        phase_number: Number(materialValues.phase_number || 1),
        subcategory: materialValues.subcategory || 'General Work',
        material_id: Number(materialValues.material_id),
        quantity_used: qty,
        expense_date: materialValues.expense_date,
        remarks: materialValues.remarks?.trim() || null,
      });

      navigate('/contractor/expenses');
    } catch (caught) {
      const apiErr = toApiError(caught);
      if (apiErr.details) {
        setFieldErrors(apiErr.details);
      }
      setFormError(apiErr.message || 'Could not record material consumption.');
    } finally {
      setSubmitting(false);
    }
  }

  // Submit Cash / General Expense
  async function handleExpenseSubmit(e) {
    e.preventDefault();
    setFormError(null);
    const errors = {};

    if (!expenseValues.project_id) errors.project_id = 'Select an assigned project.';
    if (!expenseValues.category) errors.category = 'Select an expense category.';
    if (!expenseValues.amount || Number(expenseValues.amount) <= 0) {
      errors.amount = 'Enter an amount greater than zero.';
    }
    if (!expenseValues.expense_date) errors.expense_date = 'Enter the expense date.';

    if (isInvoicePayment && !expenseValues.party_name?.trim()) {
      errors.party_name = 'Party Name is mandatory for Invoice Payment.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('project_id', expenseValues.project_id);
      if (expenseValues.site_id) formData.append('site_id', expenseValues.site_id);
      if (expenseValues.task_id) formData.append('task_id', expenseValues.task_id);
      if (expenseValues.task_id && expenseValues.subtask_id) formData.append('subtask_id', expenseValues.subtask_id);
      formData.append('category', expenseValues.category);
      formData.append('amount', expenseValues.amount);
      formData.append('expense_date', expenseValues.expense_date);
      if (expenseValues.remarks?.trim()) {
        formData.append('remarks', expenseValues.remarks.trim());
        formData.append('description', expenseValues.remarks.trim());
      } else {
        formData.append('description', expenseValues.category);
      }
      if (expenseValues.party_name?.trim()) {
        formData.append('party_name', expenseValues.party_name.trim());
        formData.append('paid_by', expenseValues.party_name.trim());
      }
      if (billFile) {
        formData.append('bill', billFile);
      }

      await financeApi.createExpense(formData);
      navigate('/contractor/expenses');
    } catch (caught) {
      const apiErr = toApiError(caught);
      if (apiErr.details) {
        setFieldErrors(apiErr.details);
      }
      setFormError(apiErr.message || 'Could not save expense.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title={mode === 'material' ? 'Record Material Usage' : 'Add Daily Expense'}
        description={
          mode === 'material'
            ? 'Consume materials and tools directly from your warehouse inventory for site construction work.'
            : 'Record a site cash expense against your assigned project. It will be routed for Admin / Finance approval.'
        }
        breadcrumbs={[
          { label: 'Dashboard', to: '/contractor' },
          { label: 'Daily Expenses', to: '/contractor/expenses' },
          { label: mode === 'material' ? 'Material Usage' : 'New Expense' },
        ]}
      />

      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      {/* Mode Switcher Tabs */}
      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-line pb-3">
        <button
          type="button"
          onClick={() => switchMode('material')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            mode === 'material'
              ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-500/20'
              : 'bg-white text-ink-muted hover:bg-canvas hover:text-ink border border-line'
          }`}
        >
          <Package className="h-4 w-4" />
          Material / Tool Usage from Inventory
        </button>

        <button
          type="button"
          onClick={() => switchMode('expense')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            mode === 'expense'
              ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-500/20'
              : 'bg-white text-ink-muted hover:bg-canvas hover:text-ink border border-line'
          }`}
        >
          <Receipt className="h-4 w-4" />
          General / Cash Expense
        </button>
      </div>

      {/* MODE 1: MATERIAL / TOOL CONSUMPTION */}
      {mode === 'material' && (
        <form onSubmit={handleMaterialSubmit} noValidate>
          <Card className="max-w-3xl">
            <CardHeader
              title="Material / Tool Consumption"
              description="Deducts stock directly from your contractor warehouse and records work progress under the selected phase."
            />
            <CardBody className="space-y-5">
              {/* Warehouse Inventory Notice */}
              {loadingInventory ? (
                <div className="rounded-lg bg-canvas p-3 text-xs text-ink-subtle">
                  Loading available materials from your warehouse inventory…
                </div>
              ) : inventory.length === 0 ? (
                <Alert tone="warning" className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                  <span>
                    <strong>No Stock Available:</strong> There are currently no materials or tools with available stock in your warehouse ({warehouseInfo?.name || 'Contractor Store'}). Stock dispatched or transferred from Main Store will automatically appear here.
                  </span>
                </Alert>
              ) : (
                <div className="flex items-center justify-between rounded-lg bg-brand-50 border border-brand-200/60 px-3.5 py-2.5 text-xs text-brand-900">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-brand-600" />
                    <span>
                      <strong>Inventory Source:</strong> {warehouseInfo?.name || 'Contractor Warehouse'} ({inventory.length} item{inventory.length === 1 ? '' : 's'} available)
                    </span>
                  </div>
                  <Badge tone="positive">Live Inventory</Badge>
                </div>
              )}

              {/* Material Selection Dropdown */}
              <div className="space-y-2">
                <SelectField
                  label="Material / Tool *"
                  required
                  value={materialValues.material_id}
                  onChange={handleMaterialChange('material_id')}
                  error={fieldErrors.material_id}
                  disabled={loadingInventory || inventory.length === 0}
                  placeholder={
                    loadingInventory
                      ? 'Loading inventory…'
                      : inventory.length === 0
                      ? 'No materials available in stock'
                      : 'Select a material or tool from your inventory'
                  }
                  options={inventory.map((item) => ({
                    value: String(item.material_id || item.id),
                    label: `${item.name} (${item.code}) — Available: ${item.availableStock} ${item.unit}`,
                  }))}
                />

                {/* Available Stock & Unit Badge Callout */}
                {selectedMaterial && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3 text-xs">
                    <div>
                      <span className="text-ink-subtle block">Material Name</span>
                      <strong className="text-ink font-semibold">{selectedMaterial.name}</strong>
                    </div>
                    <div>
                      <span className="text-ink-subtle block">Available Stock</span>
                      <strong className="text-brand-700 font-semibold text-sm">
                        {formatNumber(selectedMaterial.availableStock)} {selectedMaterial.unit}
                      </strong>
                    </div>
                    <div>
                      <span className="text-ink-subtle block">Unit</span>
                      <strong className="text-ink font-semibold">{selectedMaterial.unit}</strong>
                    </div>
                    <div>
                      <span className="text-ink-subtle block">Standard Rate</span>
                      <span className="text-ink-muted">
                        {selectedMaterial.defaultRate
                          ? `₹${selectedMaterial.defaultRate} / ${selectedMaterial.unit}`
                          : '—'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Quantity Used Input */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <InputField
                    label={`Quantity Used ${selectedMaterial ? `(${selectedMaterial.unit})` : ''} *`}
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selectedMaterial ? selectedMaterial.availableStock : undefined}
                    required
                    placeholder="Enter quantity consumed"
                    value={materialValues.quantity_used}
                    onChange={handleMaterialChange('quantity_used')}
                    error={fieldErrors.quantity_used}
                    disabled={!selectedMaterial}
                  />

                  {/* Live Remaining Stock Preview */}
                  {selectedMaterial && Number(materialValues.quantity_used) > 0 && (
                    <p
                      className={`mt-1 text-xs ${
                        Number(materialValues.quantity_used) > Number(selectedMaterial.availableStock)
                          ? 'text-danger-700 font-medium'
                          : 'text-emerald-700'
                      }`}
                    >
                      {Number(materialValues.quantity_used) > Number(selectedMaterial.availableStock)
                        ? `Cannot exceed available stock of ${selectedMaterial.availableStock} ${selectedMaterial.unit}`
                        : `Stock remaining after usage: ${(
                            Number(selectedMaterial.availableStock) -
                            Number(materialValues.quantity_used)
                          ).toFixed(2)} ${selectedMaterial.unit}`}
                    </p>
                  )}
                </div>

                <InputField
                  label="Date *"
                  type="date"
                  required
                  value={materialValues.expense_date}
                  onChange={handleMaterialChange('expense_date')}
                  error={fieldErrors.expense_date}
                />
              </div>

              {/* Project & Site */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField
                  label="Project *"
                  required
                  value={materialValues.project_id}
                  onChange={handleMaterialChange('project_id')}
                  error={fieldErrors.project_id}
                  disabled={loadingProjects}
                  placeholder="Select assigned project"
                  options={projects.map((p) => ({
                    value: String(p.id),
                    label: `${p.name} (${p.code})`,
                  }))}
                />

                <SelectField
                  label="Site (Optional)"
                  value={materialValues.site_id}
                  onChange={handleMaterialChange('site_id')}
                  error={fieldErrors.site_id}
                  disabled={!materialValues.project_id || loadingSites}
                  placeholder={
                    loadingSites
                      ? 'Loading sites…'
                      : sites.length === 0
                      ? 'No sites under this project'
                      : 'Select assigned site'
                  }
                  options={sites.map((s) => ({
                    value: String(s.id),
                    label: s.name,
                  }))}
                />
              </div>

              {/* Task Scope */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField
                  label="Task / Work Scope *"
                  required={tasks.length > 0}
                  value={materialValues.task_id}
                  onChange={(e) => {
                    const tId = e.target.value;
                    const selectedTask = tasks.find((t) => String(t.id) === String(tId));
                    setMaterialValues((v) => ({
                      ...v,
                      task_id: tId,
                      subtask_id: '',
                      subcategory: selectedTask ? selectedTask.name : v.subcategory,
                    }));
                  }}
                  error={fieldErrors.task_id}
                  placeholder={tasks.length === 0 ? 'General Project Work' : 'Select task'}
                  options={tasks.map((t) => ({
                    value: String(t.id),
                    label: t.name,
                  }))}
                />

                {subtasksOf(materialValues.task_id).length > 0 && (
                  <SelectField
                    label="Subtask"
                    value={materialValues.subtask_id}
                    onChange={(e) => {
                      const stId = e.target.value;
                      const st = subtasksOf(materialValues.task_id).find((x) => String(x.id) === stId);
                      setMaterialValues((v) => ({ ...v, subtask_id: stId, subcategory: st ? st.name : v.subcategory }));
                    }}
                    error={fieldErrors.subtask_id}
                    placeholder="Main task (not a specific subtask)"
                    options={subtasksOf(materialValues.task_id).map((st) => ({ value: String(st.id), label: st.name }))}
                  />
                )}

                <InputField
                  label="Work Details / Scope"
                  value={materialValues.subcategory}
                  onChange={handleMaterialChange('subcategory')}
                  placeholder="e.g. Column footing, plastering, floor work..."
                />
              </div>

              {/* Remarks / Work Done Notes */}
              <TextAreaField
                label="Remarks / Work Done Notes"
                rows={3}
                placeholder="e.g. Consumed for foundation column footing work on North block..."
                value={materialValues.remarks}
                onChange={handleMaterialChange('remarks')}
                error={fieldErrors.remarks}
              />

              {/* Financial Calculation Note */}
              {selectedMaterial &&
                Number(materialValues.quantity_used) > 0 &&
                Number(materialValues.quantity_used) <= Number(selectedMaterial.availableStock) && (
                  <div className="rounded-lg bg-canvas p-3 border border-line text-xs text-ink-subtle flex items-center justify-between">
                    <span>
                      Expense logged against project budget:
                    </span>
                    <strong className="text-ink font-semibold text-sm">
                      {formatCurrency(
                        Number(materialValues.quantity_used) *
                          Number(selectedMaterial.defaultRate || 0)
                      )}
                    </strong>
                  </div>
                )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
                <Link to="/contractor/expenses">
                  <Button variant="ghost" type="button">
                    Cancel
                  </Button>
                </Link>
                <Button
                  type="submit"
                  isLoading={submitting}
                  disabled={inventory.length === 0}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  Record & Deduct Material Usage
                </Button>
              </div>
            </CardBody>
          </Card>
        </form>
      )}

      {/* MODE 2: CASH / FINANCIAL EXPENSE */}
      {mode === 'expense' && (
        <form onSubmit={handleExpenseSubmit} noValidate>
          <Card className="max-w-3xl">
            <CardHeader
              title="General / Cash Expense Details"
              description="Record a site expenditure requiring monetary reimbursement or finance review."
            />
            <CardBody className="space-y-4">
              {/* Special Category Alerts */}
              {isAdvanceWages && (
                <Alert tone="warning" className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                  <span>
                    <strong>Warning:</strong> Avoid giving advance payment to labour.
                  </span>
                </Alert>
              )}

              {isRoomRent && (
                <Alert tone="info" className="flex items-center gap-2">
                  <Info className="h-5 w-5 shrink-0 text-blue-600" />
                  <span>
                    <strong>Notice:</strong> Room Rent requires Project Head approval before acceptance/payment.
                  </span>
                </Alert>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InputField
                  label="Date"
                  type="date"
                  required
                  value={expenseValues.expense_date}
                  onChange={handleExpenseChange('expense_date')}
                  error={fieldErrors.expense_date}
                />

                <InputField
                  label="Amount (₹)"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={expenseValues.amount}
                  onChange={handleExpenseChange('amount')}
                  error={fieldErrors.amount}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField
                  label="Project"
                  required
                  value={expenseValues.project_id}
                  onChange={handleExpenseChange('project_id')}
                  error={fieldErrors.project_id}
                  disabled={loadingProjects}
                  placeholder="Select an assigned project"
                  options={projects.map((p) => ({
                    value: String(p.id),
                    label: `${p.name} (${p.code})`,
                  }))}
                />

                <SelectField
                  label="Site (Optional)"
                  value={expenseValues.site_id}
                  onChange={handleExpenseChange('site_id')}
                  error={fieldErrors.site_id}
                  disabled={!expenseValues.project_id || loadingSites}
                  placeholder={
                    loadingSites
                      ? 'Loading sites…'
                      : sites.length === 0
                      ? 'No assigned sites under this project'
                      : 'Select a site (optional)'
                  }
                  options={sites.map((s) => ({
                    value: String(s.id),
                    label: s.name,
                  }))}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField
                  label="Task (Optional)"
                  value={expenseValues.task_id}
                  onChange={(e) => {
                    const tId = e.target.value;
                    setExpenseValues((v) => ({ ...v, task_id: tId, subtask_id: '' }));
                  }}
                  error={fieldErrors.task_id}
                  disabled={!expenseValues.project_id}
                  placeholder={tasks.length === 0 ? 'No tasks on this project' : 'Not linked to a task'}
                  options={tasks
                    .filter((t) => !expenseValues.site_id || !t.siteId || String(t.siteId) === String(expenseValues.site_id))
                    .map((t) => ({ value: String(t.id), label: t.name }))}
                />
                <SelectField
                  label="Subtask (Optional)"
                  value={expenseValues.subtask_id}
                  onChange={handleExpenseChange('subtask_id')}
                  error={fieldErrors.subtask_id}
                  disabled={subtasksOf(expenseValues.task_id).length === 0}
                  placeholder={subtasksOf(expenseValues.task_id).length ? 'Main task (not a specific subtask)' : 'No subtasks on this task'}
                  options={subtasksOf(expenseValues.task_id).map((st) => ({ value: String(st.id), label: st.name }))}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField
                  label="Category"
                  required
                  value={expenseValues.category}
                  onChange={handleExpenseChange('category')}
                  error={fieldErrors.category}
                  options={CONTRACTOR_EXPENSE_CATEGORY_OPTIONS.filter(
                    (c) => c.value !== 'Material Consumption'
                  )}
                />

                <InputField
                  label={isInvoicePayment ? 'Party Name *' : 'Party Name'}
                  required={isInvoicePayment}
                  placeholder={
                    isInvoicePayment
                      ? 'Enter payee / vendor / party name'
                      : 'Optional payee name'
                  }
                  value={expenseValues.party_name}
                  onChange={handleExpenseChange('party_name')}
                  error={fieldErrors.party_name}
                />
              </div>

              <TextAreaField
                label="Remarks / Description"
                rows={3}
                placeholder="Provide reason or notes for this expense..."
                value={expenseValues.remarks}
                onChange={handleExpenseChange('remarks')}
                error={fieldErrors.description || fieldErrors.remarks}
              />

              {/* Bill / Receipt Upload */}
              <div className="rounded-lg border border-dashed border-line p-4 bg-canvas/40">
                <label className="block text-sm font-medium text-ink mb-1">
                  Upload Bill / Receipt (Optional)
                </label>
                <p className="text-xs text-ink-subtle mb-3">
                  Attach an invoice or receipt: JPG, PNG, or PDF up to 10 MB.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    id="bill-upload"
                    accept="image/jpeg,image/png,application/pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <label htmlFor="bill-upload">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      as="span"
                      className="cursor-pointer gap-1.5"
                    >
                      <Upload className="h-4 w-4" />
                      {billFile ? 'Change File' : 'Choose File'}
                    </Button>
                  </label>
                  {billFile ? (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium truncate max-w-xs">
                      <FileCheck className="h-4 w-4 shrink-0" />
                      {billFile.name} ({(billFile.size / 1024).toFixed(0)} KB)
                    </span>
                  ) : (
                    <span className="text-xs text-ink-subtle">No file selected</span>
                  )}
                </div>
                {fieldErrors.bill && (
                  <p className="mt-1.5 text-xs text-danger-700">{fieldErrors.bill}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
                <Link to="/contractor/expenses">
                  <Button variant="ghost" type="button">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" isLoading={submitting} className="gap-2">
                  <Save className="h-4 w-4" />
                  Submit Daily Expense
                </Button>
              </div>
            </CardBody>
          </Card>
        </form>
      )}
    </>
  );
}
