import { useEffect, useState } from 'react';
import { Search, SlidersHorizontal, X, RotateCcw } from 'lucide-react';
import Select from '../ui/Select';
import { employeesApi } from '../../api/employeesApi';
import { projectsApi } from '../../api/projectsApi';
import { EMPLOYEE_STATUSES, EMPLOYEE_TYPES } from '../../utils/employeeOptions';

const PROFICIENCY_OPTIONS = [
  { value: 'all', label: 'Any Proficiency' },
  { value: '3', label: '3+ Stars (Competent)' },
  { value: '4', label: '4+ Stars (Proficient)' },
  { value: '5', label: '5 Stars (Expert)' },
];

const WORK_MODE_OPTIONS = [
  { value: 'all', label: 'All Work Modes' },
  { value: 'office', label: 'Office' },
  { value: 'wfh', label: 'Work From Home (WFH)' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'site', label: 'On-Site' },
  { value: 'remote', label: 'Full Remote' },
];

export default function PeopleSearchFilters({ filters, onChange, onReset }) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [lookups, setLookups] = useState({
    designations: [],
    departments: [],
    skills: [],
    reportingManagers: [],
    projects: [],
  });
  const [sites, setSites] = useState([]);

  useEffect(() => {
    let active = true;
    employeesApi
      .lookups()
      .then((data) => {
        if (!active) return;
        setLookups({
          designations: data.designations || [],
          departments: data.departments || [],
          skills: data.skills || [],
          reportingManagers: data.reportingManagers || [],
          projects: data.projects || [],
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!filters.projectId || filters.projectId === 'all') {
      setSites([]);
      return undefined;
    }
    let active = true;
    projectsApi
      .detail(filters.projectId)
      .then((data) => active && setSites(data.sites ?? []))
      .catch(() => active && setSites([]));
    return () => {
      active = false;
    };
  }, [filters.projectId]);

  const setFilter = (key, value) => {
    onChange({ ...filters, [key]: value, page: 1 });
  };

  // Quick filter chips handler
  const activeChip = (() => {
    if (filters.department === 'IT') return 'IT';
    if (filters.department === 'HR') return 'HR';
    if (filters.department === 'Finance') return 'Finance';
    if (filters.department === 'Management') return 'Management';
    if (filters.status === 'on-leave') return 'on-leave';
    if (filters.status === 'active' && filters.workMode === 'all' && filters.availabilityStatus === 'all') return 'active';
    if (filters.workMode === 'wfh') return 'wfh';
    if (filters.availabilityStatus === 'available') return 'available';
    if (
      filters.department === 'all' &&
      filters.status === 'all' &&
      filters.workMode === 'all' &&
      filters.availabilityStatus === 'all' &&
      filters.skill === 'all'
    ) {
      return 'all';
    }
    return null;
  })();

  function handleChipClick(chipId) {
    switch (chipId) {
      case 'all':
        onChange({
          ...filters,
          department: 'all',
          status: 'all',
          workMode: 'all',
          availabilityStatus: 'all',
          skill: 'all',
          page: 1,
        });
        break;
      case 'IT':
      case 'HR':
      case 'Finance':
      case 'Management':
        onChange({
          ...filters,
          department: filters.department === chipId ? 'all' : chipId,
          page: 1,
        });
        break;
      case 'active':
        onChange({
          ...filters,
          status: filters.status === 'active' ? 'all' : 'active',
          page: 1,
        });
        break;
      case 'on-leave':
        onChange({
          ...filters,
          status: filters.status === 'on-leave' ? 'all' : 'on-leave',
          page: 1,
        });
        break;
      case 'wfh':
        onChange({
          ...filters,
          workMode: filters.workMode === 'wfh' ? 'all' : 'wfh',
          page: 1,
        });
        break;
      case 'available':
        onChange({
          ...filters,
          availabilityStatus: filters.availabilityStatus === 'available' ? 'all' : 'available',
          page: 1,
        });
        break;
      default:
        break;
    }
  }

  // Count active non-default filters
  const activeAdvancedCount = [
    filters.department !== 'all',
    filters.designation !== 'all',
    filters.type !== 'all',
    filters.skill !== 'all',
    filters.minProficiency && filters.minProficiency !== 'all',
    filters.careerInterest,
    filters.workLocation,
    filters.workMode !== 'all',
    filters.availabilityStatus !== 'all',
    filters.projectId !== 'all',
    filters.siteId !== 'all',
    filters.reportingManagerId !== 'all',
  ].filter(Boolean).length;

  return (
    <div className="space-y-3.5">
      {/* Search Input Bar + Advanced Filter Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filters.search || ''}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder='Smart People Search: try "React", "Python", "Leadership", "Project Management", skills, interests…'
            aria-label="Smart Search employees"
            className="h-10 w-full rounded-xl border border-line bg-white pl-10 pr-9 text-xs sm:text-sm text-ink placeholder:text-ink-subtle transition-all hover:border-brand-300 focus:border-brand-500 focus:shadow-focus focus:outline-none"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => setFilter('search', '')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold transition-all border ${
            isAdvancedOpen || activeAdvancedCount > 0
              ? 'bg-brand-50 border-brand-300 text-brand-800 shadow-2xs'
              : 'bg-white border-line text-ink hover:bg-canvas'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4 text-brand-600" />
          <span>Filters</span>
          {activeAdvancedCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">
              {activeAdvancedCount}
            </span>
          )}
        </button>

        {activeAdvancedCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-ink-muted hover:bg-canvas hover:text-ink transition-colors"
            title="Reset all filters"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
      </div>

      {/* Quick Filter Chips (Feature 27) */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle mr-1">
          Quick Filters:
        </span>
        {[
          { id: 'all', label: 'All Employees' },
          { id: 'IT', label: 'IT' },
          { id: 'HR', label: 'HR' },
          { id: 'Finance', label: 'Finance' },
          { id: 'Management', label: 'Management' },
          { id: 'active', label: 'Active' },
          { id: 'on-leave', label: 'On Leave' },
          { id: 'wfh', label: 'WFH' },
          { id: 'available', label: 'Available' },
        ].map((chip) => {
          const isSelected = activeChip === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => handleChipClick(chip.id)}
              className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
                isSelected
                  ? 'bg-brand-700 text-white shadow-xs'
                  : 'bg-white text-ink-muted border border-line hover:bg-canvas hover:text-ink'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Collapsible Advanced Filters Drawer / Tray */}
      {isAdvancedOpen && (
        <div className="rounded-2xl border border-line bg-canvas/30 p-4.5 space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-brand-700" />
              Advanced People & 360° Search Filters
            </h4>
            <button
              type="button"
              onClick={() => setIsAdvancedOpen(false)}
              className="text-xs font-medium text-ink-subtle hover:text-ink"
            >
              Hide
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
            {/* Department Dropdown */}
            <Select
              label="Department"
              value={filters.department || 'all'}
              onChange={(e) => setFilter('department', e.target.value)}
              options={[
                { value: 'all', label: 'All Departments' },
                ...lookups.departments.map((d) => ({ value: d, label: d })),
              ]}
            />

            {/* Designation Dropdown */}
            <Select
              label="Designation"
              value={filters.designation || 'all'}
              onChange={(e) => setFilter('designation', e.target.value)}
              options={[
                { value: 'all', label: 'All Designations' },
                ...lookups.designations.map((d) => ({ value: d, label: d })),
              ]}
            />

            {/* Skill Dropdown */}
            <Select
              label="Skill"
              value={filters.skill || 'all'}
              onChange={(e) => setFilter('skill', e.target.value)}
              options={[
                { value: 'all', label: 'All Skills' },
                ...lookups.skills.map((s) => ({ value: s, label: s })),
              ]}
            />

            {/* Skill Proficiency Dropdown */}
            <Select
              label="Min Skill Proficiency"
              value={filters.minProficiency || 'all'}
              onChange={(e) => setFilter('minProficiency', e.target.value)}
              options={PROFICIENCY_OPTIONS}
            />

            {/* Career Interest */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-1">
                Career Interest
              </label>
              <input
                type="text"
                value={filters.careerInterest || ''}
                onChange={(e) => setFilter('careerInterest', e.target.value)}
                placeholder="e.g. Project Management, CTO…"
                className="h-9 w-full rounded-lg border border-line bg-white px-2.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
              />
            </div>

            {/* Work Location */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-1">
                Work Location
              </label>
              <input
                type="text"
                value={filters.workLocation || ''}
                onChange={(e) => setFilter('workLocation', e.target.value)}
                placeholder="e.g. Noida, Mumbai, Remote…"
                className="h-9 w-full rounded-lg border border-line bg-white px-2.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
              />
            </div>

            {/* Work Mode */}
            <Select
              label="Work Mode"
              value={filters.workMode || 'all'}
              onChange={(e) => setFilter('workMode', e.target.value)}
              options={WORK_MODE_OPTIONS}
            />

            {/* Status */}
            <Select
              label="Status"
              value={filters.status || 'all'}
              onChange={(e) => setFilter('status', e.target.value)}
              options={[{ value: 'all', label: 'All Statuses' }, ...EMPLOYEE_STATUSES]}
            />

            {/* Employee Type */}
            <Select
              label="Engagement Type"
              value={filters.type || 'all'}
              onChange={(e) => setFilter('type', e.target.value)}
              options={[{ value: 'all', label: 'All Types' }, ...EMPLOYEE_TYPES]}
            />

            {/* Reporting Manager */}
            <Select
              label="Reporting Manager"
              value={filters.reportingManagerId || 'all'}
              onChange={(e) => setFilter('reportingManagerId', e.target.value)}
              options={[
                { value: 'all', label: 'All Managers' },
                ...lookups.reportingManagers.map((m) => ({
                  value: String(m.id),
                  label: `${m.name} (${m.code})`,
                })),
              ]}
            />

            {/* Project Filter */}
            <Select
              label="Project"
              value={filters.projectId || 'all'}
              onChange={(e) => onChange({ ...filters, projectId: e.target.value, siteId: 'all', page: 1 })}
              options={[
                { value: 'all', label: 'All Projects' },
                ...lookups.projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` })),
              ]}
            />

            {/* Site Filter */}
            <Select
              label="Site"
              value={filters.siteId || 'all'}
              onChange={(e) => setFilter('siteId', e.target.value)}
              options={[
                { value: 'all', label: filters.projectId === 'all' ? 'All Sites' : 'All Sites in Project' },
                ...sites.map((s) => ({ value: String(s.id), label: s.name })),
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
