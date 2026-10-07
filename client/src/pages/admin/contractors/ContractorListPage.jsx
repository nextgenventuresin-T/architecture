import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Pencil, Building2, HardHat } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card } from '../../../components/ui/Card';
import DataTable from '../../../components/ui/DataTable';
import Badge, { StatusBadge } from '../../../components/ui/Badge';
import ProgressBar from '../../../components/ui/ProgressBar';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import ContractorFilters from '../../../components/contractors/ContractorFilters';
import AssignContractorDialog from '../../../components/contractors/AssignContractorDialog';
import Pagination from '../../../components/projects/Pagination';
import useAsync from '../../../hooks/useAsync';
import { contractorsApi } from '../../../api/contractorsApi';
import { CONTRACTOR_STATUS_TONE, CONTRACTOR_TYPE_LABELS } from '../../../utils/contractorOptions';

const INITIAL_FILTERS = { search: '', status: 'all', type: 'all', page: 1 };

export default function ContractorListPage() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [assigning, setAssigning] = useState(null);
  const [banner, setBanner] = useState(null);

  const load = useCallback(
    () => contractorsApi.list({
      search: filters.search || undefined,
      status: filters.status,
      type: filters.type,
      page: filters.page,
      pageSize: 10,
    }),
    [filters.search, filters.status, filters.type, filters.page]
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const contractors = data?.contractors ?? [];

  const columns = [
    {
      key: 'name',
      header: 'Contractor',
      render: (row) => (
        <div className="min-w-0">
          <Link to={`/admin/contractors/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
            {row.name}
          </Link>
          <p className="mt-0.5 text-xs text-ink-subtle">{row.contactPerson || 'No contact person'}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Phone / Email',
      render: (row) => (
        <div className="text-ink-muted">
          <p>{row.phone || '—'}</p>
          <p className="text-xs text-ink-subtle">{row.email || '—'}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (row) => <Badge tone="brand">{CONTRACTOR_TYPE_LABELS[row.type] ?? row.type}</Badge> },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={CONTRACTOR_STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge> },
    {
      key: 'assigned',
      header: 'Assigned',
      render: (row) => (
        <div className="whitespace-nowrap text-ink-muted">
          <p>{row.stats.projectCount} project{row.stats.projectCount === 1 ? '' : 's'}</p>
          <p className="text-xs text-ink-subtle">{row.stats.siteCount} site{row.stats.siteCount === 1 ? '' : 's'} · {row.stats.labourCount} labour</p>
        </div>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (row) => (
        <div className="w-28">
          <ProgressBar value={row.stats.progress} status="on-track" showLabel />
        </div>
      ),
    },
    {
      key: 'payment',
      header: 'Payment',
      render: (row) => (row.stats.contractValue > 0 ? <StatusBadge status={row.stats.paymentStatus} /> : <span className="text-ink-subtle">—</span>),
    },
    {
      key: 'approvals',
      header: 'Pending',
      render: (row) =>
        row.stats.pendingApprovals > 0 ? (
          <Badge tone="warning">{row.stats.pendingApprovals}</Badge>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => <RowActions row={row} navigate={navigate} onAssign={setAssigning} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Contractors"
        description="Every contractor, their assigned work, labour, payments and pending approvals."
        breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Contractors' }]}
        actions={
          <Link to="/admin/contractors/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add contractor
            </Button>
          </Link>
        }
      />

      {banner && <Alert tone={banner.tone} className="mb-4">{banner.message}</Alert>}

      {error ? (
        <>
          <Alert tone="error" title="Could not load contractors">{error.message}</Alert>
          <Button className="mt-4" onClick={reload}>Try again</Button>
        </>
      ) : (
        <Card>
          <div className="border-b border-line px-5 py-4">
            <ContractorFilters filters={filters} onChange={setFilters} />
          </div>

          <DataTable
            columns={columns}
            rows={contractors}
            isLoading={isLoading}
            empty={{
              icon: HardHat,
              title: 'No contractors match these filters',
              description: 'Clear the filters, or add the first contractor to get started.',
              action: <Button variant="secondary" onClick={() => setFilters(INITIAL_FILTERS)}>Clear filters</Button>,
            }}
            renderCard={(row) => (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/admin/contractors/${row.id}`} className="font-medium text-ink hover:text-brand-700">{row.name}</Link>
                    <p className="mt-0.5 text-xs text-ink-subtle">{row.contactPerson || 'No contact person'}</p>
                  </div>
                  <Badge tone={CONTRACTOR_STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-ink-muted">
                  {CONTRACTOR_TYPE_LABELS[row.type] ?? row.type} · {row.stats.projectCount} project{row.stats.projectCount === 1 ? '' : 's'} · {row.stats.labourCount} labour
                </p>
                <ProgressBar value={row.stats.progress} status="on-track" showLabel className="mt-3" />
                <div className="mt-3">
                  <RowActions row={row} navigate={navigate} onAssign={setAssigning} />
                </div>
              </div>
            )}
          />

          <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
        </Card>
      )}

      <AssignContractorDialog
        contractor={assigning}
        onClose={() => setAssigning(null)}
        onSaved={(message) => {
          setAssigning(null);
          setBanner({ tone: 'success', message });
          reload();
        }}
      />
    </>
  );
}

function RowActions({ row, navigate, onAssign }) {
  const base = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium transition-colors';

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Link to={`/admin/contractors/${row.id}`} className={`${base} text-ink-muted hover:bg-canvas hover:text-ink`} aria-label={`View ${row.name}`}>
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        View
      </Link>
      <button type="button" onClick={() => navigate(`/admin/contractors/${row.id}/edit`)} className={`${base} text-ink-muted hover:bg-canvas hover:text-ink`} aria-label={`Edit ${row.name}`}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Edit
      </button>
      <button type="button" onClick={() => onAssign(row)} className={`${base} border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100`} aria-label={`Assign ${row.name}`}>
        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
        Assign
      </button>
    </div>
  );
}
