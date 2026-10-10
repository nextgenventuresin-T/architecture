import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Building2,
  MapPin,
  HardHat,
  Camera,
  Users,
  CheckCircle2,
  Filter,
  RefreshCw,
  Search,
  Eye,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { pmApi } from '../../api/pmApi';
import { projectsApi } from '../../api/projectsApi';
import { dailyWorkApi } from '../../api/dailyWorkApi';
import DailyWorkDetailModal from '../../components/dailyWork/DailyWorkDetailModal';
import PmWorkUpdateModal from '../../components/dailyWork/PmWorkUpdateModal';
import { formatNumber, formatDate } from '../../utils/format';

export default function PmDailyWorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialProjectId = searchParams.get('projectId') || '';
  const initialSiteId = searchParams.get('siteId') || '';
  const initialContractorId = searchParams.get('contractorId') || '';

  const [updates, setUpdates] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [selectedSiteId, setSelectedSiteId] = useState(initialSiteId);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected work update for detail modal
  const [activeUpdateId, setActiveUpdateId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    projectsApi.list({ pageSize: 100 }).then((res) => setProjects(res.projects || [])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = {};
    if (selectedProjectId) params.projectId = selectedProjectId;
    if (selectedSiteId) params.siteId = selectedSiteId;
    if (initialContractorId) params.contractorId = initialContractorId;
    if (selectedDate) params.date = selectedDate;

    pmApi
      .workUpdates(params)
      .then((res) => setUpdates(res.updates || []))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [selectedProjectId, selectedSiteId, initialContractorId, selectedDate]);

  useEffect(load, [load]);

  return (
    <>
      <PageHeader
        title="Site Daily Work Updates"
        description="Inspect site work logs, photo verifications, progress reports and labour headcounts, and record daily work and progress on your assigned sites."
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => setIsRecording(true)}>Record daily work</Button>
            <Button variant="secondary" onClick={load} isLoading={loading}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Refresh
            </Button>
          </div>
        }
      />

      {flash && <Alert tone="success" className="mb-4">{flash}</Alert>}
      <PmWorkUpdateModal
        isOpen={isRecording}
        onClose={() => setIsRecording(false)}
        onSaved={(message) => { setIsRecording(false); setFlash(message); load(); }}
      />

      {error && <Alert tone="error" className="mb-4">{error.message || 'Failed to load work updates'}</Alert>}

      {/* Filter Bar */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3 bg-surface p-4 rounded-2xl border border-line">
        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1">Project</label>
          <select
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              setSelectedSiteId('');
            }}
            className="w-full px-3 py-2 text-sm rounded-xl border border-line bg-canvas text-ink focus:outline-none focus:border-brand-500"
          >
            <option value="">All Handled Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl border border-line bg-canvas text-ink focus:outline-none focus:border-brand-500"
          />
        </div>

        <div className="sm:col-span-2 flex items-end gap-2">
          {selectedDate && (
            <Button size="sm" variant="ghost" onClick={() => setSelectedDate('')}>
              Clear Date
            </Button>
          )}
          {(selectedProjectId || selectedSiteId || initialContractorId) && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSelectedProjectId('');
                setSelectedSiteId('');
                setSearchParams({});
              }}
            >
              Reset Filters
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : updates.length === 0 ? (
        <Card>
          <CardBody className="p-12">
            <EmptyState
              icon={Calendar}
              title="No work updates found"
              description="No updates match your selected filters. Contractors submit updates from their daily work panel."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {updates.map((up) => (
            <Card key={up.id} className="p-4 hover:border-brand-500/30 transition">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-ink">{up.site_name || 'General Site'}</span>
                    <span className="text-xs text-brand-700 font-medium">({up.project_name})</span>
                    <Badge tone={up.work_status === 'completed' ? 'success' : 'neutral'}>
                      {up.work_status}
                    </Badge>
                    <span className="text-xs text-ink-subtle">
                      📅 {formatDate(up.work_date)}
                    </span>
                  </div>

                  <p className="text-sm text-ink line-clamp-3">
                    {up.work_done || 'No description provided.'}
                  </p>

                  <div className="pt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-muted">
                    <span>Contractor: <strong className="text-ink">{up.contractor_name || 'Unassigned'}</strong></span>
                    {up.task_name && <span>Task: <strong className="text-ink">{up.task_name}</strong></span>}
                    <span>Labour on site: <strong className="text-indigo-700">{up.worker_count || 0} workers</strong></span>
                    <span>Progress: <strong className="text-brand-700">{up.progress_percentage || 0}%</strong></span>
                    {up.photo_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-sky-700 font-semibold">
                        <Camera className="h-3.5 w-3.5" /> {up.photo_count} photos attached
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 self-end sm:self-start">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setActiveUpdateId(up.id)}
                    className="flex items-center gap-1.5"
                  >
                    <Eye className="h-3.5 w-3.5" /> View Full Submission
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Full detail modal for photos, tasks, workers */}
      {activeUpdateId && (
        <DailyWorkDetailModal
          updateId={activeUpdateId}
          onClose={() => setActiveUpdateId(null)}
        />
      )}
    </>
  );
}
