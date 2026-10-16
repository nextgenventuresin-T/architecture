import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  User,
  CreditCard,
  Edit2,
  Eye,
  Trash2,
  CheckCircle2,
  ShoppingBag,
  Store,
} from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Modal from '../../../components/ui/Modal';
import InfoList from '../../../components/projects/InfoList';
import VendorFormModal from './VendorFormModal';
import { vendorApi } from '../../../api/vendorApi';
import { formatCurrency, formatDate } from '../../../utils/format';
import SearchableSelect from '../../../components/ui/SearchableSelect';
import { PROCUREMENT_STATUS_LABELS } from '../../../utils/procurementOptions';

export default function VendorListPage() {
  const [vendors, setVendors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Filters: search matches name, contact person, city, phone, email, GST and address (every word).
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [city, setCity] = useState('');
  const [cities, setCities] = useState([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [viewing, setViewing] = useState(null);

  const loadVendors = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    vendorApi
      .list({ search: search.trim() || undefined, status: status !== 'all' ? status : undefined, city: city || undefined, pageSize: 200 })
      .then((res) => setVendors(res.vendors || []))
      .catch((err) => setLoadError(err.response?.data?.error?.message || err.message || 'Could not load vendors.'))
      .finally(() => setIsLoading(false));
  }, [search, status, city]);

  const loadCities = useCallback(() => {
    vendorApi.cities().then(setCities).catch(() => setCities([]));
  }, []);

  // Live search, debounced so typing does not fire a request per key.
  useEffect(() => {
    const t = setTimeout(loadVendors, 250);
    return () => clearTimeout(t);
  }, [loadVendors]);

  useEffect(() => { loadCities(); }, [loadCities]);

  const handleEdit = (v) => {
    setEditingVendor(v);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setEditingVendor(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (v) => {
    if (!window.confirm(`Are you sure you want to delete vendor "${v.name}"?`)) return;
    try {
      await vendorApi.remove(v.id);
      loadVendors();
      loadCities();
    } catch (err) {
      alert(err.response?.data?.error?.message || err.message || 'Failed to delete vendor.');
    }
  };

  const stats = useMemo(() => {
    const active = vendors.filter((v) => v.status === 'active').length;
    const totalProc = vendors.reduce((sum, v) => sum + Number(v.procurementCount || 0), 0);
    const totalSpend = vendors.reduce((sum, v) => sum + Number(v.totalProcuredAmount || 0), 0);
    return { total: vendors.length, active, totalProc, totalSpend };
  }, [vendors]);

  const hasFilters = Boolean(search || city || status !== 'all');

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Vendors & Suppliers"
        description="Approved material and machinery vendors for warehouse and direct-to-site procurement."
        actions={
          <Button variant="primary" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Vendor
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label={hasFilters ? 'Matching Vendors' : 'Total Vendors'} value={stats.total} icon={Store} tone="brand" />
        <Kpi label="Active Suppliers" value={stats.active} icon={CheckCircle2} tone="emerald" />
        <Kpi label="Procurement POs" value={stats.totalProc} icon={ShoppingBag} tone="blue" />
        <Kpi label="Total Spend" value={formatCurrency(stats.totalSpend)} icon={CreditCard} tone="purple" />
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-line bg-white shadow-sm">
        <CardBody className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, contact person, city, phone, email, GST…"
                aria-label="Search vendors"
                className="w-full rounded-lg border border-line pl-9 pr-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div className="w-48">
              <SearchableSelect
                value={city}
                onChange={(e) => setCity(e.target.value)}
                aria-label="Filter by city"
                className="w-full rounded-lg border border-line bg-white px-2.5 py-2 text-xs text-ink focus:border-brand-500"
              >
                <option value="">All cities</option>
                {cities.map((c) => (
                  <option key={c.city} value={c.city}>{`${c.city} (${c.vendors})`}</option>
                ))}
              </SearchableSelect>
            </div>

            <div className="w-36">
              <SearchableSelect
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Filter by status"
                className="w-full rounded-lg border border-line bg-white px-2.5 py-2 text-xs text-ink focus:border-brand-500"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </SearchableSelect>
            </div>

            {hasFilters && (
              <Button type="button" size="sm" variant="ghost" onClick={() => { setSearch(''); setCity(''); setStatus('all'); }}>
                Clear
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {loadError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{loadError}</p>}

      {/* Vendors Table */}
      <Card className="border-line bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas-subtle border-b border-line text-ink-subtle font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Vendor / Supplier</th>
                <th className="py-3 px-3">Contact Person</th>
                <th className="py-3 px-3">City</th>
                <th className="py-3 px-3">Contact Info</th>
                <th className="py-3 px-3">Tax Details (GST / PAN)</th>
                <th className="py-3 px-3">Dispatch Address</th>
                <th className="py-3 px-3 text-right">Orders / Spend</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading && vendors.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-xs text-ink-muted">Loading vendors list...</td>
                </tr>
              ) : vendors.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-xs text-ink-subtle">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p>{hasFilters ? 'No vendors match these filters.' : 'No vendors registered yet.'}</p>
                      {!hasFilters && (
                        <Button size="sm" variant="outline" onClick={handleCreate}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add Vendor
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-canvas-subtle/50 transition-colors">
                    <td className="py-3 px-4">
                      <button type="button" onClick={() => setViewing(v)} className="text-left font-semibold text-ink text-sm hover:text-brand-700 hover:underline">
                        {v.name}
                      </button>
                      {v.notes && <p className="text-[11px] text-ink-subtle line-clamp-1 mt-0.5">{v.notes}</p>}
                    </td>

                    <td className="py-3 px-3 font-medium text-ink">
                      {v.contactPerson || <span className="text-ink-subtle">—</span>}
                    </td>

                    <td className="py-3 px-3">
                      {v.city ? (
                        <button type="button" onClick={() => setCity(v.city)} className="inline-flex items-center gap-1 text-ink hover:text-brand-700" title={`Show vendors in ${v.city}`}>
                          <MapPin className="h-3 w-3 text-ink-subtle" /> {v.city}
                        </button>
                      ) : <span className="text-ink-subtle">—</span>}
                    </td>

                    <td className="py-3 px-3 space-y-0.5">
                      {v.phone && (
                        <p className="flex items-center gap-1 font-mono text-ink">
                          <Phone className="h-3 w-3 text-ink-subtle" /> {v.phone}
                        </p>
                      )}
                      {v.email && (
                        <p className="flex items-center gap-1 text-[11px] text-ink-subtle">
                          <Mail className="h-3 w-3 text-ink-subtle" /> {v.email}
                        </p>
                      )}
                      {!v.phone && !v.email && <span className="text-ink-subtle">—</span>}
                    </td>

                    <td className="py-3 px-3 space-y-0.5 font-mono text-[11px]">
                      {v.gstNumber && <p><span className="text-ink-subtle">GST:</span> <strong className="text-ink">{v.gstNumber}</strong></p>}
                      {v.panNumber && <p><span className="text-ink-subtle">PAN:</span> <strong className="text-ink">{v.panNumber}</strong></p>}
                      {!v.gstNumber && !v.panNumber && <span className="text-ink-subtle">—</span>}
                    </td>

                    <td className="py-3 px-3 text-ink-muted text-[11px] max-w-[180px] truncate" title={v.address || v.billingAddress || ''}>
                      {v.address || v.billingAddress || <span className="text-ink-subtle">—</span>}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <p className="font-bold text-ink tabular-nums">{formatCurrency(v.totalProcuredAmount || 0)}</p>
                      <p className="text-[10px] text-ink-subtle">{v.procurementCount || 0} POs</p>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <Badge tone={v.status === 'active' ? 'positive' : 'neutral'}>{v.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewing(v)} className="h-8 w-8 p-0 text-ink-muted hover:text-ink" title="Vendor overview" aria-label={`View ${v.name}`}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(v)} className="h-8 w-8 p-0 text-ink-muted hover:text-ink" title="Edit Vendor" aria-label={`Edit ${v.name}`}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(v)} className="h-8 w-8 p-0 text-red-500 hover:text-red-700" title="Delete Vendor" aria-label={`Delete ${v.name}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <VendorOverviewModal vendor={viewing} onClose={() => setViewing(null)} onEdit={(v) => { setViewing(null); handleEdit(v); }} />

      <VendorFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={() => { loadVendors(); loadCities(); }}
        vendor={editingVendor}
      />
    </div>
  );
}

const KPI_TONES = {
  brand: 'bg-brand-50 border-brand-200 text-brand-700',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
};

function Kpi({ label, value, icon: Icon, tone }) {
  return (
    <Card className="border-line bg-canvas">
      <CardBody className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle">{label}</p>
          <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{value}</p>
        </div>
        <div className={`h-10 w-10 rounded-xl border flex items-center justify-center ${KPI_TONES[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardBody>
    </Card>
  );
}

/** Vendor overview: contact person, city, tax, bank and recent orders. */
function VendorOverviewModal({ vendor, onClose, onEdit }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    if (!vendor) return;
    vendorApi.getById(vendor.id).then(setDetail).catch((err) => setError(err.message || 'Could not load vendor.'));
  }, [vendor]);

  const v = detail || vendor;
  return (
    <Modal
      isOpen={Boolean(vendor)}
      onClose={onClose}
      title={v?.name || 'Vendor'}
      description={[v?.contactPerson, v?.city].filter(Boolean).join(' · ') || undefined}
      size="lg"
      footer={v && (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={() => onEdit(v)}><Edit2 className="h-4 w-4 mr-1.5" />Edit vendor</Button>
        </div>
      )}
    >
      {v && (
        <div className="space-y-5">
          <InfoList columns={2} items={[
            { label: 'Contact person', value: v.contactPerson ? <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5 text-ink-subtle" />{v.contactPerson}</span> : null },
            { label: 'City', value: v.city ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-ink-subtle" />{v.city}</span> : null },
            { label: 'Phone', value: v.phone },
            { label: 'Email', value: v.email },
            { label: 'GST', value: v.gstNumber },
            { label: 'PAN', value: v.panNumber },
            { label: 'Dispatch address', value: v.address },
            { label: 'Billing address', value: v.billingAddress },
            { label: 'Bank', value: v.bankAccountNumber ? `${v.bankName || 'Bank'} · A/C ${v.bankAccountNumber}${v.bankIfsc ? ` · ${v.bankIfsc}` : ''}` : null },
            { label: 'Status', value: v.status === 'active' ? 'Active' : 'Inactive' },
          ]} />

          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">Recent orders</h4>
            {error && <p className="text-xs text-red-600">{error}</p>}
            {!detail && !error && <p className="text-xs text-ink-subtle">Loading…</p>}
            {detail && (detail.procurements?.length ? (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-canvas text-[11px] uppercase text-ink-subtle">
                    <tr><th className="px-3 py-2">Request</th><th className="px-3 py-2">Material</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Date</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {detail.procurements.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-mono">{p.requestNumber}</td>
                        <td className="px-3 py-2">{p.materialName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.quantity} {p.materialUnit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.totalAmount)}</td>
                        <td className="px-3 py-2">{PROCUREMENT_STATUS_LABELS[p.status] ?? p.status}</td>
                        <td className="px-3 py-2">{p.purchaseDate ? formatDate(p.purchaseDate) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-xs text-ink-subtle">No orders with this vendor yet.</p>)}
          </div>
        </div>
      )}
    </Modal>
  );
}
