const fs = require('fs');

let content = fs.readFileSync('client/src/components/tasks/TaskDetailModal.jsx', 'utf8');

// 1. Add imports for AssignWorkerModal, QuickAddWorkerModal, and Trash2/UserCheck
if (!content.includes('AssignWorkerModal')) {
  content = content.replace(
    "import tasksApi from '../../api/tasksApi';",
    "import tasksApi from '../../api/tasksApi';\nimport AssignWorkerModal from './AssignWorkerModal';\nimport QuickAddWorkerModal from './QuickAddWorkerModal';"
  );
}

// 2. Accept initialTab prop and add modals state
content = content.replace(
  'export default function TaskDetailModal({ taskId, onClose, onUpdated, isAdmin = false }) {',
  'export default function TaskDetailModal({ taskId, onClose, onUpdated, isAdmin = false, initialTab = \'overview\' }) {'
);

content = content.replace(
  "const [activeTab, setActiveTab] = useState('overview');",
  "const [activeTab, setActiveTab] = useState(initialTab || 'overview');\n  const [showAssignModal, setShowAssignModal] = useState(false);\n  const [showQuickAddModal, setShowQuickAddModal] = useState(false);"
);

// 3. Add handleUnassignWorker function
const unassignFunc = `  const handleUnassignWorker = async (assignmentId, workerName) => {
    if (!window.confirm(\`Are you sure you want to unassign \${workerName} from this task?\`)) return;
    try {
      await tasksApi.unassignWorker(taskId, assignmentId);
      fetchDetail();
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error('Failed to unassign worker:', err);
      alert('Failed to unassign worker: ' + (err.response?.data?.error?.message || err.message));
    }
  };
`;

if (!content.includes('handleUnassignWorker')) {
  content = content.replace('  const handleAddWorker = async (e) => {', unassignFunc + '\n  const handleAddWorker = async (e) => {');
}

// 4. Update the labour tab content
const oldLabourTab = `              {/* Tab: Labour & Workers */}
              {activeTab === 'labour' && (
                <div className="space-y-6">
                  {/* Planned Labour Budget */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-2">
                      Planned Labour Budget ({labour.length})
                    </h4>
                    {labour.length === 0 ? (
                      <p className="text-xs text-ink-muted italic">No labour planned for this task.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-line">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-canvas text-ink-muted uppercase font-medium">
                            <tr>
                              <th className="py-2.5 px-3">Labour / Worker Name</th>
                              <th className="py-2.5 px-3">Trade / Role</th>
                              <th className="py-2.5 px-3 text-right">Workers</th>
                              <th className="py-2.5 px-3 text-right">Daily Wage</th>
                              <th className="py-2.5 px-3 text-right">Working Days</th>
                              <th className="py-2.5 px-3 text-right">Budgeted Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {labour.map((l, lIdx) => (
                              <tr key={l.id || lIdx} className="hover:bg-canvas/40">
                                <td className="py-2.5 px-3 font-semibold text-ink">
                                  {l.labour_name || l.labourName || '—'}
                                </td>
                                <td className="py-2.5 px-3 text-ink-muted">
                                  {l.labour_type || l.labourType}
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{l.worker_count}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{formatCurrency(l.daily_wage)}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{l.working_days}</td>
                                <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-ink">
                                  {formatCurrency(l.total_cost)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>`;

