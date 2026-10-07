const fs = require('fs');

// 1. Update DailyWorkDetailModal.jsx
let modalContent = fs.readFileSync('client/src/components/dailyWork/DailyWorkDetailModal.jsx', 'utf8');

const oldGridInModal = `              {/* Material Usage & Linked Expenses Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">`;

const newGridInModal = `              {/* Material Usage, Miscellaneous Expenses & Linked Finance Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* Miscellaneous Expense */}
                <div className="rounded-xl border border-line bg-white p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink uppercase tracking-wider">
                    <Receipt className="h-4 w-4 text-amber-600" />
                    Miscellaneous Expense
                  </div>
                  {detail.miscAmount && Number(detail.miscAmount) > 0 ? (
                    <div className="space-y-1.5 pt-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Description:</span>
                        <span className="font-semibold text-ink">{detail.miscDescription || 'Site Expense'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Amount:</span>
                        <span className="font-bold text-amber-800">{formatCurrency(detail.miscAmount)}</span>
                      </div>
                      {detail.miscRemarks && (
                        <div className="text-[11px] text-ink-subtle italic pt-1 border-t border-line/60">
                          {detail.miscRemarks}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="pt-2 text-xs text-ink-subtle italic">No miscellaneous operational expenses logged.</p>
                  )}
                </div>`;

if (!modalContent.includes('Miscellaneous Expense')) {
  modalContent = modalContent.replace(oldGridInModal.replace(/\r?\n/g, '\r\n'), newGridInModal.replace(/\r?\n/g, '\r\n'));
  if (!modalContent.includes('Miscellaneous Expense')) {
    modalContent = modalContent.replace(oldGridInModal.replace(/\r?\n/g, '\n'), newGridInModal.replace(/\r?\n/g, '\n'));
  }
  fs.writeFileSync('client/src/components/dailyWork/DailyWorkDetailModal.jsx', modalContent, 'utf8');
  console.log('DailyWorkDetailModal.jsx updated');
}

// 2. Update ContractorDailyWorkPage.jsx
let cdwp = fs.readFileSync('client/src/pages/contractor/ContractorDailyWorkPage.jsx', 'utf8');

// Add state for misc expense
if (!cdwp.includes('miscDescription')) {
  cdwp = cdwp.replace(
    "const [quantityUsed, setQuantityUsed] = useState('');",
    "const [quantityUsed, setQuantityUsed] = useState('');\n  const [miscDescription, setMiscDescription] = useState('');\n  const [miscAmount, setMiscAmount] = useState('');\n  const [miscRemarks, setMiscRemarks] = useState('');"
  );
}

// Auto-populate workers from assignedWorkers first
const oldWorkerPopulate = `        const assigned = taskDetail.labour || [];
        setTaskAssignedLabour(assigned);

        // Pre-populate workers list from assigned labourers
        if (assigned.length > 0) {
          const initialWorkers = assigned.map((l) => ({
            workerId: l.workerId || l.worker_id || null,
            workerType: l.workerType || l.worker_type || 'labour',
            workerName: l.labourName || l.person_name || 'Worker',
            workerCode: l.person_code || null,
            labourType: l.labourType || l.skillTrade || 'Labour',
            hoursWorked: 8,
            dailyWage: Number(l.dailyWage || l.daily_wage || 0),
            workPerformed: '',
            isPresent: true,
          }));
          setWorkers(initialWorkers);
        } else {
          setWorkers([]);
        }`;

const newWorkerPopulate = `        const assigned = (taskDetail.assignedWorkers && taskDetail.assignedWorkers.length > 0)
          ? taskDetail.assignedWorkers
          : (taskDetail.labour || []);
        setTaskAssignedLabour(assigned);

        // Pre-populate workers list from actual assigned workers
        if (assigned.length > 0) {
          const initialWorkers = assigned.map((l) => ({
            workerId: l.workerId || l.worker_id || null,
            workerType: l.workerType || l.worker_type || 'daily_wage',
            workerName: l.workerName || l.labourName || l.person_name || 'Worker',
            workerCode: l.workerCode || l.person_code || null,
            phone: l.phone || l.person_phone || null,
            aadhaarNumber: l.aadhaarNumber || l.person_aadhaar || null,
            labourType: l.trade || l.labourType || l.skillTrade || 'General Labour',
            hoursWorked: 8,
            dailyWage: (l.workerType === 'company_employee' || String(l.labourType).toLowerCase().includes('company')) ? 0 : Number(l.dailyWage || l.daily_wage || 750),
            workPerformed: '',
            isPresent: true,
          }));
          setWorkers(initialWorkers);
        } else {
          setWorkers([]);
        }`;

