import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Pencil, Package, Warehouse, Wrench, Edit2, Trash2 } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card } from '../../../components/ui/Card';
import DataTable from '../../../components/ui/DataTable';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import MaterialFilters from '../../../components/materials/MaterialFilters';
import Pagination from '../../../components/projects/Pagination';
import ToolModal from '../../../components/tools/ToolModal';
import ToolUnitsPanel from '../../../components/tools/ToolUnitsPanel';
import useAsync from '../../../hooks/useAsync';
import { materialsApi } from '../../../api/materialsApi';
import { toolApi } from '../../../api/toolApi';
import { MATERIAL_STATUS_LABELS, MATERIAL_STATUS_TONE } from '../../../utils/materialOptions';

const INITIAL_FILTERS = {
  search: '',
  category: 'all',
  status: 'all',
  page: 1,
};

export default function MaterialListPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('materials');

  // Materials state
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [lookups, setLookups] = useState({ categories: [] });

  // Tools state
  const [tools, setTools] = useState([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const [selectedTool, setSelectedTool] = useState(null);
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [registerSignal, setRegisterSignal] = useState(0);

  const loadLookups = useCallback(() => {
    materialsApi
      .lookups()
      .then((d) => setLookups({ categories: d.categories ?? [] }))
      .catch(() => setLookups({ categories: [] }));
  }, []);

  useEffect(loadLookups, [loadLookups]);

  const load = useCallback(
    () =>
      materialsApi.list({
        search: filters.search || undefined,
        category: filters.category,
        status: filters.status,
        page: filters.page,
        pageSize: 10,
      }),
    [filters.search, filters.category, filters.status, filters.page]
  );

  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const materials = data?.materials ?? [];

  const loadTools = useCallback(async () => {
    setLoadingTools(true);
    try {
      const data = await toolApi.list({ search: toolSearch.trim() || undefined, pageSize: 100 });
      setTools(data.tools ?? []);
    } catch (_) {
      setTools([]);
    } finally {
      setLoadingTools(false);
    }
  }, [toolSearch]);

  useEffect(() => {
    if (activeTab === 'tools') {
      loadTools();
    }
  }, [activeTab, loadTools]);

  async function handleDeleteTool(tool) {
    if (!window.confirm(`Are you sure you want to delete tool "${tool.name}"?`)) return;
    try {
      await toolApi.remove(tool.id);
      loadTools();
    } catch (err) {
      alert(err.message || 'Could not delete tool.');
    }
  }

  const columns = [
    {
      key: 'material',
      header: 'Material',
      render: (row) => (
        <div className="min-w-0">
          <Link to={`/admin/materials/${row.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
            {row.name}
          </Link>
          <p className="mt-0.5 text-xs text-ink-subtle">{row.code}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (row) => <span className="text-ink-muted">{row.category}</span> },
    { key: 'unit', header: 'Unit', render: (row) => <span className="text-ink-muted">{row.unit}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={MATERIAL_STATUS_TONE[row.status] ?? 'neutral'}>
          {MATERIAL_STATUS_LABELS[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => <RowActions row={row} navigate={navigate} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Materials & Tools"
        description="Master catalogue for construction materials, machinery and site tools."
        breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Materials & Tools' }]}
        actions={
          activeTab === 'materials' ? (
            <Link to="/admin/materials/new">
              <Button className="gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add material
              </Button>
            </Link>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button className="gap-2" onClick={() => setRegisterSignal((n) => n + 1)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add machine with serial no.
              </Button>
              <Button
                variant="secondary"
                className="gap-2"
                onClick={() => {
                  setSelectedTool(null);
                  setIsToolModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add machine type
              </Button>
            </div>
          )
        }
      />

      {/* Tab Switcher */}
      <div className="mb-6 flex border-b border-line">
        <button
          type="button"
          onClick={() => setActiveTab('materials')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'materials'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <Package className="h-4 w-4" />
          Materials Master
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tools')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'tools'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <Wrench className="h-4 w-4" />
          Machines & Tools Master
        </button>
      </div>

      {activeTab === 'materials' && (
        <>
          <Alert tone="info" className="mb-4">
            <span className="inline-flex items-center gap-1.5">
              <Warehouse className="h-4 w-4" aria-hidden="true" />
              Looking for stock quantities? Open <Link to="/admin/warehouse" className="font-medium underline">Warehouse</Link> — it is the single source of truth for available, received, issued and transferred stock.
            </span>
          </Alert>

          {error ? (
            <>
              <Alert tone="error" title="Could not load materials">{error.message}</Alert>
              <Button className="mt-4" onClick={reload}>Try again</Button>
            </>
          ) : (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <MaterialFilters filters={filters} categories={lookups.categories} onChange={setFilters} />
              </div>

              <DataTable
                columns={columns}
                rows={materials}
                isLoading={isLoading}
                empty={{
                  icon: Package,
                  title: 'No materials match these filters',
                  description: 'Clear the filters, or add a new material to the catalogue.',
                  action: (
                    <Button variant="secondary" onClick={() => setFilters(INITIAL_FILTERS)}>
                      Clear filters
                    </Button>
                  ),
                }}
                renderCard={(row) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`/admin/materials/${row.id}`} className="font-medium text-ink hover:text-brand-700">
                          {row.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-subtle">{row.code} · {row.category}</p>
                      </div>
                      <Badge tone={MATERIAL_STATUS_TONE[row.status] ?? 'neutral'}>
                        {MATERIAL_STATUS_LABELS[row.status] ?? row.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-ink-muted">Unit: {row.unit}</p>
                    <div className="mt-3">
                      <RowActions row={row} navigate={navigate} />
                    </div>
                  </div>
                )}
              />

              <Pagination pagination={data?.pagination} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
            </Card>
          )}
        </>
      )}

      {activeTab === 'tools' && (
        <>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="relative max-w-sm flex-1">
              <input
                type="text"
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                placeholder="Search machine types by name or type..."
                className="w-full rounded-xl border border-line bg-white px-4 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none"
              />
            </div>
            <p className="text-sm text-ink-muted">Total: {tools.length} tools/machines</p>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-canvas-subtle text-xs font-semibold uppercase text-ink-subtle">
                  <tr>
                    <th className="px-6 py-3">Tool / Machine type</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Serial units</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tools.map((t) => (
                    <tr key={t.id} className="hover:bg-canvas">
                      <td className="px-6 py-4 font-medium text-ink">{t.name}</td>
                      <td className="px-6 py-4 text-ink-muted">{t.type}</td>
                      <td className="px-6 py-4 text-ink-muted">
                        <span className="font-semibold text-ink">{t.availableQuantity ?? 0}</span> available · {t.allocatedQuantity ?? 0} out · {t.totalQuantity ?? 0} total
                      </td>
                      <td className="px-6 py-4 text-ink-muted truncate max-w-xs">{t.description || '—'}</td>
                      <td className="px-6 py-4">
                        <Badge tone={t.status === 'active' ? 'success' : 'neutral'}>
                          {t.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedTool(t);
                              setIsToolModalOpen(true);
                            }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTool(t)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tools.length === 0 && !loadingTools && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-ink-subtle">
                        No tools found. Click "Add Machine / Tool" to create one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <ToolUnitsPanel tools={tools} mode="admin" onChanged={loadTools} registerSignal={registerSignal} />

          <ToolModal
            isOpen={isToolModalOpen}
            tool={selectedTool}
            onClose={() => setIsToolModalOpen(false)}
            onSaved={() => loadTools()}
          />
        </>
      )}
    </>
  );
}

function RowActions({ row, navigate }) {
  const base =
    'inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium transition-colors';

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Link
        to={`/admin/materials/${row.id}`}
        className={`${base} text-ink-muted hover:bg-canvas hover:text-ink`}
        aria-label={`View ${row.name}`}
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        View
      </Link>
      <button
        type="button"
        onClick={() => navigate(`/admin/materials/${row.id}/edit`)}
        className={`${base} text-ink-muted hover:bg-canvas hover:text-ink`}
        aria-label={`Edit ${row.name}`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Edit
      </button>
    </div>
  );
}
