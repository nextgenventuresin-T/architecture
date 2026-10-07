import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Eye, Check } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card } from '../../../components/ui/Card';
import DataTable from '../../../components/ui/DataTable';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Pagination from '../../../components/projects/Pagination';
import ApprovalSummary from '../../../components/approvals/ApprovalSummary';
import ApprovalFilters from '../../../components/approvals/ApprovalFilters';
import ApprovalDetailModal from '../../../components/approvals/ApprovalDetailModal';
import useAsync from '../../../hooks/useAsync';
import { approvalsApi } from '../../../api/approvalsApi';
import { formatCurrency, formatDate } from '../../../utils/format';
import {
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_TONE,
  MODULE_LABELS,
  PRIORITY_LABELS,
  PRIORITY_TONE,
  INITIAL_APPROVAL_FILTERS,
  formatSourceStatus,
} from '../../../utils/approvalOptions';

/**
 * Interface 12 — the central Approvals screen.
 *
 * One queue over every module that raises approvals. Nothing here is
 * module-specific: the row shape, the filters and the detail dialog all come
 * from the API, so adding a fifth approval type on the server needs no change
 * to this page.
 *
 * `basePath` lets the same page serve the Admin area and the HR / Procurement
 * / Finance role workspaces, exactly as FinanceDashboardPage and
 * ProcurementListPage already do. What each of those users actually sees is
 * decided server-side from their role, not by this prop.
 */
