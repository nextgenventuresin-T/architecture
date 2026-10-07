const fs = require('fs');

// 1. Update ProjectFormPage.jsx
let pfp = fs.readFileSync('client/src/pages/admin/projects/ProjectFormPage.jsx', 'utf8');

// Update + Add Labour button click in ProjectFormPage
const oldAddLabourInPfp = `                                        labour: [
                                          ...t.labour,
                                          {
                                            tempId: uid(),
                                            workerId: null,
                                            workerType: 'labour',
                                            labourName: '',
                                            labourType: 'Labour',
                                            skillTrade: '',
                                            startDate: sDate,
                                            endDate: eDate,
                                            workerCount: 1,
                                            dailyWage: 750,
                                            workingDays: days,
                                            remarks: '',
                                          },
                                        ],`;

const newAddLabourInPfp = `                                        labour: [
                                          ...t.labour,
                                          {
                                            tempId: uid(),
                                            role: 'General Labour',
                                            workerCount: 5,
                                            workingDays: days || 20,
                                            dailyWage: 800,
                                            remarks: '',
                                          },
                                        ],`;

pfp = pfp.replace(oldAddLabourInPfp, newAddLabourInPfp);

// Replace the table header and body in ProjectFormPage
const oldTableInPfp = `                                  <thead className="border-b border-line bg-canvas-subtle text-ink-subtle font-semibold uppercase text-[11px]">
                                    <tr>
                                      <th className="p-2.5 min-w-[200px]">Select Labour / Person</th>
                                      <th className="p-2.5 w-36">Labour Type</th>
                                      <th className="p-2.5 w-32">Expected Start</th>
                                      <th className="p-2.5 w-32">Expected End</th>
                                      <th className="p-2.5 w-20 text-center">Days</th>
                                      <th className="p-2.5 w-24 text-right">Daily Wage (₹)</th>
                                      <th className="p-2.5 w-28 text-right">Total (₹)</th>
                                      <th className="p-2.5 min-w-[140px]">Remarks</th>
                                      <th className="p-2.5 w-10 text-center"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-line">
                                    {t.labour.map((l, lIdx) => {
                                      const isCompany = l.labourType === 'Company Employee';
                                      const dw = isCompany ? 0 : Number(l.dailyWage || 0);
                                      const wd = Number(l.workingDays || calcWorkingDays(l.startDate, l.endDate));
                                      const lineTotal = isCompany ? 0 : dw * wd;
                                      const compoundValue = l.workerId && l.workerType ? \`\${l.workerType}-\${l.workerId}\` : '';

                                      return (
                                        <tr key={lIdx} className="hover:bg-canvas-subtle/50 transition-colors">
                                          <td className="p-2">
                                            <select
                                              value={compoundValue}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  const found = (Array.isArray(workforceList) ? workforceList : []).find((w) => String(w.id) === String(e.target.value));
                                                  if (found) {
                                                    const isDuplicate = copy.some(
                                                      (p, i) => i !== lIdx && p.workerId === found.workerId && p.workerType === found.workerType
                                                    );
                                                    if (isDuplicate) {
                                                      alert(\`\${found.name} is already assigned to this task.\`);
                                                      return task;
                                                    }
                                                    copy[lIdx] = {
                                                      ...copy[lIdx],
                                                      workerId: found.workerId,
                                                      workerType: found.workerType,
                                                      labourName: found.name,
                                                      skillTrade: found.trade || '',
                                                      labourType: found.workerType === 'company_employee' ? 'Company Employee' : 'Labour',
                                                      dailyWage: found.workerType === 'company_employee' ? 0 : Number(found.dailyRate || 750),
                                                    };
                                                  } else {
                                                    copy[lIdx] = { ...copy[lIdx], labourName: e.target.value };
                                                  }
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              className="w-full rounded-lg border border-line bg-white p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            >
                                              <option value="">-- Choose Labour / Employee --</option>
                                              {(Array.isArray(workforceList) ? workforceList : []).map((w) => (
                                                <option key={w.id} value={w.id}>
                                                  {w.name} ({w.trade}) — {w.workerType === 'company_employee' ? 'Company Employee' : w.contractorName}
                                                </option>
                                              ))}
                                            </select>
                                            {l.skillTrade && (
                                              <span className="text-[10px] text-ink-subtle mt-0.5 block">
                                                Trade: <strong className="text-ink-muted">{l.skillTrade}</strong>
                                              </span>
                                            )}
                                          </td>

                                          <td className="p-2">
                                            <select
                                              value={l.labourType}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  const val = e.target.value;
                                                  copy[lIdx] = {
                                                    ...copy[lIdx],
                                                    labourType: val,
                                                    workerType: val === 'Company Employee' ? 'company_employee' : 'labour',
                                                    dailyWage: val === 'Company Employee' ? 0 : (copy[lIdx].dailyWage || 750),
                                                  };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              className="w-full rounded-lg border border-line bg-white p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            >
                                              <option value="Labour">Labour</option>
                                              <option value="Company Employee">Company Employee</option>
                                            </select>
                                          </td>

                                          <td className="p-2">
                                            <input
                                              type="date"
                                              value={l.startDate || ''}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  const sDate = e.target.value;
                                                  const days = calcWorkingDays(sDate, copy[lIdx].endDate);
                                                  copy[lIdx] = { ...copy[lIdx], startDate: sDate, workingDays: days };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              className="w-full rounded-lg border border-line bg-white p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            />
                                          </td>

                                          <td className="p-2">
                                            <input
                                              type="date"
                                              value={l.endDate || ''}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  const eDate = e.target.value;
                                                  const days = calcWorkingDays(copy[lIdx].startDate, eDate);
                                                  copy[lIdx] = { ...copy[lIdx], endDate: eDate, workingDays: days };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              className="w-full rounded-lg border border-line bg-white p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            />
                                          </td>

                                          <td className="p-2 text-center">
                                            <span className="inline-flex items-center justify-center rounded bg-brand-50 border border-brand-200 px-2 py-0.5 text-xs font-bold text-brand-700">
                                              {wd} d
                                            </span>
                                          </td>

                                          <td className="p-2 text-right">
                                            {isCompany ? (
                                              <span className="block text-center text-xs text-ink-subtle font-mono">—</span>
                                            ) : (
                                              <input
                                                type="number"
                                                min="0"
                                                value={l.dailyWage}
                                                onChange={(e) =>
                                                  updateTask(t.tempId, (task) => {
                                                    const copy = [...task.labour];
                                                    const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                                                    copy[lIdx] = { ...copy[lIdx], dailyWage: val };
                                                    return { ...task, labour: copy };
                                                  })
                                                }
                                                className="w-full text-right rounded-lg border border-line p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                              />
                                            )}
                                          </td>

                                          <td className="p-2 text-right font-semibold text-ink tabular-nums">
                                            {isCompany ? <span className="text-ink-subtle">—</span> : formatCurrency(lineTotal)}
                                          </td>

                                          <td className="p-2">
                                            <input
                                              type="text"
                                              placeholder="Assignment remarks..."
                                              value={l.remarks || ''}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  copy[lIdx] = { ...copy[lIdx], remarks: e.target.value };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              className="w-full rounded-lg border border-line bg-white p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            />
                                          </td>`;