const newLabourTab = `              {/* Tab: Labour & Workers */}
              {activeTab === 'labour' && (
                <div className="space-y-6">
                  {/* 1. Planned Labour Budget (Admin Planned) */}
                  <div className="rounded-xl border border-line bg-canvas/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
                          1. Planned Labour Budget (Admin Planned)
                        </h4>
                        <p className="text-[11px] text-ink-muted">
                          Aggregate manpower requirement: Workers × Working Days × Daily Wage = Planned Labour Budget
                        </p>
                      </div>
                      <Badge tone="neutral">
                        Budget: {formatCurrency(task.labour_budget || 0)}
                      </Badge>
                    </div>

                    {labour.length === 0 ? (
                      <p className="text-xs text-ink-muted italic">No labour budget items planned by Admin.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-line bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-canvas-subtle text-ink-subtle uppercase text-[11px] font-semibold">
                            <tr>
                              <th className="py-2 px-3">Role / Skill Category</th>
                              <th className="py-2 px-3 text-right">Workers</th>
                              <th className="py-2 px-3 text-right">Working Days</th>
                              <th className="py-2 px-3 text-right">Daily Wage</th>
                              <th className="py-2 px-3 text-right">Budgeted Total</th>
                              <th className="py-2 px-3">Planning Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {labour.map((l, lIdx) => (
                              <tr key={l.id || lIdx} className="hover:bg-canvas-subtle/50">
                                <td className="py-2 px-3 font-semibold text-ink">
                                  {l.labour_type || l.labourType || 'General Labour'}
                                </td>
                                <td className="py-2 px-3 text-right tabular-nums">{l.worker_count || l.workerCount || 1}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{l.working_days || l.workingDays || 0} d</td>
                                <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(l.daily_wage || l.dailyWage || 0)}</td>
                                <td className="py-2 px-3 text-right font-bold text-ink tabular-nums">
                                  {formatCurrency(l.total_cost || l.totalCost || 0)}
                                </td>
                                <td className="py-2 px-3 text-ink-muted">{l.remarks || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* 2. Actual Assigned Labour / Workers */}
                  <div className="rounded-xl border border-brand-200 bg-white p-4 space-y-3 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-line">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-ink">
                            2. Labour / Workers Assigned to Task
                          </h4>
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">
                            {(taskData?.task?.assignedWorkers || []).length} Assigned
                          </span>
                        </div>
                        <p className="text-xs text-ink-muted">
                          Actual people designated to execute this task (Daily Wage Workers & Company Staff).
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="xs"
                          type="button"
                          onClick={() => setShowQuickAddModal(true)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          + Add Labour (New)
                        </Button>
                        <Button
                          size="xs"
                          type="button"
                          onClick={() => setShowAssignModal(true)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          + Assign Worker to Task
                        </Button>
                      </div>
                    </div>

                    {(taskData?.task?.assignedWorkers || []).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-line bg-canvas/30 p-6 text-center">
                        <Users className="mx-auto h-8 w-8 text-ink-subtle mb-1" />
                        <p className="text-xs font-medium text-ink">No workers assigned to this task yet.</p>
                        <p className="text-[11px] text-ink-subtle mt-0.5">
                          Click &ldquo;+ Assign Worker to Task&rdquo; to select actual workers from the Labour Directory.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-line">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-canvas-subtle text-ink-subtle uppercase text-[11px] font-semibold">
                            <tr>
                              <th className="py-2.5 px-3">Worker / Person</th>
                              <th className="py-2.5 px-3">Type</th>
                              <th className="py-2.5 px-3">Contact & Aadhaar</th>
                              <th className="py-2.5 px-3">Start Date</th>
                              <th className="py-2.5 px-3">End Date</th>
                              <th className="py-2.5 px-3 text-right">Expected Days</th>
                              <th className="py-2.5 px-3 text-right">Daily Wage</th>
                              <th className="py-2.5 px-3 text-right">Planned Cost</th>
                              <th className="py-2.5 px-3 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {(taskData?.task?.assignedWorkers || []).map((w) => {
                              const isCompany = w.workerType === 'company_employee';
                              return (
                                <tr key={w.id} className="hover:bg-canvas/40 transition-colors">
                                  <td className="py-2.5 px-3 font-semibold text-ink">
                                    <div className="flex items-center gap-1.5">
                                      <span>{w.workerName}</span>
                                      {w.trade && (
                                        <span className="text-[10px] text-ink-muted">({w.trade})</span>
                                      )}
                                    </div>
                                    {w.workerCode && (
                                      <span className="text-[10px] text-ink-subtle font-mono">{w.workerCode}</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <Badge tone={isCompany ? 'neutral' : 'success'}>
                                      {isCompany ? 'Company Employee' : 'Daily Wage Worker'}
                                    </Badge>
                                  </td>
                                  <td className="py-2.5 px-3 text-ink-muted text-[11px]">
                                    {w.phone && <div>Mob: {w.phone}</div>}
                                    {w.aadhaarNumber && <div className="text-ink-subtle">Aadhaar: {w.aadhaarNumber}</div>}
                                    {!w.phone && !w.aadhaarNumber && '—'}
                                  </td>
                                  <td className="py-2.5 px-3 text-ink-muted">{formatDate(w.startDate)}</td>
                                  <td className="py-2.5 px-3 text-ink-muted">{formatDate(w.endDate)}</td>
                                  <td className="py-2.5 px-3 text-right font-medium tabular-nums">{w.expectedDays} d</td>
                                  <td className="py-2.5 px-3 text-right tabular-nums">
                                    {isCompany ? <span className="text-ink-subtle">—</span> : formatCurrency(w.dailyWage)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-semibold text-ink tabular-nums">
                                    {isCompany ? <span className="text-ink-subtle">₹0</span> : formatCurrency(w.plannedCost)}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleUnassignWorker(w.id, w.workerName)}
                                      className="rounded p-1 text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                      title="Unassign worker from task"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>`;

content = content.replace(oldLabourTab.replace(/\r?\n/g, '\r\n'), newLabourTab.replace(/\r?\n/g, '\r\n'));
if (!content.includes('2. Labour / Workers Assigned to Task')) {
  content = content.replace(oldLabourTab.replace(/\r?\n/g, '\n'), newLabourTab.replace(/\r?\n/g, '\n'));
}

// 5. Append Modals at end of TaskDetailModal JSX before closing tags
const modalsJsx = `
      {/* Assign Worker Modal */}
      <AssignWorkerModal
        isOpen={showAssignModal}
        taskId={taskId}
        task={task}
        onClose={() => setShowAssignModal(false)}
        onAssigned={() => {
          fetchDetail();
          if (onUpdated) onUpdated();
        }}
        onOpenQuickAdd={() => {
          setShowAssignModal(false);
          setShowQuickAddModal(true);
        }}
      />

      {/* Quick Add Worker Modal */}
      <QuickAddWorkerModal
        isOpen={showQuickAddModal}
        onClose={() => setShowQuickAddModal(false)}
        onCreated={() => {
          fetchDetail();
          setShowAssignModal(true);
        }}
      />
`;

if (!content.includes('<AssignWorkerModal')) {
  content = content.replace('      {selectedPhoto && (', modalsJsx + '\n      {selectedPhoto && (');
}

fs.writeFileSync('client/src/components/tasks/TaskDetailModal.jsx', content, 'utf8');
console.log('TaskDetailModal.jsx successfully updated with Actual Labour Assignment section and modals');
