import * as XLSX from 'xlsx';

/**
 * Browser-side spreadsheet reading for the bulk import dialog. Reads the first
 * sheet of an .xlsx/.xls/.csv file, matches its header row to the import's
 * fields (by label, key or alias, ignoring case, spaces and punctuation) and
 * returns plain rows keyed by field key, each tagged with its sheet row number.
 */

const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function headerIndex(fields) {
  const map = new Map();
  for (const f of fields) {
    for (const name of [f.label, f.key, ...(f.aliases || [])]) {
      const k = squash(name);
      if (k && !map.has(k)) map.set(k, f.key);
    }
  }
  return map;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Excel stores dates as serial numbers; turn one into YYYY-MM-DD. */
function serialToDate(n) {
  const d = XLSX.SSF.parse_date_code(n);
  return d ? `${d.y}-${pad2(d.m)}-${pad2(d.d)}` : String(n);
}

function cellValue(value, field) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  if (typeof value === 'number') {
    if (field.type === 'date') return serialToDate(value);
    return String(value);
  }
  return String(value).trim();
}

export async function readSpreadsheet(file, fields) {
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  const buffer = await file.arrayBuffer();
  // For CSV keep every cell as typed text: otherwise 05/06/2024 could be read
  // month-first. The server understands day-first dates.
  const workbook = XLSX.read(buffer, isCsv ? { type: 'array', raw: true } : { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The file has no sheets.');
  const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '', blankrows: true });

  const headerRowIdx = grid.findIndex((r) => r.some((c) => String(c).trim() !== ''));
  if (headerRowIdx === -1) throw new Error('The file is empty.');

  const index = headerIndex(fields);
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
  const columns = []; // { col, header, key|null }
  const used = new Set();
  grid[headerRowIdx].forEach((header, col) => {
    if (String(header).trim() === '') return;
    let key = index.get(squash(header)) || null;
    if (key && used.has(key)) key = null; // first matching column wins
    if (key) used.add(key);
    columns.push({ col, header: String(header).trim(), key });
  });

  const missingRequired = fields.filter((f) => f.required && !used.has(f.key)).map((f) => f.label);
  const ignoredHeaders = columns.filter((c) => !c.key).map((c) => c.header);
  const mapped = columns.filter((c) => c.key);

  const rows = [];
  for (let i = headerRowIdx + 1; i < grid.length; i += 1) {
    const line = grid[i];
    const row = { _row: i + 1 };
    let hasValue = false;
    for (const c of mapped) {
      const v = cellValue(line[c.col], byKey[c.key]);
      if (v !== '') hasValue = true;
      row[c.key] = v;
    }
    if (hasValue) rows.push(row);
  }

  return {
    sheetName,
    sheetCount: workbook.SheetNames.length,
    rows,
    mappedFields: mapped.map((c) => byKey[c.key]),
    ignoredHeaders,
    missingRequired,
  };
}

/** Downloads an .xlsx template: a data sheet with headers and one example row, plus instructions. */
export function downloadTemplate(spec) {
  const headers = spec.fields.map((f) => f.label);
  const example = spec.fields.map((f) => f.example ?? '');
  const data = XLSX.utils.aoa_to_sheet([headers, example]);
  data['!cols'] = spec.fields.map((f) => ({ wch: Math.max(14, f.label.length + 4) }));

  const help = XLSX.utils.aoa_to_sheet([
    ['Column', 'Required', 'What to enter'],
    ...spec.fields.map((f) => [
      f.label,
      f.required ? 'Yes' : 'No',
      [
        f.values ? `One of: ${f.values.join(', ')}` : null,
        f.type === 'date' ? 'Date, e.g. 2024-05-15 or 15/05/2024' : null,
        f.type === 'number' || f.type === 'int' ? 'Number' : null,
        f.hint,
      ].filter(Boolean).join('. '),
    ]),
    [],
    ['Notes'],
    ['Replace the example row with your data. Keep the header row as it is; extra columns are ignored.'],
    [`Rows whose ${spec.matchBy === 'name' ? 'name' : 'serial number'} already exists are skipped${spec.updatable ? ' or updated, as you choose when importing' : ''}.`],
    ['Long numbers (bank accounts, phone numbers) are safest with the cell format set to Text.'],
    [`Up to ${spec.maxRows} rows per file.`],
  ]);
  help['!cols'] = [{ wch: 26 }, { wch: 10 }, { wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, data, spec.label.slice(0, 31));
  XLSX.utils.book_append_sheet(wb, help, 'Instructions');
  XLSX.writeFile(wb, `${spec.entity}-import-template.xlsx`);
}

/** Downloads the rows that did not import cleanly, with the reason, as .xlsx. */
export function downloadResults(spec, results) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Row', spec.matchBy === 'name' ? 'Name' : 'Serial Number', 'Result', 'Reason'],
    ...results.map((r) => [r.row, r.label, r.status, r.message || '']),
  ]);
  sheet['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 10 }, { wch: 90 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Import results');
  XLSX.writeFile(wb, `${spec.entity}-import-results.xlsx`);
}
