import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Camera,
  Image as ImageIcon,
  CheckCircle2,
  Calendar,
  Layers,
  MapPin,
  Building2,
  AlertCircle,
  X,
  ExternalLink,
  UploadCloud,
  FileCheck,
  Package,
  Users,
  Plus,
  Trash2,
  Download,
  Search,
  Filter,
  CheckSquare,
  Square,
  Eye,
  FileSpreadsheet,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { projectsApi } from '../../api/projectsApi';
import { dailyWorkApi } from '../../api/dailyWorkApi';
import { financeApi } from '../../api/financeApi';
import { tasksApi } from '../../api/tasksApi';
import { hrApi } from '../../api/hrApi';
import DailyWorkDetailModal from '../../components/dailyWork/DailyWorkDetailModal';
import { formatDate, formatNumber, formatCurrency } from '../../utils/format';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ContractorDailyWorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialProjectId = searchParams.get('projectId');
  const initialSiteId = searchParams.get('siteId');
  const initialTaskId = searchParams.get('taskId');
  const initialTab = searchParams.get('tab') || 'table';

  // Active view tab: 'table' or 'form'
  const [activeTab, setActiveTab] = useState(initialTab);

  // Form state
  const [projectId, setProjectId] = useState(initialProjectId || '');
  const [siteId, setSiteId] = useState(initialSiteId || '');
  const [taskId, setTaskId] = useState(initialTaskId || '');
  const [workDate, setWorkDate] = useState(todayISO());
  const [workDone, setWorkDone] = useState('');
  const [progressPercentage, setProgressPercentage] = useState(50);
  const [workStatus, setWorkStatus] = useState('in-progress');
  const [remarks, setRemarks] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);

  // Material usage state from contractor warehouse
  const [inventory, setInventory] = useState([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [quantityUsed, setQuantityUsed] = useState('');
  const [miscDescription, setMiscDescription] = useState('');
  const [miscAmount, setMiscAmount] = useState('');
  const [miscRemarks, setMiscRemarks] = useState('');
  const [currentTaskDetail, setCurrentTaskDetail] = useState(null);
  const [excessReason, setExcessReason] = useState('');

  // Assigned task workers and logged workers
  const [taskAssignedLabour, setTaskAssignedLabour] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [workforceLookupList, setWorkforceLookupList] = useState([]);
  const [workerSearchTerm, setWorkerSearchTerm] = useState('');
  const [showAddWorkerDropdown, setShowAddWorkerDropdown] = useState(false);

  // Data & loading state
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Table filtering and search
  const [tableSearch, setTableSearch] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterSiteId, setFilterSiteId] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Detail Modal state
  const [selectedDetailId, setSelectedDetailId] = useState(null);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const loadInventory = useCallback(() => {
    financeApi
      .contractorInventory()
      .then((data) => setInventory(data.inventory || []))
      .catch((err) => console.error('Error fetching contractor inventory:', err));
  }, []);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  // Load workforce lookup for adding any other available worker
  useEffect(() => {
    if (hrApi?.labourDirectory?.workforceLookup) {
      hrApi.labourDirectory
        .workforceLookup()
        .then((data) => setWorkforceLookupList(Array.isArray(data) ? data : (data?.workers || data?.workforce || [])))
        .catch((err) => {
          console.error('Error fetching workforce lookup:', err);
          setWorkforceLookupList([]);
        });
    }
  }, []);

  // Load contractor's assigned projects
  useEffect(() => {
    projectsApi
      .list({ pageSize: 50 })
      .then((data) => {
        const list = data.projects || [];
        setProjects(list);
        if (list.length > 0 && !projectId) {
          setProjectId(String(list[0].id));
        }
      })
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  // When project changes, fetch its sites
  useEffect(() => {
    if (!projectId) {
      setSites([]);
      setSiteId('');
      return;
    }
    projectsApi
      .detail(projectId)
      .then((detail) => {
        const prjSites = detail.sites || [];
        setSites(prjSites);
        if (prjSites.length > 0) {
          const found = prjSites.find((s) => String(s.id) === String(initialSiteId));
          setSiteId(found ? String(found.id) : String(prjSites[0].id));
        } else {
          setSiteId('');
        }
      })
      .catch((err) => console.error('Error fetching project sites:', err));
  }, [projectId, initialSiteId]);

  // When project or site changes, fetch the tasks for that project/site
  useEffect(() => {
    if (!projectId) {
      setTasks([]);
      setTaskId('');
      return;
    }
    setTasksLoading(true);
    tasksApi
      .list({ projectId, siteId: siteId || undefined })
      .then((taskList) => {
        const list = taskList || [];
        setTasks(list);
        if (list.length > 0) {
          const matchInitial = initialTaskId
            ? list.find((t) => String(t.id) === String(initialTaskId))
            : null;
          if (matchInitial) {
            setTaskId(String(matchInitial.id));
            setProgressPercentage(matchInitial.progress || 50);
          } else if (!taskId || !list.some((t) => String(t.id) === String(taskId))) {
            setTaskId(String(list[0].id));
            setProgressPercentage(list[0].progress || 50);
          }
        } else {
          setTaskId('');
        }
      })
      .catch((err) => console.error('Error fetching tasks:', err))
      .finally(() => setTasksLoading(false));
  }, [projectId, siteId, initialTaskId]);

  // When taskId changes, fetch full task details to auto-populate assigned labour and budget utilization
  useEffect(() => {
    if (!taskId) {
      setTaskAssignedLabour([]);
      setCurrentTaskDetail(null);
      return;
    }
    tasksApi
      .detail(taskId)
      .then((taskDetail) => {
        if (!taskDetail) return;
        setCurrentTaskDetail(taskDetail);
        const assigned = (taskDetail.assignedWorkers && taskDetail.assignedWorkers.length > 0)
          ? taskDetail.assignedWorkers
          : (taskDetail.labour || []);
        setTaskAssignedLabour(assigned);

        // Pre-populate workers list from actual assigned workers
        if (assigned.length > 0) {
          const initialWorkers = assigned.map((l) => ({
            workerId: l.workerId || l.worker_id || null,
            workerType: l.workerType || l.worker_type || 'daily_wage',
            workerName: l.workerName || l.labourName || l.person_name || 'Worker',
            workerCode: l.workerCode || l.person_code || null,
            phone: l.phone || l.person_phone || null,
            aadhaarNumber: l.aadhaarNumber || l.person_aadhaar || null,
            labourType: l.trade || l.labourType || l.skillTrade || 'General Labour',
            hoursWorked: 8,
            dailyWage: (l.workerType === 'company_employee' || String(l.labourType).toLowerCase().includes('company')) ? 0 : Number(l.dailyWage || l.daily_wage || 750),
            workPerformed: '',
            isPresent: true,
          }));
          setWorkers(initialWorkers);
        } else {
          setWorkers([]);
        }
      })
      .catch((err) => {
        console.error('Error fetching task details for labour:', err);
      });
  }, [taskId]);

  const handleTaskChange = (selectedId) => {
    setTaskId(selectedId);
    const chosen = tasks.find((t) => String(t.id) === String(selectedId));
    if (chosen) {
      setProgressPercentage(chosen.progress || 50);
    }
  };

  // Helper functions for worker rows
  const handleToggleWorkerPresence = (index) => {
    setWorkers((prev) =>
      prev.map((w, i) => (i === index ? { ...w, isPresent: !w.isPresent } : w))
    );
  };

  const handleAddWorkerFromWorkforce = (worker) => {
    // Prevent duplicate
    const exists = workers.some(
      (w) =>
        (w.workerId && w.workerId === worker.id && w.workerType === worker.workerType) ||
        (w.workerName && w.workerName.toLowerCase() === worker.name.toLowerCase())
    );
    if (exists) {
      setShowAddWorkerDropdown(false);
      return;
    }

    setWorkers((prev) => [
      ...prev,
      {
        workerId: worker.id,
        workerType: worker.workerType,
        workerName: worker.name,
        workerCode: worker.code || '',
        labourType: worker.trade || (worker.workerType === 'company_employee' ? 'Company Employee' : 'Labour'),
        hoursWorked: 8,
        dailyWage: Number(worker.wage || 0),
        workPerformed: '',
        isPresent: true,
      },
    ]);
    setShowAddWorkerDropdown(false);
    setWorkerSearchTerm('');
  };

  const handleAddManualWorker = () => {
    setWorkers((prev) => [
      ...prev,
      {
        workerId: null,
        workerType: 'labour',
        workerName: '',
        workerCode: '',
        labourType: 'Labour',
        hoursWorked: 8,
        dailyWage: 600,
        workPerformed: '',
        isPresent: true,
      },
    ]);
  };

  const handleUpdateWorker = (index, field, value) => {
    setWorkers((prev) =>
      prev.map((w, i) => (i === index ? { ...w, [field]: value } : w))
    );
  };

  const handleRemoveWorker = (index) => {
    setWorkers((prev) => prev.filter((_, i) => i !== index));
  };

  // Load recent updates
  const loadUpdates = useCallback(() => {
    dailyWorkApi
      .list({ pageSize: 100 })
      .then((data) => setUpdates(data.updates || []))
      .catch((err) => console.error('Error loading daily work updates:', err));
  }, []);

  useEffect(() => {
    loadUpdates();
  }, [loadUpdates]);

  // Handle Photo selection from camera or gallery
  function handlePhotoAdd(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos = [...selectedPhotos, ...files];
    setSelectedPhotos(newPhotos);

    // Create preview URLs
    const newPreviews = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    setPreviewUrls((prev) => [...prev, ...newPreviews]);
  }

  function handleRemovePhoto(index) {
    setSelectedPhotos((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => {
      if (prev[index]?.url) URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }

  // Live calculation of spending for this update
  const selectedMaterial = inventory.find((m) => String(m.material_id) === String(selectedMaterialId));
  const liveMaterialCost = useMemo(() => {
    if (!selectedMaterialId || !quantityUsed || Number(quantityUsed) <= 0) return 0;
    const rate = Number(selectedMaterial?.costPerUnit || selectedMaterial?.cost_per_unit || selectedMaterial?.default_rate || selectedMaterial?.defaultRate || 0);
    return Number((Number(quantityUsed) * rate).toFixed(2));
  }, [selectedMaterialId, quantityUsed, selectedMaterial]);

  const liveMiscCost = useMemo(() => {
    return miscAmount && Number(miscAmount) > 0 ? Number(miscAmount) : 0;
  }, [miscAmount]);

  const liveLabourCost = useMemo(() => {
    return workers
      .filter((w) => w.isPresent !== false && w.workerName && w.workerName.trim())
      .reduce((sum, w) => {
        const isEmployee = w.workerType === 'company_employee' || String(w.labourType || '').toLowerCase().includes('company');
        if (isEmployee) return sum;
        const hours = Number(w.hoursWorked || 8);
        const wage = Number(w.dailyWage || 0);
        return sum + (hours / 8) * wage;
      }, 0);
  }, [workers]);

  const liveUpdateTotal = Number((liveMaterialCost + liveMiscCost + liveLabourCost).toFixed(2));

  // Current task budget and actuals
  const taskBudgetUtilization = currentTaskDetail?.budgetUtilization;
  const currentActual = Number(taskBudgetUtilization?.total?.actual || 0);
  const approvedBudget = Number(taskBudgetUtilization?.total?.effectiveBudget || Number(currentTaskDetail?.total_budget || 0));
  const projectedTotal = Number((currentActual + liveUpdateTotal).toFixed(2));
  const isOverBudget = approvedBudget > 0 && projectedTotal > approvedBudget;
  const excessAmount = Math.max(0, Number((projectedTotal - approvedBudget).toFixed(2)));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!projectId || !siteId) {
      setError(new Error('Please select both a Project and a Site.'));
      return;
    }
    if (!workDone.trim()) {
      setError(new Error('Please describe the work executed today.'));
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    if (!taskId) {
      setError(new Error('Please select an active Task. Daily work updates must be recorded against a specific task.'));
      setSubmitting(false);
      return;
    }

    if (isOverBudget && !excessReason.trim()) {
      setError(new Error(`This update will exceed the approved task budget by ₹${excessAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}. Please provide a mandatory excess budget justification/reason below.`));
      setSubmitting(false);
      return;
    }

    if (selectedMaterialId) {
      const qty = Number(quantityUsed);
      if (!(qty > 0)) {
        setError(new Error('Please enter a valid quantity greater than zero for material used.'));
        setSubmitting(false);
        return;
      }
      if (selectedMaterial && qty > selectedMaterial.availableStock) {
        setError(new Error(`Quantity used (${qty} ${selectedMaterial.unit}) cannot exceed available stock (${selectedMaterial.availableStock} ${selectedMaterial.unit}).`));
        setSubmitting(false);
        return;
      }
    }

    try {
      const formData = new FormData();
      formData.append('project_id', projectId);
      if (siteId) formData.append('site_id', siteId);
      formData.append('task_id', taskId);
      formData.append('work_date', workDate);
      formData.append('work_done', workDone.trim());
      formData.append('progress_percentage', progressPercentage);
      formData.append('work_status', workStatus);
      if (remarks.trim()) formData.append('remarks', remarks.trim());
      if (excessReason.trim()) formData.append('excess_reason', excessReason.trim());

      // Only include workers who were marked as present/working
      const presentWorkers = workers.filter((w) => w.isPresent !== false && w.workerName && w.workerName.trim());
      if (presentWorkers.length > 0) {
        formData.append(
          'workers',
          JSON.stringify(
            presentWorkers.map((w) => ({
              worker_id: w.workerId || null,
              worker_type: w.workerType || 'labour',
              worker_name: w.workerName.trim(),
              worker_code: w.workerCode || null,
              labour_type: w.labourType || 'Labour',
              hours_worked: Number(w.hoursWorked || 8),
              daily_wage: Number(w.dailyWage || 0),
              work_performed: w.workPerformed ? w.workPerformed.trim() : null,
            }))
          )
        );
      }

      if (selectedMaterialId && selectedMaterial) {
        formData.append('material_id', selectedMaterialId);
        formData.append('quantity_used', Number(quantityUsed));
        formData.append('unit', selectedMaterial.unit);
      }

      selectedPhotos.forEach((photo) => {
        formData.append('photos', photo);
      });

      if (miscAmount && Number(miscAmount) > 0) {
        formData.append('misc_amount', Number(miscAmount));
        formData.append('misc_description', miscDescription);
        formData.append('misc_remarks', miscRemarks);
      }

      const res = await dailyWorkApi.create(formData);

      setSuccessMsg('Daily work update, worker logs, and material usage recorded successfully!');
      setWorkDone('');
      setRemarks('');
      setExcessReason('');
      setSelectedMaterialId('');
      setQuantityUsed('');
      setMiscDescription('');
      setMiscAmount('');
      setMiscRemarks('');
      setSelectedPhotos([]);
      previewUrls.forEach((p) => URL.revokeObjectURL(p.url));
      setPreviewUrls([]);
      loadUpdates();
      loadInventory();

      // Switch to table view to see the new record
      setActiveTab('table');
      if (res?.id) {
        setSelectedDetailId(res.id);
      }
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  // Filtered updates for the Excel-style table
  const filteredUpdates = useMemo(() => {
    return updates.filter((u) => {
      if (filterProjectId && String(u.projectId) !== String(filterProjectId)) return false;
      if (filterSiteId && String(u.siteId) !== String(filterSiteId)) return false;
      if (filterDate && u.workDate !== filterDate) return false;
      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase();
        const matchTask = (u.taskName || u.phaseTitle || '').toLowerCase().includes(q);
        const matchWork = (u.workDone || '').toLowerCase().includes(q);
        const matchSite = (u.siteName || '').toLowerCase().includes(q);
        const matchPrj = (u.projectName || u.projectCode || '').toLowerCase().includes(q);
        const matchRemarks = (u.remarks || '').toLowerCase().includes(q);
        if (!matchTask && !matchWork && !matchSite && !matchPrj && !matchRemarks) return false;
      }
      return true;
    });
  }, [updates, filterProjectId, filterSiteId, filterDate, tableSearch]);

  // CSV Export function
  const handleExportCSV = () => {
    const headers = [
      'Date',
      'Project Code',
      'Project Name',
      'Site',
      'Task',
      'Workers Count',
      'Work Completed',
      'Progress %',
      'Status',
      'Material Used',
      'Quantity Used',
      'Misc Expense (₹)',
      'Remarks',
    ];

    const rows = filteredUpdates.map((u) => [
      `"${u.workDate || ''}"`,
      `"${u.projectCode || ''}"`,
      `"${(u.projectName || '').replace(/"/g, '""')}"`,
      `"${(u.siteName || '').replace(/"/g, '""')}"`,
      `"${(u.taskName || u.phaseTitle || '').replace(/"/g, '""')}"`,
      `"${u.workerCount || 0}"`,
      `"${(u.workDone || '').replace(/"/g, '""')}"`,
      `"${u.progressPercentage ?? ''}"`,
      `"${u.workStatus || ''}"`,
      `"${(u.materialName || '').replace(/"/g, '""')}"`,
      `"${u.quantityUsed ? `${u.quantityUsed} ${u.unit || ''}` : ''}"`,
      `"${(u.remarks || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `daily_work_records_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredWorkforce = useMemo(() => {
    const list = Array.isArray(workforceLookupList) ? workforceLookupList : [];
    if (!workerSearchTerm.trim()) return list.slice(0, 8);
    const q = workerSearchTerm.toLowerCase();
    return list.filter(
      (w) =>
        (w.name || '').toLowerCase().includes(q) ||
        (w.code && w.code.toLowerCase().includes(q)) ||
        (w.trade && w.trade.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [workforceLookupList, workerSearchTerm]);

  return (
    <>
      <PageHeader
        title="Daily Work Updates & Tracking"
        description="Excel-style task tracking, labour attendance, material consumption, and photo progress."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === 'table' ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => setActiveTab(activeTab === 'table' ? 'form' : 'table')}
            >
              {activeTab === 'table' ? (
                <>
                  <Plus className="h-4 w-4" />
                  + Record Today's Work
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4" />
                  View All Daily Records
                </>
              )}
            </Button>
            {activeTab === 'table' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportCSV}
                disabled={filteredUpdates.length === 0}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            )}
          </div>
        }
      />

      {error && <Alert tone="error" className="mb-4">{error.message}</Alert>}
      {successMsg && <Alert tone="success" className="mb-4">{successMsg}</Alert>}

      {/* Tab Switcher */}
      <div className="mb-6 flex border-b border-line bg-white px-2 pt-2 rounded-t-xl">
        <button
          type="button"
          onClick={() => setActiveTab('table')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-semibold transition-colors ${
            activeTab === 'table'
              ? 'border-brand-600 text-brand-700 bg-brand-50/20'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>Daily Work Records (Excel Table)</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-ink">
            {updates.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('form')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-semibold transition-colors ${
            activeTab === 'form'
              ? 'border-brand-600 text-brand-700 bg-brand-50/20'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <Plus className="h-4 w-4" />
          <span>+ Record Today's Work</span>
        </button>
      </div>

      {/* Hidden file inputs for direct camera and gallery upload */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handlePhotoAdd}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handlePhotoAdd}
        className="hidden"
      />

      {/* TAB 1: EXCEL-STYLE TABLE VIEW */}
      {activeTab === 'table' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <Card>
            <CardBody className="p-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-muted" />
                  <input
                    type="text"
                    placeholder="Search task, site, work..."
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="w-full rounded-lg border border-line bg-white pl-8 pr-3 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
                  />
                </div>

                {/* Project Filter */}
                <div>
                  <select
                    value={filterProjectId}
                    onChange={(e) => setFilterProjectId(e.target.value)}
                    className="w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
                  >
                    <option value="">All Projects</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} - {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Site Filter */}
                <div>
                  <select
                    value={filterSiteId}
                    onChange={(e) => setFilterSiteId(e.target.value)}
                    className="w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
                  >
                    <option value="">All Sites</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Filter */}
                <div>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
                  />
                </div>

                {/* Clear Filters */}
                <div className="flex items-center gap-2">
                  {(tableSearch || filterProjectId || filterSiteId || filterDate) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTableSearch('');
                        setFilterProjectId('');
                        setFilterSiteId('');
                        setFilterDate('');
                      }}
                      className="text-xs"
                    >
                      Clear Filters
                    </Button>
                  )}
                  <div className="ml-auto text-xs font-semibold text-ink-muted">
                    {filteredUpdates.length} of {updates.length} records
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Excel-Style Table View */}
          <Card>
            <CardBody className="p-0">
              {loading ? (
                <div className="p-8 space-y-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : filteredUpdates.length === 0 ? (
                <div className="py-12">
                  <EmptyState
                    icon={Calendar}
                    title="No daily work updates found"
                    description="No updates match your filter criteria or none have been submitted yet. Click '+ Record Today\'s Work' to submit."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="border-b border-line bg-canvas/80 text-[11px] font-bold text-ink-muted uppercase tracking-wider sticky top-0">
                      <tr>
                        <th className="px-3.5 py-3 border-r border-line/60">Date</th>
                        <th className="px-3.5 py-3 border-r border-line/60">Project</th>
                        <th className="px-3.5 py-3 border-r border-line/60">Site</th>
                        <th className="px-3.5 py-3 border-r border-line/60">Task</th>
                        <th className="px-3 py-3 border-r border-line/60 text-center">Workers</th>
                        <th className="px-4 py-3 border-r border-line/60 min-w-[220px]">Work Done</th>
                        <th className="px-3 py-3 border-r border-line/60 text-center">Progress</th>
                        <th className="px-3.5 py-3 min-w-[160px]">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/70">
                      {filteredUpdates.map((u) => {
                        const isCompleted = u.workStatus === 'completed';
                        const photosCount = u.photos?.length || 0;

                        return (
                          <tr
                            key={u.id}
                            onClick={() => setSelectedDetailId(u.id)}
                            className="group cursor-pointer hover:bg-brand-50/40 transition-colors"
                            title="Click to view full work details, workers and photos"
                          >
                            {/* Date */}
                            <td className="px-3.5 py-3 font-semibold text-ink border-r border-line/60 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-brand-600" />
                                <span>{formatDate(u.workDate)}</span>
                              </div>
                            </td>

                            {/* Project */}
                            <td className="px-3.5 py-3 border-r border-line/60 whitespace-nowrap">
                              <span className="font-bold text-brand-700">{u.projectCode}</span>
                              <div className="text-[11px] text-ink-muted max-w-[140px] truncate" title={u.projectName}>
                                {u.projectName}
                              </div>
                            </td>

                            {/* Site */}
                            <td className="px-3.5 py-3 border-r border-line/60 whitespace-nowrap font-medium text-ink">
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-ink-subtle" />
                                <span>{u.siteName || '—'}</span>
                              </div>
                            </td>

                            {/* Task */}
                            <td className="px-3.5 py-3 border-r border-line/60">
                              <div className="font-semibold text-ink flex items-center gap-1.5">
                                <span>{u.taskName || u.phaseTitle || 'Task'}</span>
                              </div>
                              <span className="text-[10px] text-ink-subtle">
                                Status: {u.taskStatus || u.workStatus}
                              </span>
                            </td>

                            {/* Workers */}
                            <td className="px-3 py-3 border-r border-line/60 text-center whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 border border-slate-200">
                                <Users className="h-3 w-3 text-slate-600" />
                                {u.workerCount || 0}
                              </span>
                            </td>

                            {/* Work Done */}
                            <td className="px-4 py-3 border-r border-line/60 text-ink leading-relaxed">
                              <div className="line-clamp-2">{u.workDone}</div>
                              {/* Photo / Material indicators */}
                              <div className="mt-1 flex items-center gap-2">
                                {photosCount > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-700">
                                    <Camera className="h-3 w-3" />
                                    {photosCount} photo{photosCount > 1 ? 's' : ''}
                                  </span>
                                )}
                                {(u.quantityUsed || u.quantity_used) && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800">
                                    <Package className="h-3 w-3" />
                                    {u.quantityUsed || u.quantity_used} {u.unit} used
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Progress */}
                            <td className="px-3 py-3 border-r border-line/60 text-center whitespace-nowrap">
                              <div className="flex flex-col items-center gap-1">
                                <span className="font-bold text-ink tabular-nums">
                                  {u.progressPercentage != null ? `${u.progressPercentage}%` : '—'}
                                </span>
                                <Badge tone={isCompleted ? 'success' : 'warning'}>
                                  {isCompleted ? 'Completed' : 'In Progress'}
                                </Badge>
                              </div>
                            </td>

                            {/* Remarks */}
                            <td className="px-3.5 py-3 text-ink-muted">
                              <div className="line-clamp-2 italic text-[11px]">
                                {u.remarks || '—'}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* TAB 2: RECORD TODAY'S WORK FORM */}
      {activeTab === 'form' && (
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader
              title="Record Today's Work"
              description="Progress update logged against Project → Site → Task with individual labour tracking"
            />
            <CardBody className="pt-0">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Project, Site and Task Selection */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-ink mb-1.5">
                      Assigned Project <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      required
                      className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} - {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink mb-1.5">
                      Assigned Site <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={siteId}
                      onChange={(e) => setSiteId(e.target.value)}
                      required
                      disabled={sites.length === 0}
                      className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-hidden disabled:bg-canvas"
                    >
                      {sites.length === 0 ? (
                        <option value="">No sites available</option>
                      ) : (
                        sites.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* Task Selection */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-ink">
                      Assigned Task <span className="text-rose-500">*</span>
                    </label>
                    {tasksLoading && <span className="text-[11px] text-ink-muted">Loading tasks…</span>}
                  </div>
                  <select
                    value={taskId}
                    onChange={(e) => handleTaskChange(e.target.value)}
                    required
                    disabled={tasks.length === 0}
                    className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-hidden disabled:bg-canvas"
                  >
                    {tasks.length === 0 ? (
                      <option value="">No tasks created for this project/site yet</option>
                    ) : (
                      tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.siteName ? `(${t.siteName})` : ''} — {t.progress}% ({t.status})
                        </option>
                      ))
                    )}
                  </select>
                  {tasks.length === 0 && !tasksLoading && (
                    <p className="mt-1 text-[11px] text-amber-600">
                      Admin has not created tasks for this project/site yet. Work must be logged against a Task.
                    </p>
                  )}
                </div>

                {/* Date, Progress & Status */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-ink mb-1.5">
                      Work Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={workDate}
                      onChange={(e) => setWorkDate(e.target.value)}
                      required
                      className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink mb-1.5">
                      Task Progress (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={progressPercentage}
                        onChange={(e) => setProgressPercentage(Number(e.target.value))}
                        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
                      />
                      <span className="text-xs font-bold text-ink-muted">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink mb-1.5">
                      Work Status
                    </label>
                    <select
                      value={workStatus}
                      onChange={(e) => setWorkStatus(e.target.value)}
                      className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
                    >
                      <option value="in-progress">In Progress</option>
                      <option value="needs-attention">Needs Attention</option>
                      <option value="delayed">Delayed</option>
                      <option value="completed">Completed (100%)</option>
                    </select>
                  </div>
                </div>

                {/* Work Description */}
                <div>
                  <label className="block text-xs font-medium text-ink mb-1.5">
                    Work Done Description <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={workDone}
                    onChange={(e) => setWorkDone(e.target.value)}
                    required
                    placeholder="Describe specific work executed today (e.g. Completed shuttering for beam B1-B4, casted 150 sq ft slab...)"
                    className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-hidden leading-relaxed"
                  />
                </div>

                {/* Labour Tracking Section */}
                <div className="rounded-xl border border-line bg-canvas/30 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-ink flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-brand-600" />
                        Workers on Site Today ({workers.filter((w) => w.isPresent !== false).length})
                      </p>
                      <p className="text-[11px] text-ink-subtle">
                        {taskAssignedLabour.length > 0
                          ? `Task has ${taskAssignedLabour.length} assigned labourers. Check who worked today.`
                          : 'Record worker attendance, daily wages, and individual work performed.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 relative">
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        onClick={() => setShowAddWorkerDropdown(!showAddWorkerDropdown)}
                      >
                        <Search className="h-3 w-3" />
                        Search Workforce Directory
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        onClick={handleAddManualWorker}
                      >
                        <Plus className="h-3 w-3" />
                        + Custom Worker
                      </Button>

                      {/* Dropdown for selecting worker from workforce lookup */}
                      {showAddWorkerDropdown && (
                        <div className="absolute right-0 top-8 z-30 w-72 rounded-xl border border-line bg-white p-3 shadow-xl space-y-2">
                          <div className="flex items-center justify-between pb-1 border-b border-line">
                            <span className="text-xs font-bold text-ink">Select Labour / Employee</span>
                            <button
                              type="button"
                              onClick={() => setShowAddWorkerDropdown(false)}
                              className="text-ink-muted hover:text-ink"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <input
                            type="text"
                            placeholder="Type to search name..."
                            value={workerSearchTerm}
                            onChange={(e) => setWorkerSearchTerm(e.target.value)}
                            className="w-full rounded border border-line px-2 py-1 text-xs text-ink"
                            autoFocus
                          />
                          <div className="max-h-48 overflow-y-auto divide-y divide-line/60">
                            {filteredWorkforce.map((w) => (
                              <button
                                key={`${w.workerType}-${w.id}`}
                                type="button"
                                onClick={() => handleAddWorkerFromWorkforce(w)}
                                className="w-full text-left p-1.5 hover:bg-canvas rounded text-xs flex justify-between items-center"
                              >
                                <div>
                                  <div className="font-semibold text-ink">{w.name}</div>
                                  <div className="text-[10px] text-ink-subtle">
                                    {w.trade || (w.workerType === 'company_employee' ? 'Employee' : 'Labour')}
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono text-ink-muted">
                                  {w.workerType === 'company_employee' ? 'Staff' : formatCurrency(w.wage || 0)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {workers.length === 0 ? (
                    <div className="p-4 rounded-lg border border-dashed border-line bg-white text-center text-xs text-ink-subtle">
                      No workers added yet. Use the buttons above to record workers who worked today.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {workers.map((worker, idx) => {
                        const isPresent = worker.isPresent !== false;
                        const isEmployee =
                          worker.workerType === 'company_employee' ||
                          (worker.labourType || '').toLowerCase().includes('company');

                        return (
                          <div
                            key={idx}
                            className={`rounded-xl border p-3 transition-colors ${
                              isPresent
                                ? 'border-line bg-white shadow-2xs'
                                : 'border-line/40 bg-canvas/60 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-line/60">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleToggleWorkerPresence(idx)}
                                  className="text-brand-600 hover:text-brand-700"
                                  title={isPresent ? 'Mark Absent' : 'Mark Present'}
                                >
                                  {isPresent ? (
                                    <CheckSquare className="h-4 w-4 text-emerald-600" />
                                  ) : (
                                    <Square className="h-4 w-4 text-ink-muted" />
                                  )}
                                </button>
                                <span className="text-xs font-bold text-ink">
                                  {worker.workerName || 'Worker #' + (idx + 1)}
                                </span>
                                <Badge tone={isEmployee ? 'info' : 'neutral'}>
                                  {isEmployee ? 'Company Employee' : 'Labour'}
                                </Badge>
                                {!isPresent && (
                                  <span className="text-[10px] font-semibold text-rose-600">
                                    Absent / Not Present Today
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveWorker(idx)}
                                className="text-ink-muted hover:text-rose-600 p-1 rounded"
                                title="Remove Worker"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {isPresent && (
                              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
                                <div>
                                  <label className="block text-[10px] font-medium text-ink-muted mb-0.5">
                                    Worker Name
                                  </label>
                                  <input
                                    type="text"
                                    value={worker.workerName}
                                    onChange={(e) => handleUpdateWorker(idx, 'workerName', e.target.value)}
                                    placeholder="Full Name"
                                    className="w-full rounded border border-line px-2 py-1 text-xs text-ink"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-medium text-ink-muted mb-0.5">
                                    Trade / Skill
                                  </label>
                                  <input
                                    type="text"
                                    value={worker.labourType}
                                    onChange={(e) => handleUpdateWorker(idx, 'labourType', e.target.value)}
                                    placeholder="Mason / Helper / Painter"
                                    className="w-full rounded border border-line px-2 py-1 text-xs text-ink"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-medium text-ink-muted mb-0.5">
                                    Hours Worked
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="24"
                                    value={worker.hoursWorked}
                                    onChange={(e) => handleUpdateWorker(idx, 'hoursWorked', Number(e.target.value))}
                                    className="w-full rounded border border-line px-2 py-1 text-xs text-ink"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-medium text-ink-muted mb-0.5">
                                    Daily Wage (₹)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={worker.dailyWage}
                                    disabled={isEmployee}
                                    onChange={(e) => handleUpdateWorker(idx, 'dailyWage', Number(e.target.value))}
                                    placeholder={isEmployee ? '—' : '600'}
                                    className="w-full rounded border border-line px-2 py-1 text-xs text-ink disabled:bg-canvas"
                                  />
                                </div>

                                <div className="sm:col-span-4">
                                  <label className="block text-[10px] font-medium text-ink-muted mb-0.5">
                                    Work Performed Today
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="e.g. Column reinforcement, concrete pouring, brick laying..."
                                    value={worker.workPerformed}
                                    onChange={(e) => handleUpdateWorker(idx, 'workPerformed', e.target.value)}
                                    className="w-full rounded border border-line px-2 py-1 text-xs text-ink"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-line text-xs font-semibold">
                        <span className="text-ink-muted">Total Wages Logged Today:</span>
                        <span className="text-emerald-700">
                          {formatCurrency(
                            workers
                              .filter((w) => w.isPresent !== false)
                              .reduce(
                                (sum, w) => sum + (Number(w.dailyWage || 0) * (Number(w.hoursWorked || 8) / 8)),
                                0
                              )
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Material / Tool Usage from Warehouse Inventory */}
                <div className="rounded-xl border border-amber-200/90 bg-amber-50/40 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Package className="h-4 w-4 text-amber-700" />
                      <span className="text-xs font-semibold text-ink">Material / Tool Used Today</span>
                    </div>
                    <span className="text-[11px] text-ink-subtle">Deducted from your warehouse stock</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-ink mb-1">
                        Select Material / Tool
                      </label>
                      <select
                        value={selectedMaterialId}
                        onChange={(e) => {
                          setSelectedMaterialId(e.target.value);
                          setQuantityUsed('');
                        }}
                        className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
                      >
                        <option value="">-- No material used today --</option>
                        {inventory.map((item) => (
                          <option key={item.material_id} value={item.material_id}>
                            {item.name} ({item.code}) — {formatNumber(item.availableStock)} {item.unit} available
                          </option>
                        ))}
                      </select>
                      {inventory.length === 0 && (
                        <p className="mt-1 text-[10px] text-ink-subtle">
                          No materials currently available in your warehouse.
                        </p>
                      )}
                    </div>

                    {selectedMaterialId && (() => {
                      const sel = inventory.find((m) => String(m.material_id) === String(selectedMaterialId));
                      if (!sel) return null;
                      const isOver = Number(quantityUsed) > sel.availableStock;
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-medium text-ink">
                              Quantity Used <span className="text-rose-500">*</span>
                            </label>
                            <span className="text-[11px] font-medium text-emerald-700">
                              Stock: {formatNumber(sel.availableStock)} {sel.unit}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="any"
                              min="0.01"
                              max={sel.availableStock}
                              value={quantityUsed}
                              onChange={(e) => setQuantityUsed(e.target.value)}
                              placeholder="e.g. 15"
                              required={!!selectedMaterialId}
                              className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-hidden ${
                                isOver ? 'border-rose-400 bg-rose-50/30' : 'border-line focus:border-brand-500'
                              }`}
                            />
                            <span className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink-muted">
                              {sel.unit}
                            </span>
                          </div>
                          {isOver && (
                            <p className="mt-1 text-[11px] font-medium text-rose-600">
                              Cannot exceed available stock of {sel.availableStock} {sel.unit}!
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-xs font-medium text-ink mb-1.5">
                    Remarks / Site Constraints (Optional)
                  </label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Weather delays, tool repairs, delivery notes, or site constraints..."
                    className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
                  />
                </div>

                {/* Direct Camera Capture & Photos */}
                <div className="rounded-xl border border-line bg-canvas/40 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                        <Camera className="h-4 w-4 text-brand-600" />
                        Site Work Photos
                      </p>
                      <p className="text-[11px] text-ink-subtle">
                        Capture directly from device camera or attach from gallery
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-800 transition-colors"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        Take Photo
                      </button>
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas transition-colors"
                      >
                        <ImageIcon className="h-3.5 w-3.5 text-ink-muted" />
                        Upload
                      </button>
                    </div>
                  </div>

                  {/* Thumbnail Previews */}
                  {previewUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2.5 pt-2 border-t border-line/60">
                      {previewUrls.map((preview, idx) => (
                        <div
                          key={idx}
                          className="group relative h-20 w-20 overflow-hidden rounded-lg border border-line bg-white shadow-2xs"
                        >
                          <img
                            src={preview.url}
                            alt={preview.name}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(idx)}
                            className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white opacity-90 hover:opacity-100"
                            title="Remove photo"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Live Task Budget Utilization & Exceeded Alert */}
                {taskId && currentTaskDetail && (
                  <div className="rounded-xl border border-line bg-canvas/40 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-brand-700" />
                        <span className="text-xs font-semibold text-ink">Task Budget & Cost Impact</span>
                      </div>
                      <span className="text-[11px] text-ink-subtle">
                        Live breakdown based on today's logged work
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                      <div className="rounded-lg border border-line bg-white p-2.5">
                        <span className="text-[10px] uppercase font-medium text-ink-subtle">Approved Budget</span>
                        <p className="mt-0.5 font-bold text-ink">{formatCurrency(approvedBudget)}</p>
                      </div>
                      <div className="rounded-lg border border-line bg-white p-2.5">
                        <span className="text-[10px] uppercase font-medium text-ink-subtle">Previous Spent</span>
                        <p className="mt-0.5 font-bold text-ink-muted">{formatCurrency(currentActual)}</p>
                      </div>
                      <div className="rounded-lg border border-line bg-white p-2.5">
                        <span className="text-[10px] uppercase font-medium text-brand-700">Today's New Cost</span>
                        <p className="mt-0.5 font-bold text-brand-700 tabular-nums">+{formatCurrency(liveUpdateTotal)}</p>
                        <div className="text-[10px] text-ink-subtle mt-0.5 truncate">
                          Mat: {formatCurrency(liveMaterialCost)} | Lab: {formatCurrency(liveLabourCost)}
                        </div>
                      </div>
                      <div className={`rounded-lg border p-2.5 ${isOverBudget ? 'border-rose-300 bg-rose-50/60' : 'border-line bg-white'}`}>
                        <span className={`text-[10px] uppercase font-medium ${isOverBudget ? 'text-rose-700 font-bold' : 'text-ink-subtle'}`}>
                          Projected Total
                        </span>
                        <p className={`mt-0.5 font-bold tabular-nums ${isOverBudget ? 'text-rose-700' : 'text-ink'}`}>
                          {formatCurrency(projectedTotal)}
                        </p>
                        {isOverBudget && (
                          <div className="text-[10px] font-bold text-rose-700 mt-0.5">
                            Over by +{formatCurrency(excessAmount)}
                          </div>
                        )}
                      </div>
                    </div>

                    {isOverBudget && (
                      <div className="rounded-lg border border-rose-300 bg-rose-50/80 p-3 space-y-2 mt-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-rose-900">
                              Task Budget Exceeded: +{formatCurrency(excessAmount)} Pending Admin Approval
                            </p>
                            <p className="text-[11px] text-rose-800 mt-0.5">
                              This update will exceed the approved task budget of {formatCurrency(approvedBudget)}. The excess amount will not be treated as approved until reviewed and approved by Admin. A mandatory justification is required.
                            </p>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-rose-950 mb-1">
                            Excess Budget Justification / Reason <span className="text-rose-600">*</span>
                          </label>
                          <textarea
                            rows={2}
                            value={excessReason}
                            onChange={(e) => setExcessReason(e.target.value)}
                            required
                            placeholder="Explain why this excess spending is required (e.g., unforeseen soil rock excavation, structural changes, unexpected price surge)..."
                            className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs text-ink placeholder:text-ink-subtle focus:border-rose-500 focus:outline-hidden"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Button type="submit" disabled={submitting} className="w-full justify-center">
                  <FileCheck className="h-4 w-4" />
                  {submitting ? 'Submitting Update...' : 'Submit Daily Work Update'}
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Daily Work Detail Modal (Opens when user clicks on ANY row in the table) */}
      <DailyWorkDetailModal
        updateId={selectedDetailId}
        isOpen={Boolean(selectedDetailId)}
        onClose={() => setSelectedDetailId(null)}
      />
    </>
  );
}
