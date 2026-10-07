import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Download, Printer, Loader } from 'lucide-react';
import DataTable from '../ui/DataTable';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Pagination from '../projects/Pagination';
import ReportFilters from './ReportFilters';
import useAsync from '../../hooks/useAsync';
import { REPORT_DEFS } from '../../config/reportDefs';
import { exportReportCsv } from '../../utils/csvExport';
import { formatDate } from '../../utils/format';

/**
 * One drill-down table: filters → DataTable → pagination, for whichever
 * report id a KPI card (or the report picker) opened. `initialFilters` are
 * the filters the KPI already implies (e.g. status: 'active' for the
 * "Active projects" card) — the person can broaden or narrow them from there.
 *
 * Interface 13 additions:
 *  • CSV Export  — exports the currently-filtered data (pageSize 50 to the
 *                  server's cap) through the same auth-scoped endpoint.
 *  • Print       — opens a minimal print view of the visible table.
 */
export default function ReportDrilldownView({
  reportId,
  initialFilters,
  title,
  lookups,
  hideContractor,
  onClose,
}) {
  const def = REPORT_DEFS[reportId];
  const [filters, setFilters] = useState({ ...initialFilters, page: 1 });
  const [isExporting, setIsExporting] = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    setFilters({ ...initialFilters, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, JSON.stringify(initialFilters)]);

  const load = useCallback(() => {
    const params = { pageSize: 10 };
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '' || value === 'all') return;
      params[key] = value;
    });
    return def.load(params);
  }, [def, filters]);

  const { data, isLoading, error, reload } = useAsync(load, [load]);
  const rows = data?.[def.rowsKey] ?? [];

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  const clear = () => setFilters({ page: 1 });

  const columns = def.columns();

  // ── CSV export ──────────────────────────────────────────────────────────────
  const handleExport = () => {
    exportReportCsv(def, filters, title || def.title, setIsExporting);
  };

  // ── Print ───────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    if (!rows.length) {
      alert('Nothing to print — load some records first.');
      return;
    }

    const reportTitle = title || def.title;
    const dateStr = formatDate(new Date().toISOString());

    // Build an active-filter description for the print header
    const activeFilters = Object.entries(filters)
      .filter(([k, v]) => k !== 'page' && k !== 'pageSize' && v && v !== 'all')
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');

    // Build table HTML from the current visible rows
    const headerRow = columns
      .map((c) => `<th style="text-align:${c.align === 'right' ? 'right' : 'left'}">${c.header}</th>`)
      .join('');

    const bodyRows = rows
      .map((row) => {
        const cells = columns.map((col) => {
          // Convert rendered React element → plain text (same as csvExport)
          const rendered = col.render(row);
          const text = plainText(rendered);
          return `<td style="text-align:${col.align === 'right' ? 'right' : 'left'}">${escHtml(text)}</td>`;
        });
        return `<tr>${cells.join('')}</tr>`;
      })
      .join('');

    const printWin = window.open('', '_blank', 'width=900,height=600');
    if (!printWin) {
      alert('Please allow pop-ups for this page to use the print feature.');
      return;
    }

    printWin.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escHtml(reportTitle)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, Arial, sans-serif; font-size: 11px; color: #1C1731; padding: 24px 32px; }
    .report-header { margin-bottom: 16px; border-bottom: 2px solid #6B3FD4; padding-bottom: 12px; }
    .report-header h1 { font-size: 18px; font-weight: 700; color: #1C1731; }
    .report-meta { font-size: 10px; color: #8B87A0; margin-top: 4px; }
    .report-filters { font-size: 10px; color: #615C77; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    thead tr { border-bottom: 1.5px solid #1C1731; }
    th { padding: 6px 8px; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #615C77; }
    tbody tr { border-bottom: 1px solid #E6E2F2; }
    tbody tr:last-child { border-bottom: none; }
    td { padding: 6px 8px; vertical-align: top; }
    .report-footer { margin-top: 20px; font-size: 9px; color: #8B87A0; border-top: 1px solid #E6E2F2; padding-top: 8px; }
    @media print {
      body { padding: 0; }
      @page { margin: 18mm 14mm; size: A4 landscape; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${escHtml(reportTitle)}</h1>
    <p class="report-meta">Generated on ${escHtml(dateStr)}</p>
    ${activeFilters ? `<p class="report-filters">Filters: ${escHtml(activeFilters)}</p>` : ''}
  </div>
  <table>
    <thead><tr>${headerRow}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="report-footer">
    Showing ${rows.length} record${rows.length !== 1 ? 's' : ''}${data?.pagination ? ` of ${data.pagination.total} total` : ''} · ABCD India
  </div>
  <script>window.onload = function(){ window.print(); window.onafterprint = function(){ window.close(); }; };<\/script>
</body>
</html>`);
    printWin.document.close();
  };

  return (
    <div className="rounded-2xl border border-line bg-white shadow-card">
      {/* ── header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <def.icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="font-display text-[1.05rem] font-semibold text-ink">{title || def.title}</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* CSV Export */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || isLoading}
            title="Export to CSV"
            aria-label="Export to CSV"
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-ink-muted transition-colors hover:border-brand-200 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting
              ? <Loader className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              : <Download className="h-3.5 w-3.5" aria-hidden="true" />
            }
            <span className="hidden sm:inline">{isExporting ? 'Exporting…' : 'Export CSV'}</span>
          </button>

          {/* Print */}
          <button
            type="button"
            onClick={handlePrint}
            disabled={isLoading || rows.length === 0}
            title="Print report"
            aria-label="Print report"
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-ink-muted transition-colors hover:border-brand-200 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Print</span>
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close this report"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-canvas hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── filters ────────────────────────────────────────────────────────── */}
      <ReportFilters
        fields={def.filters}
        values={filters}
        onChange={set}
        onClear={clear}
        lookups={lookups}
        hideContractor={hideContractor}
      />

      {/* ── table / error / empty ───────────────────────────────────────────── */}
      <div ref={printRef}>
        {error ? (
          <div className="p-5">
            <Alert tone="error" title="Could not load this report">{error.message}</Alert>
            <Button className="mt-4" variant="secondary" onClick={reload}>Try again</Button>
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              isLoading={isLoading}
              empty={{
                title: def.empty.title,
                description: def.empty.description,
                action: <Button variant="secondary" onClick={clear}>Clear filters</Button>,
              }}
            />
            <Pagination
              pagination={data?.pagination}
              onChange={(page) => setFilters((f) => ({ ...f, page }))}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── plain-text extraction from React elements (used for print) ────────────────

function plainText(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join(' ').trim();
  if (node && typeof node === 'object' && node.props) return plainText(node.props.children);
  return '';
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
