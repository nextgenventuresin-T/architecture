import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  Filter,
  Download,
  Calendar,
  Briefcase,
  Building2,
  HardHat,
  CheckCircle2,
  Clock,
  History,
  Eye,
  FileSpreadsheet,
  AlertCircle,
  X,
  Phone,
  Layers,
  Plus,
  BookOpen,
  MapPin,
  ClipboardList,
  CreditCard,
  Pencil,
  Trash2,
} from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Modal from '../../../components/ui/Modal';
import { hrApi } from '../../../api/hrApi';
import { projectsApi } from '../../../api/projectsApi';
import { formatCurrency, formatDate } from '../../../utils/format';
import QuickAddWorkerModal from '../../../components/tasks/QuickAddWorkerModal';
import EditWorkerModal from '../../../components/tasks/EditWorkerModal';

export default function LabourDirectoryPage() {
  // Main Top Tabs: 'daily_wage' | 'company_labour' | 'labour_diary'
  const [activeTab, setActiveTab] = useState('daily_wage');

  // Lookups (Projects & Contractors)
  const [lookups, setLookups] = useState({ projects: [], contractors: [] });
  const [availableSites, setAvailableSites] = useState([]);

  // Directory Data State
  const [dirData, setDirData] = useState({ rows: [], total: 0 });
  const [isLoadingDir, setIsLoadingDir] = useState(true);
  const [dirPage, setDirPage] = useState(1);
  const [dirPageSize, setDirPageSize] = useState(25);

  // Directory Filters
  const [dirSearch, setDirSearch] = useState('');
  const [dirProjectId, setDirProjectId] = useState('');
  const [dirSiteId, setDirSiteId] = useState('');
  const [dirContractorId, setDirContractorId] = useState('');
  const [dirTodayStatus, setDirTodayStatus] = useState('all');
  const [dirStatus, setDirStatus] = useState('active');

  // Quick Add Worker Modal
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);

  // Edit Worker Modal
  const [selectedWorkerForEdit, setSelectedWorkerForEdit] = useState(null);

  // Delete Worker State
  const [workerToDelete, setWorkerToDelete] = useState(null);
  const [isDeletingWorker, setIsDeletingWorker] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Work History Modal
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Labour Diary Tab State
  const [diaryData, setDiaryData] = useState({ rows: [], total: 0 });
  const [isLoadingDiary, setIsLoadingDiary] = useState(false);
  const [diaryPage, setDiaryPage] = useState(1);
  const [diaryPageSize, setDiaryPageSize] = useState(25);
  const [diaryViewBy, setDiaryViewBy] = useState('all'); // 'all' | 'labour' | 'site' | 'task'
  const [diarySearch, setDiarySearch] = useState('');
  const [diaryProjectId, setDiaryProjectId] = useState('');
  const [diarySiteId, setDiarySiteId] = useState('');
  const [diaryMonth, setDiaryMonth] = useState('');
  const [diaryYear, setDiaryYear] = useState('');
  const [diarySites, setDiarySites] = useState([]);

  // Load Lookups
  useEffect(() => {
    projectsApi
      .lookups()
      .then((res) => {
        setLookups({
          projects: res.projects || [],
          contractors: res.contractors || [],
        });
      })
      .catch((err) => console.error('Failed to load lookups:', err));
  }, []);

  // Update available sites when Directory Project changes
  useEffect(() => {
    if (!dirProjectId) {
      setAvailableSites([]);
      setDirSiteId('');
      return;
    }
    const found = lookups.projects.find((p) => String(p.id) === String(dirProjectId));
    setAvailableSites(found?.sites || []);
    setDirSiteId('');
  }, [dirProjectId, lookups.projects]);

  // Update available sites when Diary Project changes
  useEffect(() => {
    if (!diaryProjectId) {
      setDiarySites([]);
      setDiarySiteId('');
      return;
    }
    const found = lookups.projects.find((p) => String(p.id) === String(diaryProjectId));
    setDiarySites(found?.sites || []);
    setDiarySiteId('');
  }, [diaryProjectId, lookups.projects]);

  // Fetch Directory Records (for Daily Wage or Company Employee tab)
  const loadDirectory = () => {
    if (activeTab === 'labour_diary') return;
    setIsLoadingDir(true);

    const workerType = activeTab === 'company_labour' ? 'company_labour' : (activeTab === 'daily_wage' ? 'daily_wage' : 'all');

    hrApi.labourDirectory
      .list({
        page: dirPage,
        pageSize: dirPageSize,
        search: dirSearch,
        workerType,
        projectId: dirProjectId || undefined,
        siteId: dirSiteId || undefined,
        contractorId: dirContractorId || undefined,
        todayStatus: dirTodayStatus,
        status: dirStatus,
      })
      .then((res) => {
        setDirData(res || { rows: [], total: 0 });
      })
      .catch((err) => {
        console.error('Failed to load directory:', err);
      })
      .finally(() => setIsLoadingDir(false));
  };

  useEffect(() => {
    if (activeTab !== 'labour_diary') {
      loadDirectory();
    }
  }, [
    activeTab,
    dirPage,
    dirPageSize,
    dirProjectId,
    dirSiteId,
    dirContractorId,
    dirTodayStatus,
    dirStatus,
  ]);

  // Fetch Labour Diary Records
  const loadDiary = () => {
    if (activeTab !== 'labour_diary') return;
    setIsLoadingDiary(true);

    hrApi.labourDirectory
      .diary({
        page: diaryPage,
        pageSize: diaryPageSize,
        viewBy: diaryViewBy,
        search: diarySearch,
        projectId: diaryProjectId || undefined,
        siteId: diarySiteId || undefined,
        month: diaryMonth || undefined,
        year: diaryYear || undefined,
      })
      .then((res) => {
        setDiaryData(res || { rows: [], total: 0 });
      })
      .catch((err) => {
        console.error('Failed to load labour diary:', err);
      })
      .finally(() => setIsLoadingDiary(false));
  };

  useEffect(() => {
    if (activeTab === 'labour_diary') {
      loadDiary();
    }
  }, [
    activeTab,
    diaryPage,
    diaryPageSize,
    diaryViewBy,
    diaryProjectId,
    diarySiteId,
    diaryMonth,
    diaryYear,
  ]);

  // Search handler for Directory
  const handleDirSearchSubmit = (e) => {
    e.preventDefault();
    setDirPage(1);
    loadDirectory();
  };

  // Search handler for Diary
  const handleDiarySearchSubmit = (e) => {
    e.preventDefault();
    setDiaryPage(1);
    loadDiary();
  };

  // View Worker History Profile
  const handleViewHistory = (row) => {
    setSelectedWorker(row);
    setLoadingHistory(true);
    setHistoryData(null);

    hrApi.labourDirectory
      .history(row.workerType, row.workerId)
      .then((res) => {
        setHistoryData(res);
      })
      .catch((err) => {
        console.error('Failed to fetch worker history:', err);
      })
      .finally(() => {
        setLoadingHistory(false);
      });
  };

  // Open Edit Worker Modal
  const handleEditWorker = (worker) => {
    setSelectedWorkerForEdit(worker);
  };

  // Prompt Worker Deletion Confirmation
  const handleDeleteWorkerClick = (worker) => {
    setWorkerToDelete(worker);
    setDeleteError(null);
  };

  // Confirm Worker Deletion
  const handleConfirmDeleteWorker = async () => {
    if (!workerToDelete) return;
    setIsDeletingWorker(true);
    setDeleteError(null);
    try {
      const targetId = workerToDelete.workerId || workerToDelete.id;
      await hrApi.labourDirectory.delete(targetId);
      setWorkerToDelete(null);
      loadDirectory();
    } catch (err) {
      console.error('Failed to delete worker:', err);
      setDeleteError(err.response?.data?.message || err.message || 'Failed to delete worker.');
    } finally {
      setIsDeletingWorker(false);
    }
  };

  // Export Directory to CSV
  const handleExportDirectoryCSV = () => {
    if (!dirData.rows.length) return;
    const isCompany = activeTab === 'company_labour';

    const headers = [
      'Worker Code',
      'Full Name',
      'Classification',
      'Aadhaar Number',
      'Trade / Skill',
      'Phone',
      'Contractor / Employer',
      'Current Project',
      'Current Site',
      'Current Task',
      'Start Date',
      'End Date',
      'Expected Days',
      'Daily Wage (INR)',
      'Status',
      'Today Status',
    ];

    const csvRows = [headers.join(',')];

    for (const r of dirData.rows) {
      const isCL = r.workerType === 'company_labour' || isCompany;
      const values = [
        `"${r.workerCode || ''}"`,
        `"${r.fullName || ''}"`,
        `"${isCL ? 'Company Labour (In-House)' : 'Daily Wage Worker'}"`,
        `"${r.aadhaarNumber || ''}"`,
        `"${r.skillCategory || ''}"`,
        `"${r.phone || ''}"`,
        `"${isCL ? 'Company Labour (In-House)' : (r.contractorName || '')}"`,
        `"${r.currentProject || ''}"`,
        `"${r.currentSite || ''}"`,
        `"${r.currentTask || ''}"`,
        `"${r.startDate ? formatDate(r.startDate) : ''}"`,
        `"${r.endDate ? formatDate(r.endDate) : ''}"`,
        `"${r.expectedDays || ''}"`,
        `"${isCL ? '0.00' : (r.dailyRate || 0)}"`,
        `"${r.status || ''}"`,
        `"${r.todayStatusLabel || ''}"`,
      ];
      csvRows.push(values.join(','));
    }

    const filename = `${isCompany ? 'company-labour' : 'daily-wage-labour'}-${new Date().toISOString().slice(0, 10)}.csv`;
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Diary to CSV
  const handleExportDiaryCSV = () => {
    if (!diaryData.rows.length) return;
    const headers = [
      'Date',
      'Worker Code',
      'Worker Name',
      'Aadhaar Number',
      'Worker Type',
      'Trade / Skill',
      'Project',
      'Site',
      'Task',
      'Work Performed',
      'Hours Worked',
      'Days Equivalent',
      'Daily Wage (INR)',
      'Earned Cost (INR)',
      'Contractor',
      'Daily Remarks',
    ];

    const csvRows = [headers.join(',')];

    for (const r of diaryData.rows) {
      const hours = Number(r.hours_worked || 8);
      const days = Number((hours / 8).toFixed(1));
      const isCompany = r.worker_type === 'company_labour' || r.is_company_labour;
      const wage = isCompany ? 0 : Number(r.daily_wage || 0);
      const earned = isCompany ? 0 : (hours / 8) * wage;

      const values = [
        `"${r.work_date ? formatDate(r.work_date) : ''}"`,
        `"${r.worker_code || ''}"`,
        `"${r.worker_name || ''}"`,
        `"${r.aadhaar_number || ''}"`,
        `"${isCompany ? 'Company Labour (In-House)' : 'Daily-Wage Labour'}"`,
        `"${r.labour_type || ''}"`,
        `"${r.project_name || ''}"`,
        `"${r.site_name || ''}"`,
        `"${r.task_name || ''}"`,
        `"${(r.work_performed || '').replace(/"/g, '""')}"`,
        `"${hours}"`,
        `"${days}"`,
        `"${wage}"`,
        `"${earned.toFixed(2)}"`,
        `"${isCompany ? 'Company In-House' : (r.contractor_name || '')}"`,
        `"${(r.daily_remarks || '').replace(/"/g, '""')}"`,
      ];
      csvRows.push(values.join(','));
    }

    const filename = `labour-diary-${new Date().toISOString().slice(0, 10)}.csv`;
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Grouped diary calculations for summaries
  const diarySummary = useMemo(() => {
    if (!diaryData.rows.length) return { totalDays: 0, totalWages: 0, uniqueWorkers: 0 };
    let totalHours = 0;
    let totalWages = 0;
    const workersSet = new Set();

    for (const r of diaryData.rows) {
      const h = Number(r.hours_worked || 8);
      const w = Number(r.daily_wage || 0);
      totalHours += h;
      totalWages += (h / 8) * w;
      workersSet.add(r.worker_name || r.worker_id);
    }

    return {
      totalDays: Number((totalHours / 8).toFixed(1)),
      totalWages: Number(totalWages.toFixed(2)),
      uniqueWorkers: workersSet.size,
    };
  }, [diaryData]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Workforce Management & Labour Directory"
        description="Manage registered contractor labour, daily-wage workers, trade rates, and inspect the chronological Labour Diary across projects and sites."
        actions={
          <div className="flex items-center gap-2">
            {activeTab !== 'labour_diary' && (
              <Button
                variant="primary"
                onClick={() => setShowQuickAddModal(true)}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                {activeTab === 'company_labour' ? 'Add Company Labour' : 'Add Daily-Wage Worker'}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={activeTab === 'labour_diary' ? handleExportDiaryCSV : handleExportDirectoryCSV}
              disabled={activeTab === 'labour_diary' ? !diaryData.rows.length : !dirData.rows.length}
              className="gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Export to CSV
            </Button>
          </div>
        }
      />

      {/* Top Main Navigation Tabs */}
      <div className="border-b border-line">
        <div className="flex gap-4 sm:gap-8">
          <button
            type="button"
            onClick={() => {
              setActiveTab('daily_wage');
              setDirPage(1);
            }}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-semibold transition-colors ${
              activeTab === 'daily_wage'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
            }`}
          >
            <HardHat className="h-4 w-4" />
            Daily Wage & Contractor Labour
            <span
              className={`ml-1.5 rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'daily_wage'
                  ? 'bg-brand-50 text-brand-700'
                  : 'bg-canvas-subtle text-ink-subtle'
              }`}
            >
              {activeTab === 'daily_wage' ? dirData.total : '•'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('company_labour');
              setDirPage(1);
            }}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-semibold transition-colors ${
              activeTab === 'company_labour'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
            }`}
          >
            <Users className="h-4 w-4" />
            Company Labour (In-House)
            <span
              className={`ml-1.5 rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'company_labour'
                  ? 'bg-brand-50 text-brand-700'
                  : 'bg-canvas-subtle text-ink-subtle'
              }`}
            >
              {activeTab === 'company_labour' ? dirData.total : '•'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('labour_diary');
              setDiaryPage(1);
            }}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-semibold transition-colors ${
              activeTab === 'labour_diary'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Labour Diary / Work History
            <span
              className={`ml-1.5 rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'labour_diary'
                  ? 'bg-brand-50 text-brand-700'
                  : 'bg-canvas-subtle text-ink-subtle'
              }`}
            >
              {activeTab === 'labour_diary' ? diaryData.total : '•'}
            </span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          TAB 1 & 2: DIRECTORY LISTINGS (Daily Wage OR Company Labour)
          ========================================================================= */}
      {activeTab !== 'labour_diary' && (
        <div className="space-y-4">
          {/* Informative Header Banner */}
          <div className="rounded-xl border border-line bg-canvas-subtle/50 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                  {activeTab === 'daily_wage' ? (
                    <>
                      <HardHat className="h-4 w-4 text-brand-600" />
                      Daily Wage Labour Master Directory
                    </>
                  ) : (
                    <>
                      <Users className="h-4 w-4 text-blue-600" />
                      In-House Company Labour (Direct Workforce)
                    </>
                  )}
                </h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {activeTab === 'daily_wage'
                    ? 'Actual third-party and contractor daily-wage workers. Actual Labour Cost = Days Worked × Daily Wage in Project & Site Finance.'
                    : 'Permanent in-house company labour (masons, helpers, bar benders). Track site tasks, days, and activity; ₹0 labour cost added to project budgets & finance.'}
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="font-semibold text-ink">
                  Total {activeTab === 'daily_wage' ? 'Workers' : 'Company Labour'}: {dirData.total}
                </span>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <Card className="border-line bg-white shadow-sm">
            <CardBody className="p-4 space-y-3">
              <form onSubmit={handleDirSearchSubmit} className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle" />
                  <input
                    type="text"
                    value={dirSearch}
                    onChange={(e) => setDirSearch(e.target.value)}
                    placeholder={
                      activeTab === 'daily_wage'
                        ? 'Search worker name, code, phone, Aadhaar, or trade...'
                        : 'Search company labour name, code, phone, Aadhaar, or trade...'
                    }
                    className="w-full rounded-lg border border-line pl-9 pr-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <Button type="submit" size="sm" variant="primary">
                  Search
                </Button>

                {dirSearch && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDirSearch('');
                      setDirPage(1);
                    }}
                  >
                    Clear
                  </Button>
                )}
              </form>

              {/* Sub-Filters */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 pt-2 border-t border-line/60">
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-ink-subtle mb-1">
                    Project
                  </label>
                  <select
                    value={dirProjectId}
                    onChange={(e) => {
                      setDirProjectId(e.target.value);
                      setDirPage(1);
                    }}
                    className="w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500"
                  >
                    <option value="">All Projects</option>
                    {lookups.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase text-ink-subtle mb-1">
                    Site
                  </label>
                  <select
                    value={dirSiteId}
                    onChange={(e) => {
                      setDirSiteId(e.target.value);
                      setDirPage(1);
                    }}
                    disabled={!dirProjectId}
                    className="w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500 disabled:bg-canvas-subtle"
                  >
                    <option value="">{dirProjectId ? 'All Project Sites' : 'Select Project First'}</option>
                    {availableSites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {activeTab === 'daily_wage' && (
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-ink-subtle mb-1">
                      Contractor
                    </label>
                    <select
                      value={dirContractorId}
                      onChange={(e) => {
                        setDirContractorId(e.target.value);
                        setDirPage(1);
                      }}
                      className="w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500"
                    >
                      <option value="">All Contractors</option>
                      {lookups.contractors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-semibold uppercase text-ink-subtle mb-1">
                    Today&apos;s Status
                  </label>
                  <select
                    value={dirTodayStatus}
                    onChange={(e) => {
                      setDirTodayStatus(e.target.value);
                      setDirPage(1);
                    }}
                    className="w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500"
                  >
                    <option value="all">All Presence</option>
                    <option value="worked">Worked Today</option>
                    <option value="assigned">Assigned (Not Logged)</option>
                    <option value="available">Available</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase text-ink-subtle mb-1">
                    Status
                  </label>
                  <select
                    value={dirStatus}
                    onChange={(e) => {
                      setDirStatus(e.target.value);
                      setDirPage(1);
                    }}
                    className="w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500"
                  >
                    <option value="all">All</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Directory Excel-style Table */}
          <Card className="border-line bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-canvas-subtle border-b border-line text-ink-subtle font-semibold uppercase text-[11px]">
                  <tr>
                    <th className="py-3 px-4">
                      {activeTab === 'daily_wage' ? 'Worker Name & Code' : 'Labour Name & Code'}
                    </th>
                    <th className="py-3 px-3">Aadhaar Number</th>
                    <th className="py-3 px-3">Trade / Skill</th>
                    <th className="py-3 px-3">Contact</th>
                    <th className="py-3 px-3">{activeTab === 'company_labour' ? 'Employer' : 'Contractor'}</th>
                    <th className="py-3 px-3">Current Task Assignment</th>
                    <th className="py-3 px-3 text-center">Dates (Expected)</th>
                    <th className="py-3 px-3 text-right">Daily Rate</th>
                    <th className="py-3 px-3 text-center">Today&apos;s Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {isLoadingDir ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-xs text-ink-muted">
                        Loading workforce records...
                      </td>
                    </tr>
                  ) : dirData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-xs text-ink-subtle">
                        No records found matching the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    dirData.rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => handleViewHistory(row)}
                        className="hover:bg-canvas-subtle/50 transition-colors cursor-pointer"
                      >
                        {/* Name & ID */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-ink text-sm flex items-center gap-1.5">
                            {row.fullName}
                          </div>
                          <span className="font-mono text-[11px] text-ink-subtle">
                            {row.workerCode || 'ID: —'}
                          </span>
                        </td>

                        {/* Aadhaar Number */}
                        <td className="py-3 px-3 font-mono text-xs text-ink">
                          {row.aadhaarNumber || <span className="text-ink-subtle font-sans">—</span>}
                        </td>

                        {/* Trade / Skill */}
                        <td className="py-3 px-3">
                          <span className="font-medium text-ink">
                            {row.skillCategory || 'General Labour'}
                          </span>
                        </td>

                        {/* Contact */}
                        <td className="py-3 px-3 font-mono text-ink-muted">
                          {row.phone || <span className="text-ink-subtle font-sans">—</span>}
                        </td>

                        {/* Contractor / Employer */}
                        <td className="py-3 px-3">
                          {activeTab === 'company_labour' || row.isCompanyLabour || row.workerType === 'company_labour' ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                              Company Labour (In-House)
                            </span>
                          ) : (
                            <span className="text-ink-muted font-medium">
                              {row.contractorName || 'Independent'}
                            </span>
                          )}
                        </td>

                        {/* Current Task Assignment */}
                        <td className="py-3 px-3">
                          {row.currentProject ? (
                            <div className="space-y-0.5">
                              <p className="font-semibold text-ink truncate max-w-[170px]">
                                {row.currentProject}
                              </p>
                              {row.currentSite && (
                                <p className="text-[11px] text-ink-muted truncate max-w-[170px]">
                                  Site: {row.currentSite}
                                </p>
                              )}
                              {row.currentTask && (
                                <span className="inline-block px-1.5 py-0.2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-medium truncate max-w-[170px]">
                                  Task: {row.currentTask}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-ink-subtle italic">Unassigned</span>
                          )}
                        </td>

                        {/* Dates & Expected Days */}
                        <td className="py-3 px-3 text-center">
                          {row.startDate && row.endDate ? (
                            <div>
                              <p className="text-[11px] font-medium text-ink">
                                {formatDate(row.startDate)} → {formatDate(row.endDate)}
                              </p>
                              {row.expectedDays && (
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1 rounded">
                                  {row.expectedDays} days
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-ink-subtle">—</span>
                          )}
                        </td>

                        {/* Daily Rate */}
                        <td className="py-3 px-3 text-right tabular-nums font-semibold text-ink">
                          {activeTab === 'company_labour' || row.isCompanyLabour || row.workerType === 'company_labour' ? (
                            <span className="text-xs text-blue-700 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded font-sans">
                              ₹0 (In-House)
                            </span>
                          ) : (
                            formatCurrency(row.dailyRate)
                          )}
                        </td>

                        {/* Today's Status */}
                        <td className="py-3 px-3 text-center">
                          {row.todayStatus === 'worked' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Worked Today
                            </span>
                          ) : row.todayStatus === 'assigned' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              <Clock className="h-3 w-3" />
                              Assigned
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-canvas-subtle border border-line px-2 py-0.5 text-[11px] font-medium text-ink-subtle">
                              Available
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleViewHistory(row)}
                              className="h-7 text-xs px-2 gap-1 text-ink-muted hover:text-ink"
                              title="View Work History"
                            >
                              <History className="h-3.5 w-3.5" />
                              <span className="hidden xl:inline">History</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleEditWorker(row)}
                              className="h-7 text-xs px-2 gap-1 text-ink-muted hover:text-brand-600 hover:border-brand-300"
                              title="Edit Worker Details"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span className="hidden xl:inline">Edit</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDeleteWorkerClick(row)}
                              className="h-7 text-xs px-2 gap-1 text-rose-600 hover:bg-rose-50 hover:border-rose-200"
                              title="Delete Worker"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="hidden xl:inline">Delete</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-line px-4 py-3 bg-canvas text-xs text-ink-muted">
              <span>
                Showing {dirData.rows.length} of {dirData.total} members
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={dirPage <= 1}
                  onClick={() => setDirPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="font-semibold text-ink">Page {dirPage}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={dirData.rows.length < dirPageSize || dirPage * dirPageSize >= dirData.total}
                  onClick={() => setDirPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* =========================================================================
          TAB 3: LABOUR DIARY / WORK HISTORY
          ========================================================================= */}
      {activeTab === 'labour_diary' && (
        <div className="space-y-4">
          {/* Labour Diary KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Card className="bg-canvas border-line">
              <CardBody className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider">
                      Work Updates Logged
                    </p>
                    <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{diaryData.total}</p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="bg-canvas border-line">
              <CardBody className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider">
                      Total Worker Days Logged
                    </p>
                    <p className="mt-1 text-2xl font-bold text-blue-700 tabular-nums">
                      {diarySummary.totalDays} d
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                    <Calendar className="h-5 w-5" />
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="bg-canvas border-line">
              <CardBody className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider">
                      Active Workforce
                    </p>
                    <p className="mt-1 text-2xl font-bold text-indigo-700 tabular-nums">
                      {diarySummary.uniqueWorkers} people
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                    <Users className="h-5 w-5" />
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="bg-canvas border-line">
              <CardBody className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider">
                      Total Wage Cost (Logged)
                    </p>
                    <p className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
                      {formatCurrency(diarySummary.totalWages)}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                    <CreditCard className="h-5 w-5" />
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Grouping Mode & Filters */}
          <Card className="border-line bg-white shadow-sm">
            <CardBody className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase text-ink-subtle mr-1">
                    Group / View By:
                  </span>
                  <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5 text-xs">
                    {[
                      { id: 'all', label: 'All Chronological Logs' },
                      { id: 'labour', label: 'Labour-Wise' },
                      { id: 'site', label: 'Site-Wise' },
                      { id: 'task', label: 'Task-Wise' },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          setDiaryViewBy(mode.id);
                          setDiaryPage(1);
                        }}
                        className={`px-3 py-1 font-medium rounded-md transition-colors ${
                          diaryViewBy === mode.id
                            ? 'bg-white text-ink shadow-sm font-semibold'
                            : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Diary Filters Form */}
              <form onSubmit={handleDiarySearchSubmit} className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle" />
                  <input
                    type="text"
                    value={diarySearch}
                    onChange={(e) => setDiarySearch(e.target.value)}
                    placeholder="Search by worker name, task, project, or site..."
                    className="w-full rounded-lg border border-line pl-9 pr-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <Button type="submit" size="sm" variant="primary">
                  Filter
                </Button>

                {diarySearch && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDiarySearch('');
                      setDiaryPage(1);
                    }}
                  >
                    Clear
                  </Button>
                )}
              </form>

              {/* Dropdown Filters */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-2 border-t border-line/60">
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-ink-subtle mb-1">
                    Project
                  </label>
                  <select
                    value={diaryProjectId}
                    onChange={(e) => {
                      setDiaryProjectId(e.target.value);
                      setDiaryPage(1);
                    }}
                    className="w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500"
                  >
                    <option value="">All Projects</option>
                    {lookups.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase text-ink-subtle mb-1">
                    Site
                  </label>
                  <select
                    value={diarySiteId}
                    onChange={(e) => {
                      setDiarySiteId(e.target.value);
                      setDiaryPage(1);
                    }}
                    disabled={!diaryProjectId}
                    className="w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500 disabled:bg-canvas-subtle"
                  >
                    <option value="">{diaryProjectId ? 'All Project Sites' : 'Select Project First'}</option>
                    {diarySites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase text-ink-subtle mb-1">
                    Month
                  </label>
                  <select
                    value={diaryMonth}
                    onChange={(e) => {
                      setDiaryMonth(e.target.value);
                      setDiaryPage(1);
                    }}
                    className="w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500"
                  >
                    <option value="">All Months</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {new Date(2026, m - 1, 1).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase text-ink-subtle mb-1">
                    Year
                  </label>
                  <select
                    value={diaryYear}
                    onChange={(e) => {
                      setDiaryYear(e.target.value);
                      setDiaryPage(1);
                    }}
                    className="w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500"
                  >
                    <option value="">All Years</option>
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                  </select>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Labour Diary Table */}
          <Card className="border-line bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-canvas-subtle border-b border-line text-ink-subtle font-semibold uppercase text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-3">Worker Name & Code</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Project & Site</th>
                    <th className="py-3 px-3">Task</th>
                    <th className="py-3 px-3">Work Performed</th>
                    <th className="py-3 px-3 text-center">Hours / Days</th>
                    <th className="py-3 px-3 text-right">Wage Rate</th>
                    <th className="py-3 px-3 text-right">Earned Total</th>
                    <th className="py-3 px-3">Contractor / Employer</th>
                    <th className="py-3 px-4">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {isLoadingDiary ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-xs text-ink-muted">
                        Loading Labour Diary records...
                      </td>
                    </tr>
                  ) : diaryData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-xs text-ink-subtle">
                        No work diary logs found matching the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    diaryData.rows.map((row) => {
                      const hours = Number(row.hours_worked || 8);
                      const days = Number((hours / 8).toFixed(1));
                      const isCompany = row.worker_type === 'company_labour' || row.is_company_labour;
                      const wage = isCompany ? 0 : Number(row.daily_wage || 0);
                      const earned = isCompany ? 0 : (hours / 8) * wage;

                      return (
                        <tr key={row.id} className="hover:bg-canvas-subtle/50 transition-colors">
                          {/* Date */}
                          <td className="py-3 px-4 font-semibold text-ink whitespace-nowrap">
                            {formatDate(row.work_date)}
                          </td>

                          {/* Worker */}
                          <td className="py-3 px-3">
                            <p className="font-semibold text-ink">{row.worker_name}</p>
                            <span className="font-mono text-[10px] text-ink-subtle">
                              {row.worker_code || '—'}
                            </span>
                            {row.aadhaar_number && (
                              <span className="block font-mono text-[10px] text-ink-muted">
                                Aadhaar: {row.aadhaar_number}
                              </span>
                            )}
                          </td>

                          {/* Type */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {isCompany ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 border border-blue-200 text-blue-700">
                                Company Labour
                              </span>
                            ) : (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">
                                Daily Wage
                              </span>
                            )}
                          </td>

                          {/* Project & Site */}
                          <td className="py-3 px-3">
                            <p className="font-semibold text-ink">{row.project_name}</p>
                            <p className="text-[11px] text-ink-muted">{row.site_name || '—'}</p>
                          </td>

                          {/* Task */}
                          <td className="py-3 px-3">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
                              {row.task_name}
                            </span>
                          </td>

                          {/* Work Performed */}
                          <td className="py-3 px-3 max-w-xs text-ink-muted">
                            {row.work_performed || 'Site labour work'}
                          </td>

                          {/* Hours / Days */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className="font-semibold text-ink">{hours}h</span>
                            <span className="text-[10px] text-ink-subtle block">({days} d)</span>
                          </td>

                          {/* Wage Rate */}
                          <td className="py-3 px-3 text-right tabular-nums font-mono text-ink">
                            {isCompany ? (
                              <span className="text-blue-700 text-xs font-semibold">₹0 (In-House)</span>
                            ) : (
                              formatCurrency(wage)
                            )}
                          </td>

                          {/* Earned Total */}
                          <td className="py-3 px-3 text-right font-bold tabular-nums text-emerald-700 whitespace-nowrap">
                            {isCompany ? (
                              <span className="text-ink-subtle font-normal text-xs">₹0</span>
                            ) : (
                              formatCurrency(earned)
                            )}
                          </td>

                          {/* Contractor */}
                          <td className="py-3 px-3 text-ink-muted whitespace-nowrap">
                            {isCompany ? (
                              <span className="text-blue-700 font-medium text-xs">In-House</span>
                            ) : (
                              row.contractor_name || 'Independent'
                            )}
                          </td>

                          {/* Remarks */}
                          <td className="py-3 px-4 text-xs text-ink-subtle italic max-w-xs truncate">
                            {row.daily_remarks || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-line px-4 py-3 bg-canvas text-xs text-ink-muted">
              <span>
                Showing {diaryData.rows.length} of {diaryData.total} work logs
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={diaryPage <= 1}
                  onClick={() => setDiaryPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="font-semibold text-ink">Page {diaryPage}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={diaryData.rows.length < diaryPageSize || diaryPage * diaryPageSize >= diaryData.total}
                  onClick={() => setDiaryPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* =========================================================================
          WORK HISTORY & PROFILE MODAL
          ========================================================================= */}
      <Modal
        isOpen={Boolean(selectedWorker)}
        onClose={() => setSelectedWorker(null)}
        title={`Worker Profile & History — ${selectedWorker?.fullName || 'Worker'}`}
        size="2xl"
      >
        {selectedWorker && (
          <div className="space-y-5">
            {/* Worker Header Card */}
            <div className="rounded-xl border border-line bg-canvas/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-ink flex items-center gap-2">
                    {selectedWorker.fullName}
                    <Badge tone={selectedWorker.workerType === 'company_labour' || selectedWorker.isCompanyLabour ? 'info' : 'brand'}>
                      {selectedWorker.workerType === 'company_labour' || selectedWorker.isCompanyLabour ? 'Company Labour (In-House)' : 'Daily Wage Labour'}
                    </Badge>
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-ink-muted">
                    <span>
                      ID: <strong className="text-ink font-mono">{selectedWorker.workerCode}</strong>
                    </span>
                    {selectedWorker.aadhaarNumber && (
                      <span>
                        Aadhaar: <strong className="text-ink font-mono">{selectedWorker.aadhaarNumber}</strong>
                      </span>
                    )}
                    <span>
                      Trade / Skill:{' '}
                      <strong className="text-ink">{selectedWorker.skillCategory || 'General'}</strong>
                    </span>
                    {selectedWorker.phone && (
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="h-3 w-3" /> {selectedWorker.phone}
                      </span>
                    )}
                    <span>
                      Employer / Contractor:{' '}
                      <strong className="text-ink">
                        {selectedWorker.workerType === 'company_labour' || selectedWorker.isCompanyLabour
                          ? 'Company Labour (In-House)'
                          : (selectedWorker.contractorName || 'Independent')}
                      </strong>
                    </span>
                  </div>
                </div>

                {!(selectedWorker.workerType === 'company_labour' || selectedWorker.isCompanyLabour) && (
                  <div className="text-right">
                    <p className="text-[11px] text-ink-subtle">Base Daily Wage</p>
                    <p className="text-lg font-bold text-emerald-700">
                      {formatCurrency(selectedWorker.dailyRate)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Work History Summary Metrics */}
            {historyData && (
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="rounded-lg border border-line bg-white p-2.5">
                  <p className="text-[11px] text-ink-subtle">Logged Work Days</p>
                  <p className="text-lg font-bold text-ink">
                    {historyData.summary?.totalDaysWorked || 0} d
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-white p-2.5">
                  <p className="text-[11px] text-ink-subtle">Total Hours</p>
                  <p className="text-lg font-bold text-ink">
                    {historyData.summary?.totalHoursWorked || 0} hrs
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-white p-2.5">
                  <p className="text-[11px] text-ink-subtle">Work Updates Logged</p>
                  <p className="text-lg font-bold text-ink">
                    {historyData.summary?.totalWorkEntries || 0}
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-white p-2.5">
                  <p className="text-[11px] text-ink-subtle">
                    {selectedWorker.workerType === 'company_labour' || selectedWorker.isCompanyLabour ? 'Project Labour Cost' : 'Total Wages Earned'}
                  </p>
                  <p className="text-lg font-bold text-emerald-700">
                    {selectedWorker.workerType === 'company_labour' || selectedWorker.isCompanyLabour
                      ? '₹0 (In-House)'
                      : formatCurrency(historyData.summary?.totalEarned || 0)}
                  </p>
                </div>
              </div>
            )}

            {/* MONTHLY WORK HISTORY BREAKDOWN */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-2">
                Monthly Work Summary (Month · Project · Site · Task · Days Worked · Wage · Total Cost)
              </h4>

              {loadingHistory ? (
                <div className="py-6 text-center text-xs text-ink-muted">Loading monthly summary...</div>
              ) : !historyData || !historyData.monthlyBreakdown || historyData.monthlyBreakdown.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-ink-subtle">
                  No monthly activity logged yet.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-canvas-subtle sticky top-0 border-b border-line text-ink-subtle font-semibold uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Month</th>
                        <th className="p-2.5">Project</th>
                        <th className="p-2.5">Site</th>
                        <th className="p-2.5">Task</th>
                        <th className="p-2.5 text-center">Days Worked</th>
                        <th className="p-2.5 text-right">Daily Wage</th>
                        <th className="p-2.5 text-right">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {historyData.monthlyBreakdown.map((item, idx) => (
                        <tr key={idx} className="hover:bg-canvas-subtle/40">
                          <td className="p-2.5 font-bold text-ink whitespace-nowrap">{item.month}</td>
                          <td className="p-2.5 font-medium text-ink">{item.projectName}</td>
                          <td className="p-2.5 text-ink-muted">{item.siteName}</td>
                          <td className="p-2.5">
                            <span className="font-medium text-brand-700 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded text-[11px]">
                              {item.taskName}
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-semibold text-ink">
                            {item.daysWorked} d
                          </td>
                          <td className="p-2.5 text-right font-mono tabular-nums">
                            {selectedWorker.workerType === 'company_labour' || selectedWorker.isCompanyLabour
                              ? '—'
                              : formatCurrency(item.dailyWage)}
                          </td>
                          <td className="p-2.5 text-right font-bold text-emerald-700 tabular-nums">
                            {selectedWorker.workerType === 'company_labour' || selectedWorker.isCompanyLabour
                              ? '₹0'
                              : formatCurrency(item.totalCost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* CHRONOLOGICAL DAILY WORK LOG TABLE */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-2">
                Detailed Work Logs (Date · Project · Site · Task · Wage)
              </h4>

              {loadingHistory ? (
                <div className="py-6 text-center text-xs text-ink-muted">Loading worker history...</div>
              ) : !historyData || historyData.history.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-ink-subtle">
                  No site activity or daily work hours recorded for this person yet.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-canvas-subtle sticky top-0 border-b border-line text-ink-subtle font-semibold uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Project & Site</th>
                        <th className="p-2.5">Task</th>
                        <th className="p-2.5">Work Performed</th>
                        <th className="p-2.5 text-center">Hours / Days</th>
                        <th className="p-2.5 text-right">Wage Rate</th>
                        <th className="p-2.5 text-right">Earned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {historyData.history.map((log) => (
                        <tr key={log.id} className="hover:bg-canvas-subtle/40">
                          <td className="p-2.5 font-medium text-ink whitespace-nowrap">
                            {formatDate(log.date)}
                          </td>
                          <td className="p-2.5">
                            <p className="font-semibold text-ink">{log.projectName}</p>
                            <p className="text-[11px] text-ink-subtle">{log.siteName}</p>
                          </td>
                          <td className="p-2.5">
                            <span className="font-medium text-brand-700 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded text-[11px]">
                              {log.taskName}
                            </span>
                          </td>
                          <td className="p-2.5 text-ink-muted max-w-xs">{log.workPerformed}</td>
                          <td className="p-2.5 text-center">
                            <span className="font-semibold text-ink">{log.hoursWorked}h</span>
                            <span className="text-[10px] text-ink-subtle block">
                              ({log.daysWorked} d)
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-mono tabular-nums">
                            {selectedWorker.workerType === 'company_labour' || selectedWorker.isCompanyLabour
                              ? '—'
                              : formatCurrency(log.dailyWage)}
                          </td>
                          <td className="p-2.5 text-right font-bold text-emerald-700 tabular-nums">
                            {selectedWorker.workerType === 'company_labour' || selectedWorker.isCompanyLabour
                              ? '₹0'
                              : formatCurrency(log.earnedAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-line">
              <Button variant="secondary" onClick={() => setSelectedWorker(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* QUICK ADD WORKER MODAL */}
      <QuickAddWorkerModal
        isOpen={showQuickAddModal}
        onClose={() => setShowQuickAddModal(false)}
        defaultWorkerType={activeTab === 'company_labour' ? 'company_labour' : 'daily_wage'}
        onCreated={() => {
          loadDirectory();
        }}
      />

      {/* EDIT WORKER MODAL */}
      <EditWorkerModal
        isOpen={Boolean(selectedWorkerForEdit)}
        onClose={() => setSelectedWorkerForEdit(null)}
        worker={selectedWorkerForEdit}
        contractors={lookups.contractors}
        onSaved={() => {
          loadDirectory();
        }}
      />

      {/* DELETE WORKER CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(workerToDelete)}
        onClose={() => {
          if (!isDeletingWorker) setWorkerToDelete(null);
        }}
        title="Delete Worker"
        description="Are you sure you want to delete this worker from the directory?"
      >
        {workerToDelete && (
          <div className="space-y-4">
            {deleteError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                {deleteError}
              </div>
            )}

            <div className="rounded-xl border border-line bg-canvas p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink text-sm">{workerToDelete.fullName}</span>
                <span className="font-mono text-xs text-ink-subtle">
                  {workerToDelete.workerCode || `ID: #${workerToDelete.workerId}`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span>
                  Trade: <strong className="text-ink">{workerToDelete.skillCategory || 'General Labour'}</strong>
                </span>
                <span>•</span>
                <span>
                  Classification:{' '}
                  <strong
                    className={
                      workerToDelete.workerType === 'company_labour' || workerToDelete.isCompanyLabour
                        ? 'text-blue-700'
                        : 'text-emerald-700'
                    }
                  >
                    {workerToDelete.workerType === 'company_labour' || workerToDelete.isCompanyLabour
                      ? 'Company Labour (In-House)'
                      : 'Daily-Wage Worker'}
                  </strong>
                </span>
              </div>
            </div>

            <p className="text-xs text-ink-muted leading-relaxed">
              This action will permanently delete this worker from active workforce listings.
              <span className="block mt-1 text-ink-subtle">
                Historical work logs and financial journal entries are safely retained with unlinked worker ID to preserve past project costs and audit records.
              </span>
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setWorkerToDelete(null)}
                disabled={isDeletingWorker}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmDeleteWorker}
                disabled={isDeletingWorker}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isDeletingWorker ? 'Deleting…' : 'Yes, Delete Worker'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
