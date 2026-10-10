import { useState, useMemo } from 'react';
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export default function GroupedBudgetVsActualModal({ isOpen, onClose, group, onExportCSV }) {
  const [searchTerm, setSearchTerm] = useState('');
  const allTasks = useMemo(() => group?.tasks || [], [group]);

  const filteredTasks = useMemo(() => {
    if (!searchTerm.trim()) return allTasks;
    const q = searchTerm.toLowerCase();
    return allTasks.filter((t) => (t.taskName || '').toLowerCase().includes(q));
  }, [allTasks, searchTerm]);

  const summary = useMemo(() => {
    let totBudg = 0;
    let totAct = 0;
    let totMatB = 0;
    let totMatA = 0;
    let totLabB = 0;
    let totLabA = 0;
    let totMachB = 0;
    let totMachA = 0;
    let totMiscB = 0;
    let totMiscA = 0;

    allTasks.forEach((t) => {
      totBudg += Number(t.totalBudget || 0);
      totAct += Number(t.totalActual || 0);
      totMatB += Number(t.materialBudget || 0);
      totMatA += Number(t.materialActual || 0);
      totLabB += Number(t.labourBudget || 0);
      totLabA += Number(t.labourActual || 0);
      totMachB += Number(t.machineBudget || 0);
      totMachA += Number(t.machineActual || 0);
      totMiscB += Number(t.miscBudget || 0);
      totMiscA += Number(t.miscActual || 0);
    });

    const netVariance = totBudg - totAct;
    const util = totBudg > 0 ? Number(((totAct / totBudg) * 100).toFixed(1)) : 0;

    return {
      totalBudget: totBudg,
      totalActual: totAct,
      netVariance,
      utilization: util,
      materialBudget: totMatB,
      materialActual: totMatA,
      labourBudget: totLabB,
      labourActual: totLabA,
      machineBudget: totMachB,
      machineActual: totMachA,
      miscBudget: totMiscB,
      miscActual: totMiscA,
    };
  }, [allTasks]);

  if (!isOpen || !group) return null;

  const handleExport = () => {
    if (onExportCSV) {
      onExportCSV(
        `Budget_vs_Actual_${group.siteName || 'Site'}_${group.projectName || 'Project'}`,
        [
          'Task',
          'Material Budget',
          'Material Actual',
          'Material Variance',
          'Labour Budget',
          'Labour Actual',
          'Labour Variance',
          'Machine Budget',
          'Machine Actual',
          'Machine Variance',
          'Misc Budget',
          'Misc Actual',
          'Misc Variance',
          'Total Budget',
          'Total Actual',
          'Total Variance',
          'Utilization %',
          'Status',
          'Excess / Reason',
        ],
        filteredTasks.map((t) => [
          t.taskName,
          t.materialBudget,
          t.materialActual,
          (t.materialBudget - t.materialActual).toFixed(2),
          t.labourBudget,
          t.labourActual,
          (t.labourBudget - t.labourActual).toFixed(2),
          t.machineBudget,
          t.machineActual,
          (t.machineBudget - t.machineActual).toFixed(2),
          t.miscBudget,
          t.miscActual,
          (t.miscBudget - t.miscActual).toFixed(2),
          t.totalBudget,
          t.totalActual,
          t.variance,
          t.utilization,
          t.status,
          t.excessReason || '',
        ])
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title={`Task-wise Budget vs Actual Breakdown: ${group.siteName || 'Site'} (${group.projectName || 'Project'})`}
      description="Itemized task budgets across Materials, Labour, Machines, and Miscellaneous categories."
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-600">
            {allTasks.length} Planned Tasks | Total Budget:{' '}
            <strong>₹{summary.totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> | Actual:{' '}
            <strong className="text-blue-700">₹{summary.totalActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 font-medium uppercase">Approved Total Budget</span>
            <p className="font-bold text-slate-900 text-sm mt-0.5">
              ₹{summary.totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 font-medium uppercase">Total Actual Cost</span>
            <p className="font-bold text-blue-700 text-sm mt-0.5">
              ₹{summary.totalActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 font-medium uppercase">Net Budget Variance</span>
            <p className={`font-bold text-sm mt-0.5 ${summary.netVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              ₹{summary.netVariance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-500 font-medium uppercase">Budget Utilization</span>
            <p
              className={`font-bold text-sm mt-0.5 ${
                summary.utilization > 100
                  ? 'text-rose-700'
                  : summary.utilization >= 90
                  ? 'text-amber-700'
                  : 'text-emerald-700'
              }`}
            >
              {summary.utilization}%
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white pl-8 pr-3 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Export Breakdown
          </Button>
        </div>

        {/* Task-wise table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[50vh]">
          <table className="min-w-full divide-y divide-slate-200 text-xs font-mono">
            <thead className="bg-slate-100 text-slate-700 font-sans font-semibold sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Task Name</th>
                <th className="px-2.5 py-2 text-right">Mat. Budg</th>
                <th className="px-2.5 py-2 text-right">Mat. Act</th>
                <th className="px-2.5 py-2 text-right">Mat. Remaining</th>
                <th className="px-2.5 py-2 text-right">Mat. Variance</th>
                <th className="px-2.5 py-2 text-right">Lab. Budg</th>
                <th className="px-2.5 py-2 text-right">Lab. Act</th>
                <th className="px-2.5 py-2 text-right">Mach. Budg</th>
                <th className="px-2.5 py-2 text-right">Mach. Act</th>
                <th className="px-2.5 py-2 text-right">Misc Budg</th>
                <th className="px-2.5 py-2 text-right">Misc Act</th>
                <th className="px-2.5 py-2 text-right bg-slate-200">Total Budg</th>
                <th className="px-2.5 py-2 text-right bg-slate-200">Total Act</th>
                <th className="px-2.5 py-2 text-right">Variance</th>
                <th className="px-2.5 py-2 text-center">Util %</th>
                <th className="px-2.5 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-3 py-6 text-center text-slate-500 font-sans">
                    No matching task budget records found.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((t, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-sans font-medium text-slate-900 whitespace-nowrap">{t.taskName}</td>
                    <td className="px-2.5 py-2 text-right text-slate-600">
                      ₹{t.materialBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2.5 py-2 text-right text-blue-700 font-semibold">
                      ₹{t.materialActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2.5 py-2 text-right text-slate-700">
                      ₹{(t.materialBudget - t.materialActual).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`px-2.5 py-2 text-right font-semibold ${t.materialBudget - t.materialActual >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {t.materialBudget - t.materialActual >= 0 ? '+' : ''}₹{(t.materialBudget - t.materialActual).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2.5 py-2 text-right text-slate-600">
                      ₹{t.labourBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2.5 py-2 text-right text-blue-700 font-semibold">
                      ₹{t.labourActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2.5 py-2 text-right text-slate-600">
                      ₹{t.machineBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2.5 py-2 text-right text-blue-700 font-semibold">
                      ₹{t.machineActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2.5 py-2 text-right text-slate-600">
                      ₹{t.miscBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2.5 py-2 text-right text-blue-700 font-semibold">
                      ₹{t.miscActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2.5 py-2 text-right font-bold text-slate-900 bg-slate-50">
                      ₹{t.totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2.5 py-2 text-right font-bold text-slate-900 bg-slate-50">
                      ₹{t.totalActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`px-2.5 py-2 text-right font-bold ${
                        t.variance >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {t.variance >= 0 ? '+' : ''}₹{t.variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2.5 py-2 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.utilization > 100
                            ? 'bg-rose-100 text-rose-800'
                            : t.utilization >= 90
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {t.utilization}%
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-center font-sans">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          t.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : t.status === 'delayed'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {t.status || 'Active'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
