import { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  Plus,
  Search,
  Building,
  Phone,
  Mail,
  FileText,
  CreditCard,
  Edit2,
  Trash2,
  CheckCircle2,
  ShoppingBag,
  Store,
} from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import VendorFormModal from './VendorFormModal';
import { vendorApi } from '../../../api/vendorApi';
import { formatCurrency } from '../../../utils/format';

export default function VendorListPage() {
  const [vendors, setVendors] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);

  const loadVendors = () => {
    setIsLoading(true);
    vendorApi
      .list({ search, status: status !== 'all' ? status : undefined, pageSize: 100 })
      .then((res) => {
        setVendors(res.vendors || []);
        setTotal(res.total || 0);
      })
      .catch((err) => console.error('Failed to load vendors:', err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadVendors();
  }, [status]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadVendors();
  };

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
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to delete vendor.');
    }
  };

  // Metrics
  const stats = useMemo(() => {
    const active = vendors.filter((v) => v.status === 'active').length;
    const totalProc = vendors.reduce((sum, v) => sum + Number(v.procurement_count || 0), 0);
    const totalSpend = vendors.reduce((sum, v) => sum + Number(v.total_purchased || 0), 0);
    return { total: vendors.length, active, totalProc, totalSpend };
  }, [vendors]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Vendors & Suppliers"
        description="Manage approved raw material and machinery vendors supplying Central Warehouse procurement."
        actions={
          <Button variant="primary" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Vendor
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-line bg-canvas">
          <CardBody className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle">Total Vendors</p>
              <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{stats.total}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700">
              <Store className="h-5 w-5" />
            </div>
          </CardBody>
        </Card>

        <Card className="border-line bg-canvas">
          <CardBody className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle">Active Suppliers</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">{stats.active}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardBody>
        </Card>

        <Card className="border-line bg-canvas">
          <CardBody className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle">Procurement POs</p>
              <p className="mt-1 text-2xl font-bold text-blue-700 tabular-nums">{stats.totalProc}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </CardBody>
        </Card>

        <Card className="border-line bg-canvas">
          <CardBody className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle">Total Spend</p>
              <p className="mt-1 text-2xl font-bold text-purple-700 tabular-nums">
                {formatCurrency(stats.totalSpend)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
              <CreditCard className="h-5 w-5" />
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-line bg-white shadow-sm">
        <CardBody className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendor name, contact person, phone, email, GST or PAN..."
                className="w-full rounded-lg border border-line pl-9 pr-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div className="w-36">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-line bg-white px-2.5 py-2 text-xs text-ink focus:border-brand-500"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>

            <Button type="submit" size="sm" variant="primary">
              Filter
            </Button>

            {search && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearch('');
                  loadVendors();
                }}
              >
                Clear
              </Button>
            )}
          </form>
        </CardBody>
      </Card>

      {/* Vendors Table */}
      <Card className="border-line bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas-subtle border-b border-line text-ink-subtle font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Vendor / Supplier</th>
                <th className="py-3 px-3">Contact Person</th>
                <th className="py-3 px-3">Contact Info</th>
                <th className="py-3 px-3">Tax Details (GST / PAN)</th>
                <th className="py-3 px-3">Bank Details</th>
                <th className="py-3 px-3">Dispatch Address</th>
                <th className="py-3 px-3 text-right">Orders / Spend</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-xs text-ink-muted">
                    Loading vendors list...
                  </td>
                </tr>
              ) : vendors.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-xs text-ink-subtle">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p>No vendors registered yet.</p>
                      <Button size="sm" variant="outline" onClick={handleCreate}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Vendor
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-canvas-subtle/50 transition-colors">
                    {/* Name */}
                    <td className="py-3 px-4">
                      <p className="font-semibold text-ink text-sm">{v.name}</p>
                      {v.notes && <p className="text-[11px] text-ink-subtle line-clamp-1 mt-0.5">{v.notes}</p>}
                    </td>

                    {/* Contact Person */}
                    <td className="py-3 px-3 font-medium text-ink">
                      {v.contact_person || <span className="text-ink-subtle">—</span>}
                    </td>

                    {/* Contact Info */}
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

                    {/* Tax */}
                    <td className="py-3 px-3 space-y-0.5 font-mono text-[11px]">
                      {v.gst_number && (
                        <p>
                          <span className="text-ink-subtle">GST:</span>{' '}
                          <strong className="text-ink">{v.gst_number}</strong>
                        </p>
                      )}
                      {v.pan_number && (
                        <p>
                          <span className="text-ink-subtle">PAN:</span>{' '}
                          <strong className="text-ink">{v.pan_number}</strong>
                        </p>
                      )}
                      {!v.gst_number && !v.pan_number && <span className="text-ink-subtle">—</span>}
                    </td>

                    {/* Bank */}
                    <td className="py-3 px-3 text-[11px]">
                      {v.bank_account_number ? (
                        <div>
                          <p className="font-semibold text-ink">{v.bank_name || 'Bank'}</p>
                          <p className="font-mono text-ink-subtle">A/C: {v.bank_account_number}</p>
                          {v.bank_ifsc && <p className="font-mono text-ink-subtle">IFSC: {v.bank_ifsc}</p>}
                        </div>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </td>

                    {/* Address */}
                    <td className="py-3 px-3 text-ink-muted text-[11px] max-w-[180px] truncate">
                      {v.address || v.billing_address || <span className="text-ink-subtle">—</span>}
                    </td>

                    {/* Spend */}
                    <td className="py-3 px-3 text-right">
                      <p className="font-bold text-ink tabular-nums">
                        {formatCurrency(v.total_purchased || 0)}
                      </p>
                      <p className="text-[10px] text-ink-subtle">
                        {v.procurement_count || 0} POs
                      </p>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 text-center">
                      <Badge tone={v.status === 'active' ? 'success' : 'neutral'}>
                        {v.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(v)}
                          className="h-8 w-8 p-0 text-ink-muted hover:text-ink"
                          title="Edit Vendor"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(v)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          title="Delete Vendor"
                        >
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

      {/* Form Modal */}
      <VendorFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={loadVendors}
        vendor={editingVendor}
      />
    </div>
  );
}
