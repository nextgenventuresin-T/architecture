import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HardHat,
  Users,
  Building2,
  MapPin,
  ShoppingCart,
  Calendar,
  Phone,
  Mail,
  Search,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { pmApi } from '../../api/pmApi';
import { formatNumber, formatDate, formatCurrency } from '../../utils/format';

export default function PmContractorsPage() {
  const navigate = useNavigate();
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    pmApi
      .contractors()
      .then((res) => setContractors(res.contractors || []))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filtered = contractors.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.contactPerson?.toLowerCase().includes(q) ||
      c.speciality?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    );
  });

  return (
    <>
      <PageHeader
        title="Contractors Managed"
        description="Detailed view of contractors deployed across your project sites, team sizes, and material procurement volume."
        actions={
          <Button variant="secondary" onClick={load} isLoading={loading}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        }
      />

      {error && <Alert tone="error" className="mb-4">{error.message || 'Failed to load contractors'}</Alert>}

      {/* Search */}
      <div className="mb-6 flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Search contractor, contact, trade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-line bg-surface text-ink focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody className="p-12">
            <EmptyState
              icon={HardHat}
              title="No contractors found"
              description="No active contractors are currently assigned to your project sites."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {filtered.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                      <HardHat className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-ink">{c.name}</h3>
                      <p className="text-xs text-ink-muted">
                        Speciality: <span className="font-medium text-ink">{c.speciality || 'General Construction'}</span>
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-ink-muted flex flex-wrap gap-x-5 gap-y-1">
                    {c.contactPerson && (
                      <span>Contact: <strong className="text-ink">{c.contactPerson}</strong></span>
                    )}
                    {c.phone && (
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="h-3 w-3" /> {c.phone}
                      </span>
                    )}
                    {c.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {c.email}
                      </span>
                    )}
                  </div>
                </div>

                {/* Metrics Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center shrink-0">
                  <div className="p-2.5 rounded-xl bg-canvas border border-line">
                    <p className="text-[11px] text-ink-muted">Sites Handling</p>
                    <p className="text-sm font-bold text-ink">{c.sites?.length || 0}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-canvas border border-line">
                    <p className="text-[11px] text-ink-muted">Registered Workers</p>
                    <p className="text-sm font-bold text-indigo-700">{c.workerCount || 0}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-canvas border border-line">
                    <p className="text-[11px] text-ink-muted">Total Procured</p>
                    <p className="text-sm font-bold text-emerald-700">{formatCurrency(c.totalProcured || 0)}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-canvas border border-line">
                    <p className="text-[11px] text-ink-muted">Last Update</p>
                    <p className="text-xs font-semibold text-ink">
                      {c.lastUpdate ? formatDate(c.lastUpdate) : 'No updates'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Assigned sites list */}
              <div className="border-t border-line p-4 bg-canvas/30">
                <p className="text-xs font-semibold uppercase text-ink-muted mb-2">
                  Assigned Project Locations ({c.sites?.length || 0}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {c.sites?.map((s) => (
                    <span
                      key={s.siteId}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-surface border border-line text-ink"
                    >
                      <MapPin className="h-3 w-3 text-sky-600" />
                      <strong>{s.siteName}</strong>
                      <span className="text-ink-subtle">({s.projectName})</span>
                    </span>
                  ))}
                </div>

                <div className="mt-3 pt-3 border-t border-line/60 flex items-center justify-end gap-3 text-xs">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate(`/pm/daily-work?contractorId=${c.id}`)}
                  >
                    View Daily Work Updates
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate(`/pm/procurement?contractorId=${c.id}`)}
                  >
                    View Procurement Requests
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