const newTableInPfp = `                                  <thead className="border-b border-line bg-canvas-subtle text-ink-subtle font-semibold uppercase text-[11px]">
                                    <tr>
                                      <th className="p-2.5 min-w-[180px]">Role / Category</th>
                                      <th className="p-2.5 w-28 text-right">Workers</th>
                                      <th className="p-2.5 w-28 text-right">Working Days</th>
                                      <th className="p-2.5 w-32 text-right">Daily Wage (₹)</th>
                                      <th className="p-2.5 w-36 text-right">Planned Labour Cost (₹)</th>
                                      <th className="p-2.5 min-w-[140px]">Remarks</th>
                                      <th className="p-2.5 w-10 text-center"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-line">
                                    {t.labour.map((l, lIdx) => {
                                      const wc = Number(l.workerCount || 1);
                                      const wd = Number(l.workingDays || 0);
                                      const dw = Number(l.dailyWage || 0);
                                      const lineTotal = wc * wd * dw;

                                      return (
                                        <tr key={lIdx} className="hover:bg-canvas-subtle/50 transition-colors">
                                          <td className="p-2">
                                            <input
                                              type="text"
                                              value={l.role || l.labourType || ''}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  copy[lIdx] = { ...copy[lIdx], role: e.target.value, labourType: e.target.value };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              placeholder="e.g. Mason, Helper, Carpenter"
                                              className="w-full rounded-lg border border-line bg-white p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            />
                                          </td>

                                          <td className="p-2 text-right">
                                            <input
                                              type="number"
                                              min="1"
                                              value={l.workerCount || 1}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  copy[lIdx] = { ...copy[lIdx], workerCount: Math.max(1, Number(e.target.value) || 1) };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              className="w-full text-right rounded-lg border border-line p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            />
                                          </td>

                                          <td className="p-2 text-right">
                                            <input
                                              type="number"
                                              min="1"
                                              value={l.workingDays || 0}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  copy[lIdx] = { ...copy[lIdx], workingDays: Math.max(0, Number(e.target.value) || 0) };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              className="w-full text-right rounded-lg border border-line p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            />
                                          </td>

                                          <td className="p-2 text-right">
                                            <input
                                              type="number"
                                              min="0"
                                              value={l.dailyWage || 0}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  copy[lIdx] = { ...copy[lIdx], dailyWage: Math.max(0, Number(e.target.value) || 0) };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              className="w-full text-right rounded-lg border border-line p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            />
                                          </td>

                                          <td className="p-2 text-right font-semibold text-brand-700 tabular-nums">
                                            {formatCurrency(lineTotal)}
                                          </td>

                                          <td className="p-2">
                                            <input
                                              type="text"
                                              placeholder="Planning remarks..."
                                              value={l.remarks || ''}
                                              onChange={(e) =>
                                                updateTask(t.tempId, (task) => {
                                                  const copy = [...task.labour];
                                                  copy[lIdx] = { ...copy[lIdx], remarks: e.target.value };
                                                  return { ...task, labour: copy };
                                                })
                                              }
                                              className="w-full rounded-lg border border-line bg-white p-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                                            />
                                          </td>`;

