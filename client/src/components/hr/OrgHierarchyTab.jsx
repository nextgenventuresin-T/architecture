import { useState, useMemo } from 'react';
import {
  Network,
  List as ListIcon,
  ChevronRight,
  ChevronDown,
  User,
  Users,
  Building2,
  UserCheck,
  Search,
  Filter,
  Eye,
  ExternalLink,
  ArrowRight,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Skeleton from '../ui/Skeleton';
import Alert from '../ui/Alert';
import EmployeeQuickViewModal from '../employees/EmployeeQuickViewModal';
import useAsync from '../../hooks/useAsync';
import { employeesApi } from '../../api/employeesApi';
import { EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUS_TONE } from '../../utils/employeeOptions';

/**
 * Single node in the interactive tree
 */
function TreeNode({
  node,
  selectedId,
  onSelect,
  expandedIds,
  onToggleExpand,
  level = 0,
}) {
  const hasChildren = node.directReports && node.directReports.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;

  const initials = (node.fullName || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-3 rounded-2xl border p-3.5 transition-all cursor-pointer ${
          isSelected
            ? 'border-brand-500 bg-brand-50/50 shadow-md ring-2 ring-brand-400/20'
            : 'border-line bg-white hover:border-brand-300 hover:shadow-xs'
        }`}
        style={{ marginLeft: `${level * 28}px` }}
        onClick={() => onSelect(node)}
      >
        {/* Expand/Collapse Chevron */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
            className="rounded-lg p-1 text-ink-muted hover:bg-canvas transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-brand-600" />
            ) : (
              <ChevronRight className="h-4 w-4 text-ink-subtle" />
            )}
          </button>
        ) : (
          <div className="w-6 h-6 flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-line" />
          </div>
        )}

        {/* Avatar */}
        {node.avatarUrl ? (
          <img
            src={node.avatarUrl}
            alt={node.fullName}
            className="h-10 w-10 rounded-full border border-line object-cover shrink-0"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-xs font-bold text-white shadow-xs">
            {initials}
          </div>
        )}

        {/* Node info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-ink text-sm truncate">{node.fullName}</span>
            <span className="font-mono text-xs font-semibold text-brand-800 bg-brand-50 px-1.5 py-0.5 rounded border border-brand-200">
              {node.employeeCode}
            </span>
            {level === 0 && (
              <Badge tone="brand" size="sm">Top Level / Executive</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-ink-muted">
            <span className="font-medium text-ink-subtle">{node.designation}</span>
            <span>·</span>
            <span className="bg-canvas px-1.5 py-0.5 rounded text-[11px] font-semibold">
              {node.department || 'General'}
            </span>
          </div>
        </div>

        {/* Subordinate counter badge */}
        {hasChildren && (
          <div className="flex items-center gap-1.5 rounded-xl border border-line bg-canvas/40 px-2.5 py-1 text-xs font-semibold text-ink-muted shrink-0">
            <Users className="h-3.5 w-3.5 text-brand-600" />
            <span>
              {node.directReports.length} direct
              {node.totalSubordinatesCount > node.directReports.length && (
                <span className="text-ink-subtle font-normal"> · {node.totalSubordinatesCount} total</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Children list */}
      {hasChildren && isExpanded && (
        <div className="mt-2 space-y-2 border-l-2 border-brand-100 ml-5 pl-2">
          {node.directReports.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * HR Module B: Organization / Reporting Hierarchy
 * Visual Tree View + Chain of Command + High-Density List View
 */
export default function OrgHierarchyTab() {
  const [viewMode, setViewMode] = useState('tree'); // 'tree' | 'list'
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [selectedChain, setSelectedChain] = useState(null);
  const [loadingChain, setLoadingChain] = useState(false);
  const [chainError, setChainError] = useState(null);
  const [quickViewEmployee, setQuickViewEmployee] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');

  // Hierarchy Data
  const { data: hierarchyData, isLoading, error, reload } = useAsync(
    () => employeesApi.hierarchy(),
    []
  );

  const tree = hierarchyData?.tree ?? [];
  const allEmployees = hierarchyData?.allEmployees ?? [];
  const departmentHeads = hierarchyData?.departmentHeads ?? {};

  // Extract unique departments
  const departments = useMemo(() => {
    const set = new Set();
    allEmployees.forEach((e) => {
      if (e.department) set.add(e.department);
    });
    return Array.from(set).sort();
  }, [allEmployees]);

  // Set default selected employee once hierarchy loads
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Auto-expand root nodes on initial load
  useMemo(() => {
    if (tree.length > 0 && expandedIds.size === 0) {
      const initialSet = new Set(tree.map((t) => t.id));
      setExpandedIds(initialSet);
      if (!selectedEmployeeId && tree[0]) {
        handleSelectEmployee(tree[0]);
      }
    }
  }, [tree]);

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    const allIds = new Set(allEmployees.map((e) => e.id));
    setExpandedIds(allIds);
  }

  function collapseAll() {
    setExpandedIds(new Set());
  }

  async function handleSelectEmployee(emp) {
    if (!emp) return;
    setSelectedEmployeeId(emp.id);
    setLoadingChain(true);
    setChainError(null);
    try {
      const chainData = await employeesApi.employeeHierarchy(emp.id);
      setSelectedChain(chainData);
    } catch (err) {
      setChainError(err.message || 'Could not load reporting chain.');
    } finally {
      setLoadingChain(false);
    }
  }

  // Filtered employees for List View & Tree search
  const filteredEmployees = useMemo(() => {
    return allEmployees.filter((e) => {
      const matchesSearch =
        !searchTerm ||
        e.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.employeeCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.designation?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDept = selectedDept === 'all' || e.department === selectedDept;
      return matchesSearch && matchesDept;
    });
  }, [allEmployees, searchTerm, selectedDept]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-20 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert tone="error" title="Could not load organization hierarchy">
          {error.message}
        </Alert>
        <Button variant="secondary" className="mt-4" onClick={reload}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Top Banner & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-line p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <Network className="h-5 w-5 text-brand-600" />
              Organization & Reporting Hierarchy
            </h2>
            <Badge tone="brand" size="sm">Multi-Tier Chain of Command</Badge>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-ink-muted">
            Visualize reporting relationships, chains of command, department structures, and spans of control.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center rounded-xl border border-line bg-canvas p-1">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                viewMode === 'tree'
                  ? 'bg-white text-brand-700 shadow-2xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Network className="h-3.5 w-3.5" />
              Tree View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-brand-700 shadow-2xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <ListIcon className="h-3.5 w-3.5" />
              List View
            </button>
          </div>

          {viewMode === 'tree' && (
            <>
              <Button variant="secondary" size="sm" onClick={expandAll} className="text-xs">
                Expand All
              </Button>
              <Button variant="secondary" size="sm" onClick={collapseAll} className="text-xs">
                Collapse All
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-line p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-subtle" />
            <input
              type="text"
              placeholder="Search by employee, title, code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-full rounded-xl border border-line bg-canvas pl-9 pr-3 text-xs sm:text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-ink-subtle" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="h-9 rounded-xl border border-line bg-canvas px-3 text-xs sm:text-sm text-ink focus:border-brand-500 focus:bg-white"
            >
              <option value="all">All Departments ({departments.length})</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick KPI counters */}
        <div className="flex items-center gap-4 text-xs font-medium text-ink-muted">
          <div>
            <span className="text-ink font-bold text-sm">{allEmployees.length}</span> Total Employees
          </div>
          <div className="border-l border-line pl-4">
            <span className="text-brand-700 font-bold text-sm">{tree.length}</span> Top Executives
          </div>
          <div className="border-l border-line pl-4">
            <span className="text-teal-700 font-bold text-sm">{Object.keys(departmentHeads).length}</span> Dept Units
          </div>
        </div>
      </div>

      {/* Selected Employee Chain of Command Panel */}
      {selectedChain && (
        <Card className="overflow-hidden border-brand-200 bg-gradient-to-r from-brand-50/40 via-white to-canvas/30 shadow-xs">
          <div className="border-b border-brand-100 bg-brand-50/60 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600" />
              <h3 className="font-bold text-ink text-sm sm:text-base">
                Chain of Command: <span className="text-brand-800">{selectedChain.employee.fullName}</span>
              </h3>
              <span className="font-mono text-xs font-semibold text-brand-700 bg-white px-2 py-0.5 rounded border border-brand-200">
                {selectedChain.employee.employeeCode}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setQuickViewEmployee(selectedChain.employee)}
                className="gap-1.5 text-xs bg-white"
              >
                <Eye className="h-3.5 w-3.5" />
                Quick View
              </Button>
              <Link to={`/admin/employees/${selectedChain.employee.id}`}>
                <Button size="sm" className="gap-1.5 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" />
                  360° Profile
                </Button>
              </Link>
            </div>
          </div>

          <div className="p-5 space-y-6">
            {/* Visual Step-by-Step Chain: Employee -> Manager -> Manager's Manager -> Dept Head */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle mb-3">
                Hierarchical Reporting Path (Chain of Command)
              </p>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 relative">
                {/* 1. The Employee */}
                <div className="flex flex-col justify-between rounded-xl border-2 border-brand-500 bg-brand-50/50 p-4 shadow-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700">
                      1. Employee
                    </span>
                    <h4 className="font-bold text-ink text-sm mt-1">{selectedChain.chain.employee.fullName}</h4>
                    <p className="text-xs text-ink-muted">{selectedChain.chain.employee.designation}</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-brand-200 flex items-center justify-between text-[11px]">
                    <span className="font-mono text-brand-800 font-semibold">{selectedChain.chain.employee.employeeCode}</span>
                    <Badge tone="brand" size="sm">Selected</Badge>
                  </div>
                </div>

                {/* 2. Direct Reporting Manager */}
                <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-4 shadow-2xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
                      2. Reporting Manager
                    </span>
                    {selectedChain.chain.reportingManager ? (
                      <>
                        <h4 className="font-bold text-ink text-sm mt-1">
                          {selectedChain.chain.reportingManager.fullName}
                        </h4>
                        <p className="text-xs text-ink-muted">
                          {selectedChain.chain.reportingManager.designation || 'Manager'}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs italic text-ink-subtle mt-1">No reporting manager (Direct Management)</p>
                    )}
                  </div>
                  {selectedChain.chain.reportingManager && (
                    <div className="mt-3 pt-2 border-t border-line flex items-center justify-between text-[11px]">
                      <span className="font-mono text-ink-muted">{selectedChain.chain.reportingManager.employeeCode}</span>
                      <button
                        type="button"
                        onClick={() => handleSelectEmployee(selectedChain.chain.reportingManager)}
                        className="text-xs font-semibold text-brand-700 hover:underline"
                      >
                        Inspect ➔
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. Manager's Manager */}
                <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-4 shadow-2xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                      3. Manager's Manager
                    </span>
                    {selectedChain.chain.managersManager ? (
                      <>
                        <h4 className="font-bold text-ink text-sm mt-1">
                          {selectedChain.chain.managersManager.fullName}
                        </h4>
                        <p className="text-xs text-ink-muted">
                          {selectedChain.chain.managersManager.designation || 'Senior Manager'}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs italic text-ink-subtle mt-1">None (Reports to Top Level)</p>
                    )}
                  </div>
                  {selectedChain.chain.managersManager && (
                    <div className="mt-3 pt-2 border-t border-line flex items-center justify-between text-[11px]">
                      <span className="font-mono text-ink-muted">{selectedChain.chain.managersManager.employeeCode}</span>
                      <button
                        type="button"
                        onClick={() => handleSelectEmployee(selectedChain.chain.managersManager)}
                        className="text-xs font-semibold text-brand-700 hover:underline"
                      >
                        Inspect ➔
                      </button>
                    </div>
                  )}
                </div>

                {/* 4. Department Head */}
                <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-4 shadow-2xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                      4. Department Head
                    </span>
                    {selectedChain.chain.departmentHead ? (
                      <>
                        <h4 className="font-bold text-ink text-sm mt-1">
                          {selectedChain.chain.departmentHead.fullName}
                        </h4>
                        <p className="text-xs text-ink-muted">
                          {selectedChain.chain.departmentHead.designation || 'Head of Department'}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs italic text-ink-subtle mt-1">
                        {selectedChain.employee.department || 'General'}
                      </p>
                    )}
                  </div>
                  {selectedChain.chain.departmentHead && (
                    <div className="mt-3 pt-2 border-t border-line flex items-center justify-between text-[11px]">
                      <span className="font-mono text-ink-muted">{selectedChain.chain.departmentHead.employeeCode}</span>
                      <Badge tone="neutral" size="sm">{selectedChain.chain.departmentHead.department}</Badge>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Subordinates & Team section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-line">
              {/* Direct Reports */}
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5 mb-2">
                  <Users className="h-4 w-4 text-brand-600" />
                  Who Reports to Them ({selectedChain.directReports.length} direct, {selectedChain.allReports.length} in tree)
                </h5>
                {selectedChain.directReports.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {selectedChain.directReports.map((report) => (
                      <div
                        key={report.id}
                        onClick={() => handleSelectEmployee(report)}
                        className="flex items-center justify-between rounded-xl border border-line bg-white p-2.5 hover:border-brand-300 hover:bg-canvas/40 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-xs text-ink truncate">{report.fullName}</p>
                          <p className="text-[11px] text-ink-muted">{report.designation} · {report.department}</p>
                        </div>
                        <span className="font-mono text-[11px] text-brand-700 font-semibold">{report.employeeCode}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic text-ink-subtle p-3 rounded-xl bg-canvas/30 border border-line">
                    This employee does not currently have direct reports.
                  </p>
                )}
              </div>

              {/* Peers in the same team */}
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5 mb-2">
                  <UserCheck className="h-4 w-4 text-teal-600" />
                  Team Peers (Reporting to same manager) ({selectedChain.peers.length})
                </h5>
                {selectedChain.peers.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {selectedChain.peers.map((peer) => (
                      <div
                        key={peer.id}
                        onClick={() => handleSelectEmployee(peer)}
                        className="flex items-center justify-between rounded-xl border border-line bg-white p-2.5 hover:border-brand-300 hover:bg-canvas/40 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-xs text-ink truncate">{peer.fullName}</p>
                          <p className="text-[11px] text-ink-muted">{peer.designation}</p>
                        </div>
                        <span className="font-mono text-[11px] text-ink-subtle">{peer.employeeCode}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic text-ink-subtle p-3 rounded-xl bg-canvas/30 border border-line">
                    No other direct peers under this manager.
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Main View Area */}
      {viewMode === 'tree' ? (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
            <h3 className="font-bold text-ink text-sm sm:text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-brand-600" />
              Organizational Tree (Click any employee to see their complete chain)
            </h3>
            <span className="text-xs text-ink-subtle">
              Showing {tree.length} primary executive line{tree.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="space-y-3">
            {tree.map((rootNode) => (
              <TreeNode
                key={rootNode.id}
                node={rootNode}
                selectedId={selectedEmployeeId}
                onSelect={handleSelectEmployee}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                level={0}
              />
            ))}
          </div>
        </Card>
      ) : (
        /* List / Table View */
        <Card>
          <div className="border-b border-line px-5 py-3.5 flex items-center justify-between">
            <h3 className="font-bold text-ink text-sm sm:text-base">
              All Employees & Reporting Lines ({filteredEmployees.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-canvas border-b border-line text-ink-muted text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Role / Dept</th>
                  <th className="px-5 py-3">Reporting Manager</th>
                  <th className="px-5 py-3">Manager's Manager</th>
                  <th className="px-5 py-3">Department Head</th>
                  <th className="px-5 py-3 text-center">Direct Reports</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {filteredEmployees.map((emp) => {
                  const isSelected = selectedEmployeeId === emp.id;
                  return (
                    <tr
                      key={emp.id}
                      onClick={() => handleSelectEmployee(emp)}
                      className={`hover:bg-brand-50/30 cursor-pointer transition-colors ${
                        isSelected ? 'bg-brand-50/60 font-semibold' : ''
                      }`}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          {emp.avatarUrl ? (
                            <img
                              src={emp.avatarUrl}
                              alt={emp.fullName}
                              className="h-8 w-8 rounded-full border border-line object-cover"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-lg bg-brand-100 text-brand-800 font-bold flex items-center justify-center text-xs">
                              {emp.fullName?.charAt(0) || '?'}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-ink">{emp.fullName}</p>
                            <span className="font-mono text-xs text-brand-700 bg-brand-50 px-1 rounded">
                              {emp.employeeCode}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink">{emp.designation}</p>
                        <p className="text-xs text-ink-subtle">{emp.department || 'General'}</p>
                      </td>
                      <td className="px-5 py-3">
                        {emp.reportingManagerName ? (
                          <div>
                            <p className="font-medium text-ink flex items-center gap-1">
                              <UserCheck className="h-3 w-3 text-teal-600" />
                              {emp.reportingManagerName}
                            </p>
                            <p className="text-[11px] text-ink-subtle">{emp.reportingManagerDesignation}</p>
                          </div>
                        ) : (
                          <span className="text-xs italic text-ink-subtle">Executive / Top</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {emp.managersManagerName ? (
                          <div>
                            <p className="font-medium text-ink">{emp.managersManagerName}</p>
                            <p className="text-[11px] text-ink-subtle">{emp.managersManagerDesignation}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-subtle">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded bg-canvas px-2 py-0.5 text-xs font-semibold text-ink-muted">
                          {emp.departmentHead?.fullName || emp.department || '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="inline-flex items-center rounded-full bg-canvas px-2.5 py-0.5 text-xs font-bold text-ink">
                          {emp.directReportsCount}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setQuickViewEmployee(emp)}
                            title="Quick View"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Link to={`/admin/employees/${emp.id}`}>
                            <Button variant="ghost" size="sm" title="360 Profile">
                              <ExternalLink className="h-3.5 w-3.5 text-brand-600" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Quick View Modal */}
      <EmployeeQuickViewModal
        employee={quickViewEmployee}
        isOpen={Boolean(quickViewEmployee)}
        onClose={() => setQuickViewEmployee(null)}
      />
    </div>
  );
}
