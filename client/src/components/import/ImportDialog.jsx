import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import { importApi } from '../../api/importApi';

const CHUNK = 100;
const PREVIEW_ROWS = 8;

// The spreadsheet library is large; load it only when someone imports.
const loadSheetTools = () => import('../../utils/spreadsheetImport');

const STATUS_TONE = { created: 'positive', updated: 'brand', skipped: 'neutral', error: 'danger' };
const STATUS_LABEL = { created: 'Added', updated: 'Updated', skipped: 'Skipped', error: 'Error' };

const errorText = (err, fallback) => err?.response?.data?.error?.message || err?.message || fallback;

/**
 * Bulk import from Excel/CSV: pick a file, preview what was read, check it
 * against the server's rules (dry run), then import in batches.
 * `entity` is vendors | materials | tools | machines.
 */
export default function ImportDialog({ isOpen, onClose, entity, onImported }) {
  const [spec, setSpec] = useState(null);
  const [specError, setSpecError] = useState('');
  const [file, setFile] = useState(null);
  const [sheet, setSheet] = useState(null); // result of readSpreadsheet
  const [readError, setReadError] = useState('');
  const [onDuplicate, setOnDuplicate] = useState('skip');
  const [busy, setBusy] = useState(''); // '' | reading | checking | importing
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState(null); // { dryRun, summary, results }
  const [runError, setRunError] = useState('');
  const inputRef = useRef(null);

  const reset = useCallback(() => {
    setFile(null);
    setSheet(null);
    setReadError('');
    setOutcome(null);
    setRunError('');
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    reset();
    setOnDuplicate('skip');
    setSpecError('');
    setSpec(null);
    importApi.fields(entity).then(setSpec).catch((err) => setSpecError(errorText(err, 'Could not load the import settings.')));
  }, [isOpen, entity, reset]);

  const handleClose = () => {
    if (busy === 'importing') return; // never abandon a half-sent import
    onClose();
  };

  async function handleFile(event) {
    const picked = event.target.files?.[0];
    if (!picked || !spec) return;
    reset();
    setFile(picked);
    if (!/\.(xlsx|xls|csv)$/i.test(picked.name)) {
      setReadError('Choose an Excel (.xlsx, .xls) or CSV (.csv) file.');
      return;
    }
    setBusy('reading');
    try {
      const { readSpreadsheet } = await loadSheetTools();
      const result = await readSpreadsheet(picked, spec.fields);
      if (!result.rows.length) setReadError('No data rows were found under the header row.');
      else if (result.rows.length > spec.maxRows) setReadError(`This file has ${result.rows.length} rows. Import at most ${spec.maxRows} at a time.`);
      setSheet(result);
    } catch (err) {
      setReadError(err?.message || 'Could not read this file.');
    } finally {
      setBusy('');
    }
  }

  async function handleTemplate() {
    const { downloadTemplate } = await loadSheetTools();
    downloadTemplate(spec);
  }

  async function handleDownloadResults() {
    const { downloadResults } = await loadSheetTools();
    downloadResults(spec, outcome.results.filter((r) => r.status !== 'created'));
  }

  async function check() {
    setBusy('checking');
    setRunError('');
    try {
      const res = await importApi.run(entity, { rows: sheet.rows, onDuplicate, dryRun: true });
      setOutcome(res);
    } catch (err) {
      setRunError(errorText(err, 'Could not check the file.'));
    } finally {
      setBusy('');
    }
  }

  async function runImport() {
    setBusy('importing');
    setRunError('');
    setProgress(0);
    const results = [];
    try {
      for (let i = 0; i < sheet.rows.length; i += CHUNK) {
        const res = await importApi.run(entity, { rows: sheet.rows.slice(i, i + CHUNK), onDuplicate });
        results.push(...res.results);
        setProgress(Math.min(sheet.rows.length, i + CHUNK));
      }
    } catch (err) {
      setRunError(`${errorText(err, 'The import stopped.')} ${results.length} row(s) were processed before it stopped; importing the same file again skips those that were added.`);
    } finally {
      const summary = { total: results.length, created: 0, updated: 0, skipped: 0, error: 0 };
      for (const r of results) summary[r.status] += 1;
      setOutcome({ dryRun: false, summary, results });
      setBusy('');
      if (summary.created || summary.updated) onImported?.();
    }
  }

  const canRun = Boolean(sheet && sheet.rows.length && !readError && !sheet.missingRequired.length);
  const imported = outcome && !outcome.dryRun;

  const footer = imported ? (
    <>
      <Button variant="secondary" onClick={reset}>Import another file</Button>
      <Button onClick={onClose}>Done</Button>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={handleClose} disabled={busy === 'importing'}>Cancel</Button>
      <Button variant="secondary" onClick={check} disabled={!canRun || Boolean(busy)} isLoading={busy === 'checking'} loadingText="Checking…">
        Check file
      </Button>
      <Button onClick={runImport} disabled={!canRun || Boolean(busy)} isLoading={busy === 'importing'} loadingText={`Importing ${progress}/${sheet?.rows.length ?? 0}…`}>
        <Upload className="h-4 w-4" aria-hidden="true" />
        Import {sheet?.rows.length ? `${sheet.rows.length} row${sheet.rows.length === 1 ? '' : 's'}` : ''}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="xl"
      title={`Import ${spec?.label ?? ''}`}
      description="Upload an Excel or CSV file. The first row must be the column headings."
      footer={spec ? footer : null}
    >
      {specError && <Alert tone="error" title="Import unavailable">{specError}</Alert>}
      {!spec && !specError && <p className="text-sm text-ink-muted">Loading…</p>}

      {spec && (
        <div className="space-y-4">
          {/* Step 1: template + file */}
          {!imported && (
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line bg-canvas p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
                <div className="text-sm">
                  <p className="font-medium text-ink">{file ? file.name : 'Choose a file to import'}</p>
                  <p className="text-ink-muted">
                    Required columns: {spec.fields.filter((f) => f.required).map((f) => f.label).join(', ')}.
                    {' '}Download the template to see every column.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={handleTemplate}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Template
                </Button>
                <Button size="sm" onClick={() => inputRef.current?.click()} isLoading={busy === 'reading'} loadingText="Reading…" disabled={busy === 'importing' || busy === 'checking'}>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  {file ? 'Choose another file' : 'Choose file'}
                </Button>
                <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
              </div>
            </div>
          )}

          {readError && <Alert tone="error" title="Cannot import this file">{readError}</Alert>}

          {/* Step 2: what was read */}
          {sheet && !imported && (
            <>
              {sheet.missingRequired.length > 0 && (
                <Alert tone="error" title="Required columns are missing">
                  Add a column for: {sheet.missingRequired.join(', ')}. Use the template headings.
                </Alert>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                <span><strong className="text-ink">{sheet.rows.length}</strong> data row(s) in sheet “{sheet.sheetName}”</span>
                {sheet.sheetCount > 1 && <span>Only the first sheet is read.</span>}
                {sheet.ignoredHeaders.length > 0 && <span>Ignored columns: {sheet.ignoredHeaders.join(', ')}</span>}
              </div>

              {sheet.rows.length > 0 && sheet.mappedFields.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-canvas text-ink-muted">
                      <tr>
                        <th className="px-2.5 py-2 font-medium">Row</th>
                        {sheet.mappedFields.map((f) => (
                          <th key={f.key} className="whitespace-nowrap px-2.5 py-2 font-medium">{f.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {sheet.rows.slice(0, PREVIEW_ROWS).map((r) => (
                        <tr key={r._row}>
                          <td className="px-2.5 py-1.5 text-ink-subtle">{r._row}</td>
                          {sheet.mappedFields.map((f) => (
                            <td key={f.key} className="max-w-[200px] truncate px-2.5 py-1.5 text-ink">{r[f.key]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sheet.rows.length > PREVIEW_ROWS && (
                    <p className="border-t border-line px-2.5 py-1.5 text-xs text-ink-muted">…and {sheet.rows.length - PREVIEW_ROWS} more</p>
                  )}
                </div>
              )}

              <fieldset className="space-y-1.5 text-sm">
                <legend className="mb-1 font-medium text-ink">
                  If a {spec.matchBy === 'name' ? 'name' : 'serial number'} already exists
                </legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="onDuplicate" value="skip" checked={onDuplicate === 'skip'} onChange={() => { setOnDuplicate('skip'); setOutcome(null); }} />
                  Skip it (keep what is in the system)
                </label>
                {spec.updatable && (
                  <label className="flex items-center gap-2">
                    <input type="radio" name="onDuplicate" value="update" checked={onDuplicate === 'update'} onChange={() => { setOnDuplicate('update'); setOutcome(null); }} />
                    Update it with the values in the file (blank cells are left unchanged)
                  </label>
                )}
              </fieldset>
            </>
          )}

          {runError && <Alert tone="error" title="Import problem">{runError}</Alert>}

          {/* Step 3: check / import results */}
          {outcome && <ImportOutcome outcome={outcome} onDownload={handleDownloadResults} />}
        </div>
      )}
    </Modal>
  );
}

function ImportOutcome({ outcome, onDownload }) {
  const { dryRun, summary, results } = outcome;
  const problems = results.filter((r) => r.status === 'error' || r.status === 'skipped');
  const verb = dryRun ? { created: 'will be added', updated: 'will be updated', skipped: 'will be skipped', error: 'have errors' }
    : { created: 'added', updated: 'updated', skipped: 'skipped', error: 'failed' };

  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex items-center gap-2">
        {summary.error ? (
          <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
        )}
        <p className="font-medium text-ink">
          {dryRun ? 'Check complete. Nothing has been saved yet.' : 'Import finished.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {['created', 'updated', 'skipped', 'error'].map((s) => (summary[s] ? (
          <Badge key={s} tone={STATUS_TONE[s]}>{summary[s]} {verb[s]}</Badge>
        ) : null))}
      </div>
      {dryRun && summary.error > 0 && (
        <p className="text-sm text-ink-muted">Rows with errors are left out when you import. Fix them in the file and choose it again, or import now and fix them later.</p>
      )}

      {problems.length > 0 && (
        <>
          <div className="max-h-60 overflow-y-auto rounded-lg border border-line">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-canvas text-ink-muted">
                <tr>
                  <th className="px-2.5 py-2 font-medium">Row</th>
                  <th className="px-2.5 py-2 font-medium">Record</th>
                  <th className="px-2.5 py-2 font-medium">Result</th>
                  <th className="px-2.5 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...problems].sort((a, b) => (a.status === b.status ? a.row - b.row : a.status === 'error' ? -1 : 1)).map((r) => (
                  <tr key={`${r.row}-${r.status}`}>
                    <td className="px-2.5 py-1.5 text-ink-subtle">{r.row}</td>
                    <td className="max-w-[200px] truncate px-2.5 py-1.5 text-ink">{r.label || '—'}</td>
                    <td className="px-2.5 py-1.5"><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                    <td className="px-2.5 py-1.5 text-ink-muted">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="ghost" size="sm" onClick={onDownload}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Download this list
          </Button>
        </>
      )}
    </div>
  );
}