pfp = pfp.replace(oldTableInPfp.replace(/\r?\n/g, '\r\n'), newTableInPfp.replace(/\r?\n/g, '\r\n'));
if (!pfp.includes('Role / Category')) {
  pfp = pfp.replace(oldTableInPfp.replace(/\r?\n/g, '\n'), newTableInPfp.replace(/\r?\n/g, '\n'));
}

// Update task labour budget calculation in ProjectFormPage
pfp = pfp.replace(
  'const labourTotal = t.labour.reduce((s, l) => s + (l.labourType === \'Company Employee\' ? 0 : Number(l.dailyWage || 0) * Number(l.workingDays || 0)), 0);',
  'const labourTotal = t.labour.reduce((s, l) => s + (Number(l.workerCount || 1) * Number(l.workingDays || 0) * Number(l.dailyWage || 0)), 0);'
);

fs.writeFileSync('client/src/pages/admin/projects/ProjectFormPage.jsx', pfp, 'utf8');
console.log('ProjectFormPage.jsx successfully updated to aggregate labour budget planning');

// 2. Update TaskFormModal.jsx
let tfm = fs.readFileSync('client/src/components/tasks/TaskFormModal.jsx', 'utf8');

// Update addLabourRow in TaskFormModal
const oldAddLabourInTfm = `  const addLabourRow = () => {
    const days = durationDays || 14;
    setLabour((prev) => [
      ...prev,
      {
        worker_id: null,
        worker_type: 'labour',
        labour_name: '',
        labour_type: 'Labour',
        skill_trade: '',
        start_date: startDate,
        end_date: endDate,
        working_days: days,
        daily_wage: 750,
        worker_count: 1,
        total_cost: 750 * days,
        remarks: '',
      },
    ]);
  };`;