if (!cdwp.includes('taskDetail.assignedWorkers')) {
  cdwp = cdwp.replace(oldWorkerPopulate.replace(/\r?\n/g, '\r\n'), newWorkerPopulate.replace(/\r?\n/g, '\r\n'));
  if (!cdwp.includes('taskDetail.assignedWorkers')) {
    cdwp = cdwp.replace(oldWorkerPopulate.replace(/\r?\n/g, '\n'), newWorkerPopulate.replace(/\r?\n/g, '\n'));
  }
}

// In handleSubmit: append misc fields and reset
if (!cdwp.includes("formData.append('misc_amount'")) {
  cdwp = cdwp.replace(
    "formData.append('photos', photo);\n      });",
    `formData.append('photos', photo);
      });

      if (miscAmount && Number(miscAmount) > 0) {
        formData.append('misc_amount', Number(miscAmount));
        formData.append('misc_description', miscDescription);
        formData.append('misc_remarks', miscRemarks);
      }`
  );
  cdwp = cdwp.replace(
    "setSelectedMaterialId('');\n      setQuantityUsed('');",
    "setSelectedMaterialId('');\n      setQuantityUsed('');\n      setMiscDescription('');\n      setMiscAmount('');\n      setMiscRemarks('');"
  );
}

// In handleExportCSV: add misc expense
if (!cdwp.includes("'Misc Expense (₹)',")) {
  cdwp = cdwp.replace(
    "'Quantity Used',\n      'Remarks',",
    "'Quantity Used',\n      'Misc Expense (₹)',\n      'Remarks',"
  );
  cdwp = cdwp.replace(
    "`\"${u.quantityUsed ? u.quantityUsed + ' ' + (u.unit || '') : ''}\"`,\n      `\"${(u.remarks || '').replace(/\"/g, '\"\"')}\"`,",
    "`\"${u.quantityUsed ? u.quantityUsed + ' ' + (u.unit || '') : ''}\"`,\n      `\"${u.miscAmount ? '₹' + u.miscAmount : ''}\"`,\n      `\"${(u.remarks || '').replace(/\"/g, '\"\"')}\"`,"
  );
}

// Add Misc Expense UI form section right after Material Used section
const materialBlockEnd = `                  </div>
                </div>`;

const miscSectionSnippet = `

                {/* Miscellaneous Expense */}
                <div className="rounded-xl border border-line bg-canvas/30 p-4 space-y-3">
                  <div>
                    <p className="text-xs font-bold text-ink flex items-center gap-1.5">
                      <Receipt className="h-4 w-4 text-brand-600" />
                      Miscellaneous Daily Expense (Linked to Task)
                    </p>
                    <p className="text-[11px] text-ink-subtle">
                      Record incidental daily expenses (transport, tea/refreshments, petty purchases) directly into this single update.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-ink mb-1.5">
                        Expense Description
                      </label>
                      <input
                        type="text"
                        value={miscDescription}
                        onChange={(e) => setMiscDescription(e.target.value)}
                        placeholder="e.g. Local transport for curing pipe, ice water for labourers..."
                        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-ink mb-1.5">
                        Amount (₹)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-xs font-bold text-ink-muted">₹</span>
                        <input
                          type="number"
                          min="0"
                          value={miscAmount}
                          onChange={(e) => setMiscAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-line bg-white pl-7 pr-3 py-2 text-xs text-ink focus:border-brand-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink mb-1.5">
                      Expense Remarks / Notes
                    </label>
                    <input
                      type="text"
                      value={miscRemarks}
                      onChange={(e) => setMiscRemarks(e.target.value)}
                      placeholder="Optional details, receipt reference..."
                      className="w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink focus:border-brand-500"
                    />
                  </div>
                </div>`;

