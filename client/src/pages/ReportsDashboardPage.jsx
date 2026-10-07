import { useMemo, useState } from 'react';
import { FileBarChart, RefreshCw } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import Tabs from '../components/ui/Tabs';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import KpiGrid from '../components/reports/KpiGrid';
import ReportDrilldownView from '../components/reports/ReportDrilldownView';
import ReportChartsSection from '../components/reports/ReportCharts';
import useAsync from '../hooks/useAsync';
import useReportLookups from '../hooks/useReportLookups';
import reportsApi from '../api/reportsApi';
import { KPI_DEFS, CONTRACTOR_SELF_REPORTS } from '../utils/reportOptions';
import { REPORT_DEFS } from '../config/reportDefs';

/**
 * Interface 13 — Reports & Analytics. Every number and every row here is
 * read straight from the module that already owns it (see reportService.js
 * on the server); this page's only job is to present it: clickable KPI
 * cards, a live analytics snapshot, a report picker, and one drill-down
 * table at a time with the date/project/site/contractor/status filters that
 * report supports. CSV export and print are available in every drill-down.
 */
export default function ReportsDashboardPage({ basePath = '/admin' }) {
  const lookups = useReportLookups();

  const load = () => reportsApi.dashboard();
  const { data, isLoading, error, reload } = useAsync(load, []);

  const [selected, setSelected] = useState(null); // { reportId, filters, label }

  const isContractor = data?.role === 'contractor';

  const availableReports = useMemo(() => {
    if (!data) return [];
    const ids = new Set();
    KPI_DEFS.forEach((def) => {
      if (def.pick(data.kpis) !== undefined && def.pick(data.kpis) !== null) ids.add(def.reportId);
    });
    if (isContractor) CONTRACTOR_SELF_REPORTS.forEach((r) => ids.add(r.reportId));
    return [...ids]
      .filter((id) => REPORT_DEFS[id])
      .map((id) => ({ id, label: REPORT_DEFS[id].title }));
  }, [data, isContractor]);

  const selectReport = (reportId, filters, label) =>
    setSelected({ reportId, filters: filters ?? {}, label });

  if (error) {
    return (
      <>
        <PageHeader
          title="Reports & Analytics"
          breadcrumbs={[{ label: 'Dashboard', to: basePath }, { label: 'Reports' }]}
        />
        <Alert tone="error" title="Could not load reports">{error.message}</Alert>
        <Button className="mt-4" onClick={reload}>Try again</Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description="Every KPI is live from its own module — click one to see the records behind it."
        breadcrumbs={[{ label: 'Dashboard', to: basePath }, { label: 'Reports' }]}
        actions={
          <Button variant="secondary" onClick={reload} aria-label="Refresh reports">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-52" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <>
          {/* ── KPI cards ─────────────────────────────────────────────── */}
          <KpiGrid
            kpis={data.kpis}
            activeReportId={selected?.reportId}
            activeFilters={selected?.filters}
            onSelect={selectReport}
          />

          {/* ── Analytics charts ──────────────────────────────────────── */}
          <ReportChartsSection kpis={data.kpis} />

          {/* ── Contractor quick links ────────────────────────────────── */}
          {isContractor && (
            <div className="mb-6 flex flex-wrap gap-2">
              {CONTRACTOR_SELF_REPORTS.map((r) => (
                <Button
                  key={r.reportId}
                  variant={selected?.reportId === r.reportId ? 'primary' : 'secondary'}
                  onClick={() => selectReport(r.reportId, {}, r.label)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          )}

          {/* ── Drill-down area ───────────────────────────────────────── */}
          <Card>
            {availableReports.length > 1 && (
              <Tabs
                tabs={availableReports}
                active={selected?.reportId}
                onChange={(id) => selectReport(id, {}, REPORT_DEFS[id].title)}
                className="px-5 pt-1"
              />
            )}

            {selected ? (
              <div className="border-0 p-0">
                <ReportDrilldownViewWrapper
                  reportId={selected.reportId}
                  filters={selected.filters}
                  label={selected.label}
                  lookups={lookups}
                  hideContractor={isContractor}
                  onClose={() => setSelected(null)}
                />
              </div>
            ) : (
              <EmptyState
                icon={FileBarChart}
                title="Pick a KPI or a report to see its records"
                description="Every card above and every tab here opens a live, filterable table — with CSV export and print — backed by the same permissions you already have."
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}

/**
 * The Card wrapping this page already draws the outer border; the
 * drill-down itself also renders one (it's reused unwrapped elsewhere),
 * so this strips the duplicate chrome when nested here.
 */
function ReportDrilldownViewWrapper({
  reportId,
  filters,
  label,
  lookups,
  hideContractor,
  onClose,
}) {
  return (
    <div className="[&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none">
      <ReportDrilldownView
        reportId={reportId}
        initialFilters={filters}
        title={label}
        lookups={lookups}
        hideContractor={hideContractor}
        onClose={onClose}
      />
    </div>
  );
}