const newAddLabourInTfm = `  const addLabourRow = () => {
    const days = durationDays || 20;
    setLabour((prev) => [
      ...prev,
      {
        labour_type: 'General Labour',
        worker_count: 5,
        working_days: days,
        daily_wage: 800,
        total_cost: 5 * days * 800,
        remarks: '',
      },
    ]);
  };`;

tfm = tfm.replace(oldAddLabourInTfm.replace(/\r?\n/g, '\r\n'), newAddLabourInTfm.replace(/\r?\n/g, '\r\n'));
if (!tfm.includes('total_cost: 5 * days * 800')) {
  tfm = tfm.replace(oldAddLabourInTfm.replace(/\r?\n/g, '\n'), newAddLabourInTfm.replace(/\r?\n/g, '\n'));
}

// Update updateLabourRow in TaskFormModal
const oldUpdateLabourRowInTfm = `  const updateLabourRow = (idx, field, value) => {
    setLabour((prev) => {
      const updated = [...prev];
      const row = { ...updated[idx] };

      if (field === 'worker_selection') {
        const found = (Array.isArray(workforceMaster) ? workforceMaster : []).find((w) => String(w.id) === String(value));
        if (found) {
          const isDuplicate = prev.some(
            (p, i) => i !== idx && p.worker_id === found.workerId && p.worker_type === found.workerType
          );
          if (isDuplicate) {
            alert(\`\${found.name} is already assigned to this task.\`);
            return prev;
          }
          row.worker_id = found.workerId;
          row.worker_type = found.workerType;
          row.labour_name = found.name;
          row.skill_trade = found.trade || '';
          row.labour_type = found.workerType === 'company_employee' ? 'Company Employee' : 'Labour';
          row.daily_wage = found.workerType === 'company_employee' ? 0 : Number(found.dailyRate || 750);
        }
      } else if (field === 'labour_type') {
        row.labour_type = value;
        if (value === 'Company Employee') {
          row.worker_type = 'company_employee';
          row.daily_wage = 0;
        } else {
          row.worker_type = 'labour';
          if (!row.daily_wage) row.daily_wage = 750;
        }
      } else {
        row[field] = value;
      }

      if (field === 'start_date' || field === 'end_date' || !row.working_days) {
        row.working_days = calcWorkingDays(row.start_date, row.end_date);
      }

      const days = Number(row.working_days || 0);
      const wage = Number(row.daily_wage || 0);
      row.total_cost = row.labour_type === 'Company Employee' ? 0 : Number((wage * days).toFixed(2));

      updated[idx] = row;
      return updated;
    });
  };`;

const newUpdateLabourRowInTfm = `  const updateLabourRow = (idx, field, value) => {
    setLabour((prev) => {
      const updated = [...prev];
      const row = { ...updated[idx], [field]: value };

      const wc = Number(row.worker_count || 1);
      const days = Number(row.working_days || 0);
      const wage = Number(row.daily_wage || 0);
      row.total_cost = Number((wc * days * wage).toFixed(2));

      updated[idx] = row;
      return updated;
    });
  };`;

