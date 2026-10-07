import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Users, Globe, Building2, ShieldCheck, MapPin } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import Badge from '../../../components/ui/Badge';
import ClientModal from '../../../components/clients/ClientModal';
import { clientApi } from '../../../api/clientApi';
import { formatNumber } from '../../../utils/format';

export default function ClientListPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedClient, setSelectedClient] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  return (
    <>
      <PageHeader
        title="Clients"
        description="Manage client directory, tax profiles, contact records, and project assignments."
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
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-canvas-subtle text-xs font-semibold uppercase text-ink-subtle">
                  <tr>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3">Tax & Registration</th>
                    <th className="px-5 py-3">Contact</th>
                    <th className="px-5 py-3">Address & Compliance</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {clients.map((c) => (
                    <tr key={c.id} className="hover:bg-canvas">
                      {/* Client Name & Type */}
                      <td className="px-5 py-4 font-medium text-ink">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">{c.name}</span>
                          <span className="inline-block rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                            {c.clientType || 'Company'}
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
                        <div className="inline-flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(c)} aria-label="Edit">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(c)} aria-label="Delete" className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
