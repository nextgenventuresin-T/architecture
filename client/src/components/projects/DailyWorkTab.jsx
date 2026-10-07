import { useState, useMemo } from 'react';
import { Camera, Calendar, MapPin, User, CheckCircle2, Clock, X, ExternalLink, Package } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { formatDate, formatNumber } from '../../utils/format';

export default function DailyWorkTab({ detail }) {
  const { dailyWorkUpdates = [], sites = [], tasks = [] } = detail;
  const [siteFilter, setSiteFilter] = useState('all');
  const [taskFilter, setTaskFilter] = useState('all');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [activePhoto, setActivePhoto] = useState(null);

  const filteredUpdates = useMemo(() => {
    return dailyWorkUpdates.filter((up) => {
      if (siteFilter !== 'all' && Number(up.siteId || up.site_id) !== Number(siteFilter)) return false;
      if (taskFilter !== 'all' && Number(up.taskId || up.task_id) !== Number(taskFilter)) return false;
      if (phaseFilter !== 'all' && Number(up.phaseNumber || up.phase_number) !== Number(phaseFilter)) return false;
      if (dateFilter) {
        const itemDate = (up.workDate || up.work_date || '').slice(0, 10);
        if (itemDate !== dateFilter) return false;
      }
      return true;
    });
  }, [dailyWorkUpdates, siteFilter, taskFilter, phaseFilter, dateFilter]);

  if (dailyWorkUpdates.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Camera}
          title="No daily work updates recorded"
          description="Updates submitted by assigned contractors with site photos and progress percentages will appear here."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <Card>
        <CardBody className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-ink-subtle">
              <span>Filter by:</span>
            </div>
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
            >
              <option value="all">All Sites ({sites.length})</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {tasks.length > 0 && (
              <select
                value={taskFilter}
                onChange={(e) => setTaskFilter(e.target.value)}
                className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
              >
                <option value="all">All Tasks ({tasks.length})</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value)}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
            >
              <option value="all">All Phases (1-8)</option>
              {Array.from({ length: 8 }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>
                  Phase {p}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-hidden"
            />

            {(siteFilter !== 'all' || taskFilter !== 'all' || phaseFilter !== 'all' || dateFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSiteFilter('all');
                  setTaskFilter('all');
                  setPhaseFilter('all');
                  setDateFilter('');
                }}
                className="text-xs text-brand-700 hover:text-brand-900 font-medium ml-auto"
              >
                Reset filters
              </button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Updates Stream */}
      <div className="space-y-3">
        {filteredUpdates.length === 0 ? (
          <Card>
            <div className="p-8 text-center text-sm text-ink-subtle">
              No daily work updates match the selected filters.
            </div>
          </Card>
        ) : (
          filteredUpdates.map((up) => {
            const photos = up.photos || [];
            const isCompleted = (up.workStatus || up.work_status) === 'completed';

            return (
              <Card key={up.id} className="overflow-hidden">
                <div className="border-b border-line bg-canvas/40 px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                        <Calendar className="h-3.5 w-3.5 text-ink-muted" />
                        {formatDate(up.workDate || up.work_date)}
                      </span>
                      <span className="text-line">·</span>
                      <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <MapPin className="h-3.5 w-3.5 text-brand-600" />
                        {up.siteName || up.site_name || 'Site'}
                      </span>
                      <span className="text-line">·</span>
                      <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <User className="h-3.5 w-3.5 text-emerald-600" />
                        {up.contractorName || up.contractor_name || 'Contractor'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge tone={isCompleted ? 'success' : 'warning'}>
                        {isCompleted ? 'Completed' : 'In Progress'}
                      </Badge>
                      {(up.progressPercentage != null || up.progress_percentage != null) && (
                        <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800">
                          {up.progressPercentage ?? up.progress_percentage}% Done
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <CardBody className="space-y-3">
                  {/* Task or Phase Scope */}
                  <div className="flex flex-wrap items-center gap-2">
                    {(up.taskName || up.task_name) ? (
                      <span className="inline-flex items-center rounded-md bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                        Task: {up.taskName || up.task_name}
                      </span>
                    ) : (
                      <>
                        <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
                          Phase {up.phaseNumber || up.phase_number}: {up.phaseTitle || up.phase_title || ''}
                        </span>
                        {up.subcategory && (
                          <>
                            <span className="text-line">›</span>
                            <span className="inline-flex items-center rounded-md bg-line/60 px-2 py-1 text-xs font-medium text-ink">
                              {up.subcategory}
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {/* Work Done Details */}
                  <div className="text-sm text-ink whitespace-pre-wrap rounded-lg bg-canvas/30 p-3 border border-line">
                    <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider mb-1">Work Done Today</p>
                    {up.workDone || up.work_done}
                  </div>

                  {/* Material Consumed Badge if logged with this update */}
                  {(up.quantityUsed || up.quantity_used) && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs">
                      <Package className="h-4 w-4 text-amber-700 shrink-0" />
                      <span className="font-semibold text-amber-900">
                        Material Consumed: {formatNumber(up.quantityUsed || up.quantity_used)} {up.unit} of {up.materialName || up.material_name}
                      </span>
                      {(up.materialCode || up.material_code) && (
                        <span className="text-amber-700">({up.materialCode || up.material_code})</span>
                      )}
                      {(up.transactionNumber || up.transaction_number) && (
                        <span className="ml-auto font-mono text-[11px] text-amber-800">
                          Ledger Ref: {up.transactionNumber || up.transaction_number}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Remarks if present */}
                  {(up.remarks) && (
                    <div className="text-xs text-ink-muted">
                      <span className="font-medium text-ink">Remarks: </span>
                      {up.remarks}
                    </div>
                  )}

                  {/* Photos Grid */}
                  {photos.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Camera className="h-3.5 w-3.5 text-brand-600" />
                        Attached Site Photos ({photos.length})
                      </p>
                      <div className="flex flex-wrap gap-2.5">
                        {photos.map((photo) => {
                          const photoUrl = photo.url || `/api/daily-work/photos/${photo.id}`;
                          return (
                            <button
                              key={photo.id}
                              type="button"
                              onClick={() => setActivePhoto(photo)}
                              className="group relative h-20 w-20 overflow-hidden rounded-lg border border-line bg-canvas transition-transform hover:scale-105"
                            >
                              <img
                                src={photoUrl}
                                alt={photo.fileName || photo.file_name || 'Work photo'}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                <ExternalLink className="h-4 w-4" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })
        )}
      </div>

      {/* Lightbox / Image Modal */}
      {activePhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setActivePhoto(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-xl bg-ink p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActivePhoto(null)}
              className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={activePhoto.url || `/api/daily-work/photos/${activePhoto.id}`}
              alt={activePhoto.fileName || 'Work photo full view'}
              className="max-h-[82vh] max-w-full rounded-lg object-contain"
            />
            <p className="mt-2 text-center text-xs text-white/70">
              {activePhoto.fileName || activePhoto.file_name} · Uploaded {formatDate(activePhoto.createdAt || activePhoto.created_at)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