tfm = tfm.replace(oldUpdateLabourRowInTfm.replace(/\r?\n/g, '\r\n'), newUpdateLabourRowInTfm.replace(/\r?\n/g, '\r\n'));
if (!tfm.includes('const wc = Number(row.worker_count || 1);')) {
  tfm = tfm.replace(oldUpdateLabourRowInTfm.replace(/\r?\n/g, '\n'), newUpdateLabourRowInTfm.replace(/\r?\n/g, '\n'));
}

// Update JSX table in TaskFormModal
const oldJsxLabourInTfm = `                    <thead className="bg-canvas-subtle text-ink-subtle uppercase text-[11px] font-semibold border-b border-line">
                      <tr>
                        <th className="p-2 min-w-[200px]">Select Labour / Person</th>
                        <th className="p-2 w-36">Labour Type</th>
                        <th className="p-2 w-32">Start Date</th>
                        <th className="p-2 w-32">End Date</th>
                        <th className="p-2 w-20 text-center">Days</th>
                        <th className="p-2 w-24 text-right">Daily Wage (₹)</th>
                        <th className="p-2 w-28 text-right">Total (₹)</th>
                        <th className="p-2 min-w-[140px]">Remarks</th>
                        <th className="p-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {labour.map((l, idx) => {
                        const compoundValue = l.worker_id && l.worker_type ? \`\${l.worker_type}-\${l.worker_id}\` : '';
                        const isCompany = l.labour_type === 'Company Employee';
                        return (
                          <tr key={idx} className="hover:bg-canvas-subtle/40 transition-colors">
                            <td className="p-2">
                              <select
                                value={compoundValue}
                                onChange={(e) => updateLabourRow(idx, 'worker_selection', e.target.value)}
                                className="w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                              >
                                <option value="">-- Choose Labour / Employee --</option>
                                {(Array.isArray(workforceMaster) ? workforceMaster : []).map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.name} ({w.trade}) — {w.workerType === 'company_employee' ? 'Company Employee' : w.contractorName}
                                  </option>
                                ))}
                              </select>
                              {l.skill_trade && (
                                <span className="text-[10px] text-ink-subtle mt-0.5 block">
                                  Trade: <strong className="text-ink-muted">{l.skill_trade}</strong>
                                </span>
                              )}
                            </td>

                            <td className="p-2">
                              <select
                                value={l.labour_type}
                                onChange={(e) => updateLabourRow(idx, 'labour_type', e.target.value)}
                                className="w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-brand-500"
                              >
                                {LABOUR_TYPE_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="p-2">
                              <input
                                type="date"
                                value={l.start_date || ''}
                                onChange={(e) => updateLabourRow(idx, 'start_date', e.target.value)}
                                className="w-full rounded border border-line bg-white px-2 py-1 text-xs text-ink focus:border-brand-500"
                              />
                            </td>

                            <td className="p-2">
                              <input
                                type="date"
                                value={l.end_date || ''}
                                onChange={(e) => updateLabourRow(idx, 'end_date', e.target.value)}
                                className="w-full rounded border border-line bg-white px-2 py-1 text-xs text-ink focus:border-brand-500"
                              />
                            </td>

                            <td className="p-2 text-center">
                              <span className="inline-flex items-center justify-center rounded bg-brand-50 border border-brand-200 px-2 py-0.5 text-xs font-bold text-brand-700">
                                {l.working_days || 0} d
                              </span>
                            </td>

                            <td className="p-2">
                              {isCompany ? (
                                <span className="block text-center text-xs text-ink-subtle font-mono">—</span>
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  value={l.daily_wage}
                                  onChange={(e) => updateLabourRow(idx, 'daily_wage', Number(e.target.value))}
                                  className="w-full rounded border border-line bg-white px-2 py-1 text-right text-xs text-ink focus:border-brand-500"
                                />
                              )}
                            </td>

                            <td className="p-2 text-right font-semibold text-ink tabular-nums">
                              {isCompany ? <span className="text-ink-subtle">—</span> : formatCurrency(l.total_cost || 0)}
                            </td>

                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="Remarks..."
                                value={l.remarks || ''}
                                onChange={(e) => updateLabourRow(idx, 'remarks', e.target.value)}
                                className="w-full rounded border border-line bg-white px-2 py-1 text-xs text-ink focus:border-brand-500"
                              />
                            </td>`;

