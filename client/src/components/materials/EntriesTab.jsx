import { useState } from 'react';
import { Package, Check, X } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';

/**
 * Every delivery of this material, with inline recording of how much has been
 * consumed. Remaining stock is always quantity minus used, never stored, so
 * editing usage here immediately moves the material's stock position.
 */
export default function EntriesTab({ material, entries, onRecordUsage, savingEntryId }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState(null);

  function startEdit(row) {
    setEditingId(row.id);
    setDraft(String(row.used_quantity));
    setLocalError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft('');
    setLocalError(null);
  }

  async function commit(row) {
    const used = Number(draft);
    if (Number.isNaN(used) || used < 0) {
      setLocalError('Enter a valid quantity.');
      return;
    }
    if (used > Number(row.quantity)) {
      setLocalError(`Cannot exceed the ${formatNumber(row.quantity)} received.`);
      return;
    }
    await onRecordUsage(row.id, used);
    cancelEdit();
  }

  const usageCell = (row) =>
    editingId === row.id ? (
      <div className="flex items-center justify-end gap-1.5">
        <input
          type="number"
          min="0"
          max={row.quantity}
          step="0.01"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Used quantity"
          className="h-8 w-24 rounded-lg border border-line px-2 text-right text-sm tabular-nums text-ink focus:border-brand-500 focus:shadow-focus focus:outline-none"
        />
        <button
          type="button"
          onClick={() => commit(row)}
          disabled={savingEntryId === row.id}
          aria-label="Save used quantity"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          aria-label="Cancel"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-muted hover:bg-canvas"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => startEdit(row)}
        className="tabular-nums text-ink-muted underline decoration-dotted underline-offset-2 hover:text-brand-700"
        aria-label={`Record usage for the delivery on ${formatDate(row.received_date)}`}
      >
        {formatNumber(row.used_quantity)} {material.unit}
      </button>
    );

  const columns = [
    {
      key: 'location',
      header: 'Project / site',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.site_name || `${row.project_name} — store`}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {row.project_code} · {formatDate(row.received_date)}
          </p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Received',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-ink">
          {formatNumber(row.quantity)} {material.unit}
        </span>
      ),
    },
    { key: 'used', header: 'Used', align: 'right', render: usageCell },
    {
      key: 'remaining',
      header: 'Remaining',
      align: 'right',
      render: (row) => {
        const remaining = Number(row.remaining_quantity);
        return (
          <span className={`tabular-nums ${remaining <= 0 ? 'text-ink-subtle' : 'font-medium text-ink'}`}>
            {formatNumber(remaining)} {material.unit}
          </span>
        );
      },
    },
    { key: 'rate', header: 'Rate', align: 'right', render: (row) => <span className="tabular-nums text-ink-muted">{formatCurrency(row.rate)}</span> },
    { key: 'total', header: 'Total cost', align: 'right', render: (row) => <span className="tabular-nums text-ink">{formatCurrency(row.total_cost)}</span> },
    { key: 'supplier', header: 'Supplier', render: (row) => <span className="text-ink-muted">{row.supplier || '—'}</span> },
  ];

  return (
    <Card>
      <CardHeader
        title="Stock entries"
        description={`${entries.length} deliver${entries.length === 1 ? 'y' : 'ies'} · click a used figure to record consumption`}
      />
      {localError && (
        <p className="border-b border-line bg-danger-soft px-5 py-2.5 text-sm text-danger">{localError}</p>
      )}
      <DataTable
        columns={columns}
        rows={entries}
        empty={{
          icon: Package,
          title: 'No stock entries yet',
          description: 'Use "Add stock" to record the first delivery of this material.',
        }}
        renderCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{row.site_name || `${row.project_name} — store`}</p>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {row.project_code} · {formatDate(row.received_date)}
                </p>
              </div>
              <Badge tone={Number(row.remaining_quantity) > 0 ? 'positive' : 'neutral'}>
                {formatNumber(row.remaining_quantity)} {material.unit} left
              </Badge>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Received {formatNumber(row.quantity)} · used {formatNumber(row.used_quantity)} ·{' '}
              {formatCurrency(row.total_cost)}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">{row.supplier || 'No supplier recorded'}</p>
            <div className="mt-3">
              <Button variant="secondary" onClick={() => startEdit(row)}>
                Record usage
              </Button>
            </div>
          </div>
        )}
      />
    </Card>
  );
}
