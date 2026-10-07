/**
 * Interface 13 — CSV export helpers.
 * Works entirely in the browser from the data already loaded in the table
 * (the currently filtered page set). This never adds a new API call — export
 * uses the same filtered params but raises pageSize to the server's cap (50)
 * to give the user a meaningful file while staying well within memory limits.
 *
 * Security: the export goes through the exact same authenticated API call the
 * table already uses, so server-side role/permission scoping is automatically
 * respected. A CONTRACTOR can only export what the server returns for them.
 */

/**
 * Convert a React element or primitive rendered by a DataTable column to a
 * plain string safe for CSV. We strip JSX entirely and keep only text nodes.
 * The render function can return a string, number, or React element; this
 * covers the common cases in reportDefs.jsx.
 */
function cellToText(rendered) {
  if (rendered === null || rendered === undefined) return '';
  if (typeof rendered === 'string' || typeof rendered === 'number') return String(rendered);

  // React element — walk props.children recursively
  if (rendered && typeof rendered === 'object' && rendered.props) {
    return childrenToText(rendered.props.children);
  }
  return '';
}

function childrenToText(children) {
  if (children === null || children === undefined) return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join(' ').trim();
  if (typeof children === 'object' && children.props) return childrenToText(children.props.children);
  return '';
}

/** Escape a CSV cell: wrap in quotes if it contains a comma, quote, or newline. */
function escapeCell(value) {
  const str = (value ?? '').toString().replace(/\r?\n/g, ' ');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build a CSV string from a list of column definitions and row data. */
export function buildCsv(columns, rows) {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const lines = rows.map((row) =>
    columns.map((col) => escapeCell(cellToText(col.render(row)))).join(',')
  );
  return [header, ...lines].join('\r\n');
}

/**
 * Trigger a browser download of a CSV file.
 * @param {string} csv   — the CSV text
 * @param {string} name  — filename without extension
 */
export function downloadCsv(csv, name) {
  const bom = '\uFEFF'; // UTF-8 BOM so Excel opens it correctly
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${datestamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function datestamp() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * High-level helper: fetches ALL pages of the current filtered report (up to
 * the server's pageSize cap of 50) and downloads as CSV.
 *
 * @param {object} def      — REPORT_DEFS[reportId]
 * @param {object} filters  — current filter state (without page/pageSize)
 * @param {string} title    — human label for the filename
 * @param {Function} setExporting — boolean setter for loading state
 */
export async function exportReportCsv(def, filters, title, setExporting) {
  setExporting(true);
  try {
    // Strip page/pageSize from filters, raise pageSize to server cap
    // eslint-disable-next-line no-unused-vars
    const { page, pageSize, ...rest } = filters;
    const params = { ...rest, pageSize: 50 };

    // Remove 'all' values — the server ignores them but let's be clean
    Object.keys(params).forEach((k) => {
      if (params[k] === 'all' || params[k] === '' || params[k] == null) delete params[k];
    });

    const data = await def.load(params);
    const rows = data?.[def.rowsKey] ?? [];

    if (rows.length === 0) {
      alert('No records to export with the current filters.');
      return;
    }

    const columns = def.columns();
    const csv = buildCsv(columns, rows);
    downloadCsv(csv, title || def.title);
  } catch (err) {
    console.error('CSV export failed:', err);
    alert(`Export failed: ${err.message}`);
  } finally {
    setExporting(false);
  }
}