const newJsxLabourInTfm = `                    <thead className="bg-canvas-subtle text-ink-subtle uppercase text-[11px] font-semibold border-b border-line">
                      <tr>
                        <th className="p-2 min-w-[180px]">Role / Trade</th>
                        <th className="p-2 w-28 text-right">Workers</th>
                        <th className="p-2 w-28 text-right">Working Days</th>
                        <th className="p-2 w-32 text-right">Daily Wage (₹)</th>
                        <th className="p-2 w-36 text-right">Planned Labour Cost (₹)</th>
                        <th className="p-2 min-w-[140px]">Remarks</th>
                        <th className="p-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {labour.map((l, idx) => {
                        const wc = Number(l.worker_count || 1);
                        const days = Number(l.working_days || 0);
                        const wage = Number(l.daily_wage || 0);
                        const total = wc * days * wage;

                        return (
                          <tr key={idx} className="hover:bg-canvas-subtle/40 transition-colors">
                            <td className="p-2">
                              <input
                                type="text"
                                value={l.labour_type || ''}
                                onChange={(e) => updateLabourRow(idx, 'labour_type', e.target.value)}
                                placeholder="e.g. Mason, Helper, Carpenter"
                                className="w-full rounded border border-line bg-white px-2 py-1 text-xs text-ink focus:border-brand-500"
                              />
                            </td>

                            <td className="p-2 text-right">
                              <input
                                type="number"
                                min="1"
                                value={l.worker_count || 1}
                                onChange={(e) => updateLabourRow(idx, 'worker_count', Math.max(1, Number(e.target.value) || 1))}
                                className="w-full rounded border border-line bg-white px-2 py-1 text-right text-xs text-ink focus:border-brand-500"
                              />
                            </td>

                            <td className="p-2 text-right">
                              <input
                                type="number"
                                min="0"
                                value={l.working_days || 0}
                                onChange={(e) => updateLabourRow(idx, 'working_days', Math.max(0, Number(e.target.value) || 0))}
                                className="w-full rounded border border-line bg-white px-2 py-1 text-right text-xs text-ink focus:border-brand-500"
                              />
                            </td>

                            <td className="p-2 text-right">
                              <input
                                type="number"
                                min="0"
                                value={l.daily_wage || 0}
                                onChange={(e) => updateLabourRow(idx, 'daily_wage', Math.max(0, Number(e.target.value) || 0))}
                                className="w-full rounded border border-line bg-white px-2 py-1 text-right text-xs text-ink focus:border-brand-500"
                              />
                            </td>

                            <td className="p-2 text-right font-semibold text-brand-700 tabular-nums">
                              {formatCurrency(total)}
                            </td>

                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="Planning remarks..."
                                value={l.remarks || ''}
                                onChange={(e) => updateLabourRow(idx, 'remarks', e.target.value)}
                                className="w-full rounded border border-line bg-white px-2 py-1 text-xs text-ink focus:border-brand-500"
                              />
                            </td>`;

tfm = tfm.replace(oldJsxLabourInTfm.replace(/\r?\n/g, '\r\n'), newJsxLabourInTfm.replace(/\r?\n/g, '\r\n'));
if (!tfm.includes('th className="p-2 min-w-[180px]">Role / Trade')) {
  tfm = tfm.replace(oldJsxLabourInTfm.replace(/\r?\n/g, '\n'), newJsxLabourInTfm.replace(/\r?\n/g, '\n'));
}

fs.writeFileSync('client/src/components/tasks/TaskFormModal.jsx', tfm, 'utf8');
console.log('TaskFormModal.jsx successfully updated to aggregate labour budget planning');
