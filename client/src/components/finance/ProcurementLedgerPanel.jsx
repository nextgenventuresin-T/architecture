import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, X } from 'lucide-react';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Skeleton from '../ui/Skeleton';
import Alert from '../ui/Alert';
import { financeApi } from '../../api/financeApi';
import { toApiError } from '../../api/axiosClient';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TYPE_STYLE = {
  vendor_purchase: 'bg-blue-100 text-blue-800',
  vendor_payment: 'bg-indigo-100 text-indigo-800',
  internal_transfer: 'bg-slate-100 text-slate-700',
  material_consumption: 'bg-rose-100 text-rose-800',
  machine_purchase: 'bg-cyan-100 text-cyan-800',
  machine_allocation: 'bg-slate-100 text-slate-700',
  machine_usage_charge: 'bg-amber-100 text-amber-800',
  machine_rental: 'bg-orange-100 text-orange-800',
  machine_rental_idle: 'bg-stone-100 text-stone-700',
  transport: 'bg-sky-100 text-sky-800',
};

const IMPACT = (r) => (r.affectsExpense ? ['Project expense', 'text-rose-700'] : r.affectsInventory ? ['Inventory / payable', 'text-blue-700'] : ['No expense', 'text-slate-500']);

function exportCsv(rows) {
  const header = ['Date', 'Type', 'Reference', 'Item / Machine', 'Serial', 'Qty', 'Unit', 'Cost/Unit', 'Value', 'From', 'To', 'Debit', 'Credit', 'Project', 'Site', 'Task', 'Expense?', 'User', 'Status'];
  const lines = rows.map((r) => [
    r.date ? String(r.date).slice(0, 10) : '', r.transactionLabel, r.referenceNumber, r.material, r.machineSerial || '', r.quantity ?? '', r.unit,
    r.costPerUnit ?? '', r.value, r.source, r.destination, r.debitAccount, r.creditAccount, r.projectName, r.siteName, r.taskName,
    r.affectsExpense ? 'Yes' : 'No', r.user, r.status,
  ]);
  const csv = [header, ...lines].map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Procurement_Ledger.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Finance -> Procurement (Debit / Credit).
 * One typed entry per real transaction - purchase, payment, internal transfer, consumption,
 * machine allocation / usage / rental - each with source, destination, quantity, actual value,
 * and the Debit / Credit account it moves. Click any entry to open its source transaction.
 */
export default function ProcurementLedgerPanel() {
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], types: [], summary: { byType: {}, projectExpenseTotal: 0 }, pagination: { totalPages: 1 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    financeApi
      .procurementLedger({ type: type === 'all' ? undefined : type, search: search || undefined, page, pageSize: 25 })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(toApiError(e)))
      .finally(() => setLoading(false));
  }, [type, search, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-800">Procurement Finance (Debit / Credit)</h2>
          <p className="text-xs text-slate-500">
            Each entry is one real transaction with its source, destination, quantity and actual value. Only
            <strong> Material Consumption, Machine Usage Charge and Machine Rental</strong> raise project cost — purchases,
            transfers and allocations never count as a second expense.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => exportCsv(data.rows)}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5">
          <span className="text-[10px] font-medium uppercase text-rose-600">Project expense (this filter)</span>
          <p className="mt-0.5 font-mono text-sm font-bold text-rose-800">{inr(data.summary?.projectExpenseTotal)}</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
          <span className="text-[10px] font-medium uppercase text-blue-600">Vendor purchases (stock in)</span>
          <p className="mt-0.5 font-mono text-sm font-bold text-blue-800">{inr(data.summary?.byType?.vendor_purchase)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <span className="text-[10px] font-medium uppercase text-slate-500">Internal transfers (no expense)</span>
          <p className="mt-0.5 font-mono text-sm font-bold text-slate-800">{inr(data.summary?.byType?.internal_transfer)}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
          <span className="text-[10px] font-medium uppercase text-emerald-600">Vendor payments</span>
          <p className="mt-0.5 font-mono text-sm font-bold text-emerald-800">{inr(data.summary?.byType?.vendor_payment)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
          aria-label="Filter by transaction type"
        >
          <option value="all">All transaction types</option>
          {(data.types || []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search reference, item, serial, vendor…"
          className="h-8 w-64 rounded border border-slate-300 bg-white px-2 text-xs"
        />
      </div>

      {error && <Alert tone="error">{error.message}</Alert>}
      {loading ? (
        <div className="space-y-2 py-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : data.rows.length === 0 ? (
        <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">No ledger transactions found.</div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold">
              <tr>
                <th className="px-3 py-2.5 text-left">Date</th>
                <th className="px-3 py-2.5 text-left">Transaction</th>
                <th className="px-3 py-2.5 text-left">Item / Machine</th>
                <th className="px-3 py-2.5 text-right">Qty</th>
                <th className="px-3 py-2.5 text-right">Cost / Unit</th>
                <th className="px-3 py-2.5 text-right">Value</th>
                <th className="px-3 py-2.5 text-left">Source → Destination</th>
                <th className="px-3 py-2.5 text-left bg-red-50 text-red-900">Debit</th>
                <th className="px-3 py-2.5 text-left bg-emerald-50 text-emerald-900">Credit</th>
                <th className="px-3 py-2.5 text-left">Project / Site / Task</th>
                <th className="px-3 py-2.5 text-left">Effect</th>
                <th className="px-3 py-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {data.rows.map((r) => {
                const [impact, tone] = IMPACT(r);
                return (
                  <tr
                    key={r.entryKey}
                    onClick={() => setSelected(r)}
                    className="cursor-pointer hover:bg-slate-50"
                    title="Open source transaction"
                  >
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.date ? String(r.date).slice(0, 10) : '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TYPE_STYLE[r.transactionType] || 'bg-slate-100 text-slate-700'}`}>{r.transactionLabel}</span>
                      <div className="mt-0.5 font-mono text-[11px] text-blue-600">{r.referenceNumber}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">
                      {r.material}
                      {r.machineSerial && <span className="ml-1 font-mono text-[11px] text-slate-500">[{r.machineSerial}]</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{r.quantity != null ? `${r.quantity} ${r.unit || ''}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{r.costPerUnit != null ? inr(r.costPerUnit) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap">{inr(r.value)}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><span className="font-semibold">{r.source}</span> → <span className="font-semibold">{r.destination}</span></td>
                    <td className="px-3 py-2 text-red-800 bg-red-50/40 whitespace-nowrap">{r.debitAccount}</td>
                    <td className="px-3 py-2 text-emerald-800 bg-emerald-50/40 whitespace-nowrap">{r.creditAccount}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.projectName}<div className="text-[11px] text-slate-400">{r.siteName} · {r.taskName}</div></td>
                    <td className={`px-3 py-2 whitespace-nowrap font-semibold ${tone}`}>{impact}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap"><span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">{r.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(data.pagination?.totalPages || 1) > 1 && (
        <div className="flex items-center justify-between pt-1 text-xs">
          <span className="text-slate-500">Page {page} of {data.pagination.totalPages}</span>
          <div className="flex gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50">Prev</button>
            <button type="button" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50">Next</button>
          </div>
        </div>
      )}

      <LedgerEntryModal entry={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}

function Field({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value === null || value === undefined || value === '' ? '—' : String(value)}</span>
    </div>
  );
}

/** One ledger entry opened down to its source transaction. */
function LedgerEntryModal({ entry, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!entry) { setDetail(null); return; }
    setDetail(null);
    setError(null);
    financeApi
      .ledgerEntry({ type: entry.transactionType, id: entry.sourceId })
      .then(setDetail)
      .catch((e) => setError(toApiError(e)));
  }, [entry]);

  if (!entry) return null;
  const e = detail?.entry;
  const rel = detail?.related || {};
  const sources = [
    ['Procurement request', rel.procurementRequest && `${rel.procurementRequest.request_number}${rel.procurementRequest.warehouse_transaction_number ? ` · stock tx ${rel.procurementRequest.warehouse_transaction_number}` : ''}`],
    ['Vehicle / driver', rel.procurementRequest && [rel.procurementRequest.vehicle_number, rel.procurementRequest.driver_name, rel.procurementRequest.driver_phone].filter(Boolean).join(' · ')],
    ['Movement', rel.movement && `${rel.movement.movement_number} · ${rel.movement.status}${rel.movement.request_number ? ` · ${rel.movement.request_number}` : ''}`],
    ['Issue / receive ledger', rel.movement && [rel.movement.issue_tx, rel.movement.receive_tx].filter(Boolean).join(' → ')],
    ['Vehicle (dispatch → verified at receipt)', rel.movement && [rel.movement.vehicle_number, rel.movement.received_vehicle_number].filter(Boolean).join(' → ')],
    ['Daily work update', rel.dailyWork && `DWU-${rel.dailyWork.id} · ${rel.dailyWork.quantity_used} used @ ${rel.dailyWork.unit_cost}`],
    ['Stock issue', rel.dailyWork?.transaction_number],
    ['Expense record', rel.dailyWork?.expense_number || rel.allocation?.expense_number],
    ['Machine allocation', rel.allocation && `#${rel.allocation.id} · ${String(rel.allocation.start_date).slice(0, 10)} → ${rel.allocation.returned_date ? String(rel.allocation.returned_date).slice(0, 10) : 'active'} · ${rel.allocation.usage_days ?? '—'} day(s)`],
    ['Usage charge / unbilled', rel.allocation && `${rel.allocation.usage_charge} / ${rel.allocation.unbilled_balance}`],
    ['Rental', rel.rental && `${rel.rental.rate_per_day}/day · total ${rel.rental.total_cost} · allocated ${rel.rental.allocated_cost}`],
    ['Payment', rel.payment && `${rel.payment.payment_reference} · ${rel.payment.amount}`],
    ['Machine asset', rel.unit && `${rel.unit.serial_number} · cost ${rel.unit.purchase_cost}`],
  ].filter(([, v]) => v);

  return (
    <Modal isOpen onClose={onClose} title={entry.transactionLabel} description={entry.referenceNumber} size="lg"
      footer={<Button variant="secondary" size="sm" onClick={onClose}><X className="mr-1 h-3.5 w-3.5" />Close</Button>}>
      {error && <Alert tone="error">{error.message}</Alert>}
      {!detail && !error && <Skeleton className="h-40 w-full" />}
      {e && (
        <div className="space-y-4">
          <div>
            <Field label="Date" value={e.date ? String(e.date).slice(0, 10) : ''} />
            <Field label="Item / machine" value={`${e.item || ''}${e.machineSerial ? ` [${e.machineSerial}]` : ''}`} />
            <Field label="Quantity" value={e.quantity != null ? `${e.quantity} ${e.unit || ''}` : ''} />
            <Field label="Cost per unit" value={e.costPerUnit != null ? inr(e.costPerUnit) : ''} />
            <Field label="Value" value={inr(e.value)} />
            <Field label="Source" value={e.source} />
            <Field label="Destination" value={e.destination} />
            <Field label="Debit" value={e.debitAccount} />
            <Field label="Credit" value={e.creditAccount} />
            <Field label="Project" value={e.project} />
            <Field label="Site" value={e.site} />
            <Field label="Task" value={e.task} />
            <Field label="Vendor" value={e.vendor} />
            <Field label="Contractor" value={e.contractor} />
            <Field label="Recorded by" value={e.user} />
            <Field label="Status" value={e.status} />
            <Field label="Counts as project expense" value={e.affectsExpense ? 'Yes — recorded once, here' : 'No'} />
          </div>
          {sources.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"><ExternalLink className="h-3 w-3" /> Source transaction</p>
              {sources.map(([label, value]) => <Field key={label} label={label} value={value} />)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