export default function ApprovalsPage({ basePath = '/admin' }) {
  const [filters, setFilters] = useState(INITIAL_APPROVAL_FILTERS);
  const [lookups, setLookups] = useState({ modules: [], projects: [], sites: [] });
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [flash, setFlash] = useState(null);

  const loadSideData = useCallback(() => {
    // Filters and the counts strip are an enhancement — if either call fails
    // the queue itself must still render, so neither is allowed to throw.
    approvalsApi
      .lookups()
      .then(setLookups)
      .catch(() => setLookups({ modules: [], projects: [], sites: [] }));
    approvalsApi
      .summary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  useEffect(loadSideData, [loadSideData]);

  const load = useCallback(
    () =>
      approvalsApi.list({
        search: filters.search || undefined,
        status: filters.status,
        module: filters.module,
        projectId: filters.projectId !== 'all' ? filters.projectId : undefined,
        siteId: filters.siteId !== 'all' ? filters.siteId : undefined,
        priority: filters.priority !== 'all' ? filters.priority : undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        page: filters.page,
        pageSize: 10,
      }),
    [
      filters.search, filters.status, filters.module, filters.projectId,
      filters.siteId, filters.priority, filters.dateFrom, filters.dateTo, filters.page,
    ]
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const approvals = data?.approvals ?? [];

  /** After a decision, the queue and the counts are both stale. */
  const handleDecided = (decision) => {
    setFlash(decision === 'approved' ? 'Approval recorded.' : 'Rejection recorded.');
    reload();
    loadSideData();
  };

  useEffect(() => {
    if (!flash) return undefined;
    const timer = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

  const columns = [
    {
      key: 'reference',
      header: 'Approval ID',
      render: (row) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setSelected(row)}
            className="font-medium text-ink hover:text-brand-700 hover:underline"
          >
            {row.reference}
          </button>
          {row.extraReference && <p className="mt-0.5 text-xs text-ink-subtle">{row.extraReference}</p>}
        </div>
      ),
    },
    {
      key: 'module',
      header: 'Module',
      render: (row) => (
        <Badge tone="brand">{row.moduleLabel ?? MODULE_LABELS[row.module] ?? row.module}</Badge>
      ),
    },
    {
      key: 'request',
      header: 'Request',
      render: (row) => (
        <div className="min-w-0 max-w-[16rem]">
          <p className="truncate text-ink">{row.title}</p>
          {row.amount !== null && row.amount !== undefined && (
            <p className="text-xs text-ink-subtle">{formatCurrency(row.amount)}</p>
          )}
        </div>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      render: (row) => <span className="text-ink-muted">{row.project?.name ?? '—'}</span>,
    },
    {
      key: 'site',
      header: 'Site',
      render: (row) => <span className="text-ink-muted">{row.site?.name ?? '—'}</span>,
    },
    {
      key: 'requestedBy',
      header: 'Requested by',
      render: (row) => <span className="text-ink-muted">{row.requestedBy?.name ?? '—'}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) => <span className="whitespace-nowrap text-ink-muted">{formatDate(row.requestedOn)}</span>,
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) =>
        row.priority ? (
          <Badge tone={PRIORITY_TONE[row.priority] ?? 'neutral'}>
            {PRIORITY_LABELS[row.priority] ?? row.priority}
          </Badge>
        ) : (
          // Not every workflow has a priority; inventing "Medium" here would
          // read as real data the requester never entered.
          <span className="text-ink-subtle">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div>
          <Badge tone={APPROVAL_STATUS_TONE[row.status] ?? 'neutral'}>
            {APPROVAL_STATUS_LABELS[row.status] ?? row.status}
          </Badge>
          <p className="mt-0.5 text-xs text-ink-subtle">{formatSourceStatus(row.sourceStatus)}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => <RowActions row={row} onOpen={setSelected} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Every request awaiting a decision, from every module, in one queue."
        breadcrumbs={[{ label: 'Dashboard', to: basePath }, { label: 'Approvals' }]}
      />

      {flash && (
        <Alert tone="success" className="mb-4" title={flash}>
          The request and its history have been updated.
        </Alert>
      )}

      {summary && (
        <ApprovalSummary
          summary={summary}
          onSelectFilters={(patch) => setFilters({ ...INITIAL_APPROVAL_FILTERS, ...patch })}
        />
      )}

      {error ? (
        <>
          <Alert
            tone="error"
            title={error.code === 'FORBIDDEN' ? 'You do not have access to approvals' : 'Could not load approvals'}
          >
            {error.message}
          </Alert>
          {error.code !== 'FORBIDDEN' && (
            <Button className="mt-4" onClick={reload}>
              Try again
            </Button>
          )}
        </>
      ) : (
        <Card>
          <div className="border-b border-line px-5 py-4">
            <ApprovalFilters
              filters={filters}
              onChange={setFilters}
              modules={lookups.modules}
              projects={lookups.projects}
              sites={lookups.sites}
            />
          </div>

          <DataTable
            columns={columns}
            rows={approvals}
            isLoading={isLoading}
            getRowKey={(row) => row.id}
            empty={{
              icon: ClipboardCheck,
              title:
                filters.status === 'pending'
                  ? 'Nothing is waiting for a decision'
                  : 'No approvals match these filters',
              description:
                filters.status === 'pending'
                  ? 'New requests from other modules will appear here as they are submitted.'
                  : 'Clear the filters to see the full queue.',
              action: (
                <Button variant="secondary" onClick={() => setFilters(INITIAL_APPROVAL_FILTERS)}>
                  Clear filters
                </Button>
              ),
            }}
            renderCard={(row) => (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      className="font-medium text-ink hover:text-brand-700"
                    >
                      {row.reference}
                    </button>
                    <p className="mt-0.5 truncate text-xs text-ink-subtle">{row.title}</p>
                  </div>
                  <Badge tone={APPROVAL_STATUS_TONE[row.status] ?? 'neutral'}>
                    {APPROVAL_STATUS_LABELS[row.status] ?? row.status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-ink-muted">
                  {row.moduleLabel ?? MODULE_LABELS[row.module] ?? row.module}
                  {row.project ? ` · ${row.project.name}` : ''}
                  {row.site ? ` · ${row.site.name}` : ''}
                </p>
                <p className="mt-1 text-xs text-ink-subtle">
                  {row.requestedBy?.name ?? '—'} · {formatDate(row.requestedOn)}
                </p>
                <div className="mt-3">
                  <RowActions row={row} onOpen={setSelected} />
                </div>
              </div>
            )}
          />

          <Pagination
            pagination={data?.pagination}
            onChange={(page) => setFilters((f) => ({ ...f, page }))}
          />
        </Card>
      )}

      <ApprovalDetailModal
        approval={selected}
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        onDecided={handleDecided}
        basePath={basePath}
      />
    </>
  );
}

/**
 * `canDecide` is computed per row by the server for the signed-in user, so a
 * reviewer only sees "Review" on the rows they can actually act on. The API
 * re-checks on submit regardless — this only keeps the table honest.
 */
function RowActions({ row, onOpen }) {
  const base =
    'inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium transition-colors';
  const actionable = row.canDecide && row.status === 'pending';

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <button
        type="button"
        onClick={() => onOpen(row)}
        className={
          actionable
            ? `${base} border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100`
            : `${base} text-ink-muted hover:bg-canvas hover:text-ink`
        }
        aria-label={`${actionable ? 'Review' : 'View'} ${row.reference}`}
      >
        {actionable ? (
          <>
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Review
          </>
        ) : (
          <>
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            View
          </>
        )}
      </button>
    </div>
  );
}