if (!cdwp.includes('Miscellaneous Daily Expense')) {
  // Find second occurrence of materialBlockEnd (which is after Material Selection)
  const matIdx = cdwp.indexOf('Material Used Today (From Site Inventory)');
  if (matIdx !== -1) {
    const insertAfter = cdwp.indexOf('</div>\n                </div>', matIdx);
    if (insertAfter !== -1) {
      cdwp = cdwp.slice(0, insertAfter + 23) + miscSectionSnippet + cdwp.slice(insertAfter + 23);
    } else {
      const insertAfterCRLF = cdwp.indexOf('</div>\r\n                </div>', matIdx);
      if (insertAfterCRLF !== -1) {
        cdwp = cdwp.slice(0, insertAfterCRLF + 25) + miscSectionSnippet + cdwp.slice(insertAfterCRLF + 25);
      }
    }
  }
}

// In Excel-style table view: add Material and Misc Expense columns
const oldTableHeaders = `<th className="px-3.5 py-3">Task Scope</th>
                        <th className="px-3 py-3 text-center">Workers</th>
                        <th className="px-3.5 py-3">Work Executed</th>`;

const newTableHeaders = `<th className="px-3.5 py-3">Task Scope</th>
                        <th className="px-3 py-3 text-center">Workers</th>
                        <th className="px-3.5 py-3">Material Used</th>
                        <th className="px-3.5 py-3 text-right">Misc Expense</th>
                        <th className="px-3.5 py-3">Work Executed</th>`;

if (!cdwp.includes('Material Used</th>')) {
  cdwp = cdwp.replace(oldTableHeaders.replace(/\r?\n/g, '\r\n'), newTableHeaders.replace(/\r?\n/g, '\r\n'));
  if (!cdwp.includes('Material Used</th>')) {
    cdwp = cdwp.replace(oldTableHeaders.replace(/\r?\n/g, '\n'), newTableHeaders.replace(/\r?\n/g, '\n'));
  }
}

const oldTableCells = `<td className="px-3.5 py-3 text-xs font-medium text-ink">
                            {u.taskName || u.phaseTitle || '—'}
                          </td>

                          <td className="px-3 py-3 text-center">
                            <span className="inline-flex items-center gap-1 rounded-md bg-canvas px-2 py-0.5 text-xs font-semibold text-ink border border-line">
                              <Users className="h-3 w-3 text-brand-600" />
                              {u.workerCount || 0}
                            </span>
                          </td>

                          <td className="px-3.5 py-3 text-xs text-ink max-w-xs truncate">
                            {u.workDone}
                          </td>`;

const newTableCells = `<td className="px-3.5 py-3 text-xs font-medium text-ink">
                            {u.taskName || u.phaseTitle || '—'}
                          </td>

                          <td className="px-3 py-3 text-center">
                            <span className="inline-flex items-center gap-1 rounded-md bg-canvas px-2 py-0.5 text-xs font-semibold text-ink border border-line">
                              <Users className="h-3 w-3 text-brand-600" />
                              {u.workerCount || 0}
                            </span>
                          </td>

                          <td className="px-3.5 py-3 text-xs text-ink-muted">
                            {u.materialName ? (
                              <span className="font-medium text-ink">
                                {u.quantityUsed} {u.unit} {u.materialName}
                              </span>
                            ) : (
                              <span className="text-ink-subtle">—</span>
                            )}
                          </td>

                          <td className="px-3.5 py-3 text-xs text-right font-semibold tabular-nums text-ink">
                            {u.miscAmount && Number(u.miscAmount) > 0 ? (
                              <span className="text-amber-800">{formatCurrency(u.miscAmount)}</span>
                            ) : (
                              <span className="text-ink-subtle">—</span>
                            )}
                          </td>

                          <td className="px-3.5 py-3 text-xs text-ink max-w-xs truncate">
                            {u.workDone}
                          </td>`;

if (!cdwp.includes('u.materialName ?')) {
  cdwp = cdwp.replace(oldTableCells.replace(/\r?\n/g, '\r\n'), newTableCells.replace(/\r?\n/g, '\r\n'));
  if (!cdwp.includes('u.materialName ?')) {
    cdwp = cdwp.replace(oldTableCells.replace(/\r?\n/g, '\n'), newTableCells.replace(/\r?\n/g, '\n'));
  }
}

fs.writeFileSync('client/src/pages/contractor/ContractorDailyWorkPage.jsx', cdwp, 'utf8');
console.log('ContractorDailyWorkPage.jsx updated successfully');
