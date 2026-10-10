import { useCallback, useEffect, useState, Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Users,
  Globe,
  Building2,
  MapPin,
  ChevronDown,
  ChevronRight,
  Briefcase,
  TrendingUp,
  TrendingDown,
  FolderPlus,
  ExternalLink,
  Calendar,
} from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import Badge from '../../../components/ui/Badge';
import ClientModal from '../../../components/clients/ClientModal';
import { clientApi } from '../../../api/clientApi';
import { formatNumber, formatCurrency, formatDate } from '../../../utils/format';

export default function ClientListPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedClient, setSelectedClient] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await clientApi.list({
        search: search.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        pageSize: 100,
      });
      setClients(data.clients ?? []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function handleOpenCreate() {
    setSelectedClient(null);
    setIsModalOpen(true);
  }

  function handleOpenEdit(client) {
    setSelectedClient(client);
    setIsModalOpen(true);
  }

  async function handleDelete(client) {
    if (!window.confirm(`Are you sure you want to remove client "${client.name}"?`)) return;
    try {
      await clientApi.remove(client.id);
      load();
    } catch (err) {
      alert(err.message || 'Could not delete client.');
    }
  }

  const toggleExpand = (id) => {
    setExpandedClientId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <PageHeader
        title="Clients & Projects"
        description="Manage clients, tax compliance profiles, and full project history per client."
        actions={
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Client
          </Button>
        }
      />

      {error && <Alert tone="error" className="mb-4">{error.message}</Alert>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients by name, PAN, GSTIN, contact..."
              className="w-full rounded-xl border border-line bg-white pl-9 pr-4 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
        <p className="text-sm text-ink-muted">Total: {formatNumber(clients.length)} clients</p>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : clients.length === 0 ? (
            <div className="p-12 text-center text-ink-subtle">
              <Users className="mx-auto mb-2 h-10 w-10 text-ink-subtle/50" />
              <p className="text-base font-medium">No clients found.</p>
              <p className="text-sm">Add clients to associate them with your projects.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="border-b border-line bg-canvas-subtle text-xs font-semibold uppercase text-ink-subtle">
                  <tr>
                    <th className="w-10 px-3 py-3 text-center">#</th>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3">Tax & Registration</th>
                    <th className="px-5 py-3">Contact</th>
                    <th className="px-5 py-3">Address & Compliance</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {clients.map((c) => {
                    const isExpanded = expandedClientId === c.id;
                    const prjList = c.projects || [];
                    const prjCount = prjList.length;

                    return (
                      <Fragment key={c.id}>
                        <tr className={`hover:bg-canvas transition-colors ${isExpanded ? 'bg-brand-50/20' : ''}`}>
                          {/* Expand Toggle */}
                          <td className="px-3 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => toggleExpand(c.id)}
                              className="rounded p-1 text-ink-muted hover:bg-canvas hover:text-brand-700 transition-colors"
                              title={isExpanded ? 'Hide project history' : 'View project history'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-brand-700" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>

                          {/* Client Name & Type */}
                          <td className="px-5 py-4 font-medium text-ink">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleExpand(c.id)}
                                className="font-semibold text-ink hover:text-brand-700 text-left"
                              >
                                {c.name}
                              </button>
                              <span className="inline-block rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                                {c.clientType || 'Company'}
                              </span>
                              <span
                                onClick={() => toggleExpand(c.id)}
                                className={`cursor-pointer inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                                  prjCount > 0
                                    ? 'bg-brand-100 text-brand-800 hover:bg-brand-200'
                                    : 'bg-canvas text-ink-subtle'
                                }`}
                                title="Click to view all projects"
                              >
                                <Briefcase className="h-3 w-3" />
                                {prjCount} Project{prjCount === 1 ? '' : 's'}
                              </span>
                            </div>
                            {c.website && (
                              <a
                                href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                              >
                                <Globe className="h-3 w-3" />
                                {c.website.replace(/^https?:\/\//, '')}
                              </a>
                            )}
                            {c.cin && (
                              <div className="mt-0.5 text-xs text-ink-subtle font-mono">
                                CIN: {c.cin}
                              </div>
                            )}
                          </td>

                          {/* Tax & Registration */}
                          <td className="px-5 py-4 text-ink-muted">
                            <div className="space-y-1 text-xs">
                              {c.gstin && (
                                <div>
                                  <span className="font-semibold text-ink-subtle mr-1">GSTIN:</span>
                                  <span className="font-mono text-ink bg-canvas px-1.5 py-0.5 rounded border border-line">
                                    {c.gstin}
                                  </span>
                                </div>
                              )}
                              {c.pan && (
                                <div>
                                  <span className="font-semibold text-ink-subtle mr-1">PAN:</span>
                                  <span className="font-mono text-ink bg-canvas px-1.5 py-0.5 rounded border border-line">
                                    {c.pan}
                                  </span>
                                </div>
                              )}
                              {!c.gstin && !c.pan && <span className="text-ink-subtle">—</span>}
                            </div>
                          </td>

                          {/* Contact */}
                          <td className="px-5 py-4 text-ink-muted">
                            <div className="text-xs space-y-0.5">
                              {c.contactPerson && <div className="font-medium text-ink">{c.contactPerson}</div>}
                              {c.phone && <div>{c.phone}</div>}
                              {c.email && <div className="text-ink-subtle">{c.email}</div>}
                              {!c.contactPerson && !c.phone && !c.email && <span className="text-ink-subtle">—</span>}
                            </div>
                          </td>

                          {/* Address & Compliance */}
                          <td className="px-5 py-4 text-ink-muted max-w-xs">
                            <div className="text-xs space-y-1">
                              {(c.corporateAddress || c.address) && (
                                <div className="flex items-start gap-1">
                                  <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-ink-subtle" />
                                  <span className="truncate" title={c.corporateAddress || c.address}>
                                    {c.corporateAddress || c.address}
                                  </span>
                                </div>
                              )}
                              {c.billingAddress && c.billingAddress !== (c.corporateAddress || c.address) && (
                                <div className="text-[11px] text-ink-subtle truncate" title={`Billing: ${c.billingAddress}`}>
                                  <span className="font-medium">Bill:</span> {c.billingAddress}
                                </div>
                              )}
                              {(c.efy || c.adherence) && (
                                <div className="flex items-center gap-2 pt-0.5 text-[11px] text-ink-subtle">
                                  {c.efy && <span>EFY: <strong className="text-ink font-normal">{c.efy}</strong></span>}
                                  {c.adherence && <span>Adherence: <strong className="text-ink font-normal">{c.adherence}</strong></span>}
                                </div>
                              )}
                              {!c.corporateAddress && !c.address && !c.billingAddress && !c.efy && !c.adherence && (
                                <span className="text-ink-subtle">—</span>
                              )}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-5 py-4">
                            <Badge tone={c.status === 'active' || !c.status ? 'positive' : 'neutral'}>
                              {c.status === 'active' || !c.status ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <Link
                                to={`/admin/projects/new?client_id=${c.id}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50/70 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
                                title={`Start new project for ${c.name}`}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Start Project
                              </Link>
                              <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(c)} aria-label="Edit">
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(c)} aria-label="Delete" className="text-red-600 hover:text-red-700">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>

                        {/* EXPANDABLE CLIENT PROJECT HISTORY ROW */}
                        {isExpanded && (
                          <tr className="bg-canvas/50">
                            <td colSpan={7} className="px-6 py-4 border-b border-line">
                              <div className="rounded-xl border border-line bg-white p-4 shadow-xs space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                                      <Building2 className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <h4 className="text-sm font-bold text-ink">
                                        Project History — {c.name}
                                      </h4>
                                      <p className="text-xs text-ink-subtle">
                                        Complete historical relationship, financial tracking, and all projects executed for this client.
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <Link
                                      to={`/admin/projects/new?client_id=${c.id}`}
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-800 transition-colors"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      Start New Project
                                    </Link>
                                  </div>
                                </div>

                                {/* Financial Summary Cards for Client */}
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-xs">
                                  <div className="rounded-lg border border-line bg-canvas/30 p-2.5">
                                    <span className="text-[10px] uppercase font-medium text-ink-subtle">Total Projects</span>
                                    <p className="mt-0.5 font-bold text-ink">{prjCount}</p>
                                  </div>
                                  <div className="rounded-lg border border-line bg-canvas/30 p-2.5">
                                    <span className="text-[10px] uppercase font-medium text-ink-subtle">Total Contract Value</span>
                                    <p className="mt-0.5 font-bold text-ink">{formatCurrency(c.totalContractValue || 0)}</p>
                                  </div>
                                  <div className="rounded-lg border border-line bg-canvas/30 p-2.5">
                                    <span className="text-[10px] uppercase font-medium text-ink-subtle">Total Client Payments</span>
                                    <p className="mt-0.5 font-bold text-emerald-700">{formatCurrency(c.totalPaid || 0)}</p>
                                  </div>
                                  <div className="rounded-lg border border-line bg-canvas/30 p-2.5">
                                    <span className="text-[10px] uppercase font-medium text-ink-subtle">Remaining Client Due</span>
                                    <p className="mt-0.5 font-bold text-amber-700">{formatCurrency(c.totalDue || 0)}</p>
                                  </div>
                                  <div className="rounded-lg border border-line bg-canvas/30 p-2.5">
                                    <span className="text-[10px] uppercase font-medium text-ink-subtle">Total Net Profit</span>
                                    <p className={`mt-0.5 font-bold ${((c.totalContractValue || 0) - prjList.reduce((s, p) => s + (p.actualCost || 0), 0)) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                      {formatCurrency((c.totalContractValue || 0) - prjList.reduce((s, p) => s + (p.actualCost || 0), 0))}
                                    </p>
                                  </div>
                                </div>

                                {/* Projects Table */}
                                {prjList.length === 0 ? (
                                  <div className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-ink-subtle">
                                    <Briefcase className="mx-auto mb-1.5 h-6 w-6 text-ink-subtle/40" />
                                    <p className="font-medium text-ink">No projects registered under this client yet.</p>
                                    <p className="mt-0.5 text-ink-muted">
                                      Click &quot;Start New Project&quot; above to create the first project under {c.name}.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto rounded-lg border border-line">
                                    <table className="w-full text-left text-xs border-collapse">
                                      <thead className="bg-canvas-subtle border-b border-line text-[11px] font-semibold text-ink-subtle uppercase">
                                        <tr>
                                          <th className="px-3.5 py-2.5">Project</th>
                                          <th className="px-3 py-2.5">Timeline</th>
                                          <th className="px-3 py-2.5">Status</th>
                                          <th className="px-3 py-2.5 text-right">Project Budget</th>
                                          <th className="px-3 py-2.5 text-right">Actual Cost</th>
                                          <th className="px-3 py-2.5 text-right">Contractor Cost</th>
                                          <th className="px-3 py-2.5 text-right">Client Payments</th>
                                          <th className="px-3 py-2.5 text-right">Remaining Due</th>
                                          <th className="px-3 py-2.5 text-right">Profit / Loss</th>
                                          <th className="px-3 py-2.5 text-right">Action</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-line">
                                        {prjList.map((p) => {
                                          const isProfitable = (p.profitLoss || 0) >= 0;

                                          return (
                                            <tr key={p.id} className="hover:bg-canvas transition-colors">
                                              {/* Project Name & Code */}
                                              <td className="px-3.5 py-3 font-medium text-ink">
                                                <Link
                                                  to={`/admin/projects/${p.id}`}
                                                  className="font-semibold text-brand-700 hover:underline flex items-center gap-1"
                                                >
                                                  {p.name}
                                                </Link>
                                                <span className="font-mono text-[10px] text-ink-muted">
                                                  {p.code}
                                                </span>
                                              </td>

                                              {/* Timeline */}
                                              <td className="px-3 py-3 text-ink-muted whitespace-nowrap">
                                                <div className="flex items-center gap-1 text-[11px]">
                                                  <Calendar className="h-3 w-3 text-ink-subtle" />
                                                  <span>{p.startDate ? formatDate(p.startDate) : '—'}</span>
                                                  <span>→</span>
                                                  <span>{p.expectedCompletion ? formatDate(p.expectedCompletion) : '—'}</span>
                                                </div>
                                              </td>

                                              {/* Status */}
                                              <td className="px-3 py-3">
                                                <Badge
                                                  tone={
                                                    p.status === 'completed'
                                                      ? 'success'
                                                      : p.status === 'delayed'
                                                      ? 'error'
                                                      : 'info'
                                                  }
                                                >
                                                  {p.status || 'Active'}
                                                </Badge>
                                              </td>

                                              {/* Budget */}
                                              <td className="px-3 py-3 text-right font-semibold text-ink tabular-nums">
                                                {formatCurrency(p.projectBudget || 0)}
                                              </td>

                                              {/* Actual Cost */}
                                              <td className="px-3 py-3 text-right font-medium text-ink-muted tabular-nums">
                                                {formatCurrency(p.actualCost || 0)}
                                              </td>

                                              {/* Contractor Cost */}
                                              <td className="px-3 py-3 text-right text-ink-muted tabular-nums">
                                                {formatCurrency(p.contractorCost || 0)}
                                              </td>

                                              {/* Client Payments */}
                                              <td className="px-3 py-3 text-right font-semibold text-emerald-700 tabular-nums">
                                                {formatCurrency(p.clientPayments || 0)}
                                              </td>

                                              {/* Remaining Due */}
                                              <td className="px-3 py-3 text-right font-semibold text-amber-700 tabular-nums">
                                                {formatCurrency(p.dueAmount || 0)}
                                              </td>

                                              {/* Profit / Loss */}
                                              <td className="px-3 py-3 text-right font-bold tabular-nums">
                                                <span
                                                  className={`inline-flex items-center gap-0.5 ${
                                                    isProfitable ? 'text-emerald-700' : 'text-rose-700'
                                                  }`}
                                                >
                                                  {isProfitable ? (
                                                    <TrendingUp className="h-3 w-3" />
                                                  ) : (
                                                    <TrendingDown className="h-3 w-3" />
                                                  )}
                                                  {formatCurrency(p.profitLoss || 0)}
                                                </span>
                                              </td>

                                              {/* Action */}
                                              <td className="px-3 py-3 text-right">
                                                <Link
                                                  to={`/admin/projects/${p.id}`}
                                                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
                                                >
                                                  View
                                                  <ExternalLink className="h-3 w-3" />
                                                </Link>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <ClientModal
        isOpen={isModalOpen}
        client={selectedClient}
        onClose={() => setIsModalOpen(false)}
        onSaved={() => load()}
      />
    </>
  );
}
