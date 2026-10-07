const fs = require('fs');

// 1. Update dailyWorkModel.js
let modelContent = fs.readFileSync('server/src/models/dailyWorkModel.js', 'utf8');

const targetModelInsert = `       material_id, quantity_used, unit, warehouse_transaction_id, expense_id,
       work_date, work_done, work_status, progress_percentage, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const replacementModelInsert = `       material_id, quantity_used, unit, warehouse_transaction_id, expense_id,
       work_date, work_done, work_status, progress_percentage, remarks, created_by,
       misc_description, misc_amount, misc_remarks, misc_receipt_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

if (modelContent.includes(targetModelInsert)) {
  modelContent = modelContent.replace(
    '  created_by,\n}) {',
    '  created_by,\n  misc_description,\n  misc_amount,\n  misc_remarks,\n  misc_receipt_path,\n}) {'
  );
  modelContent = modelContent.replace(targetModelInsert, replacementModelInsert);
  modelContent = modelContent.replace(
    '      created_by || null,\n    ]\n  );',
    '      created_by || null,\n      misc_description || null,\n      misc_amount ? Number(misc_amount) : 0,\n      misc_remarks || null,\n      misc_receipt_path || null,\n    ]\n  );'
  );
  fs.writeFileSync('server/src/models/dailyWorkModel.js', modelContent, 'utf8');
  console.log('dailyWorkModel.js updated');
}

// 2. Update dailyWorkService.js
let serviceContent = fs.readFileSync('server/src/services/dailyWorkService.js', 'utf8');

// In list function: include misc fields
if (!serviceContent.includes('miscAmount: r.misc_amount')) {
  serviceContent = serviceContent.replace(
    'unit: r.unit || r.material_unit,',
    'unit: r.unit || r.material_unit,\n      miscAmount: r.misc_amount ? Number(r.misc_amount) : 0,\n      miscDescription: r.misc_description,\n      miscRemarks: r.misc_remarks,'
  );
}

// In getById function: query task_assigned_workers
const targetAssignedQuery = `    const [assignedRows] = await pool.query(
      \`SELECT tl.*,
              COALESCE(cw.full_name, e.full_name, tl.labour_name) AS person_name,
              COALESCE(cw.worker_code, e.employee_code) AS person_code,
              COALESCE(cw.phone, e.phone) AS person_phone,
              COALESCE(cw.skill_category, e.designation, tl.skill_trade) AS person_trade,
              tl.worker_type,
              c.name AS contractor_name
       FROM task_labour tl
       LEFT JOIN contractor_workers cw ON cw.id = tl.worker_id AND tl.worker_type = 'labour'
       LEFT JOIN contractors c ON c.id = cw.contractor_id
       LEFT JOIN employees e ON e.id = tl.worker_id AND tl.worker_type = 'company_employee'
       WHERE tl.task_id = ? ORDER BY tl.id ASC\`,
      [update.task_id]
    );`;

const replacementAssignedQuery = `    // Query actual assigned workers from task_assigned_workers first
    let [assignedRows] = await pool.query(
      \`SELECT taw.*,
              taw.worker_name AS person_name,
              taw.worker_code AS person_code,
              COALESCE(taw.phone, cw.phone, e.phone) AS person_phone,
              COALESCE(taw.aadhaar_number, cw.aadhaar_number) AS person_aadhaar,
              COALESCE(taw.trade, cw.skill_category, e.designation) AS person_trade,
              taw.worker_type,
              c.name AS contractor_name
       FROM task_assigned_workers taw
       LEFT JOIN contractor_workers cw ON cw.id = taw.worker_id AND taw.worker_type = 'daily_wage'
       LEFT JOIN contractors c ON c.id = cw.contractor_id
       LEFT JOIN employees e ON e.id = taw.worker_id AND taw.worker_type = 'company_employee'
       WHERE taw.task_id = ? ORDER BY taw.id ASC\`,
      [update.task_id]
    );

    // Fallback to task_labour if no rows in task_assigned_workers
    if (!assignedRows.length) {
      const [legacyRows] = await pool.query(
        \`SELECT tl.*,
                COALESCE(cw.full_name, e.full_name, tl.labour_name) AS person_name,
                COALESCE(cw.worker_code, e.employee_code) AS person_code,
                COALESCE(cw.phone, e.phone) AS person_phone,
                cw.aadhaar_number AS person_aadhaar,
                COALESCE(cw.skill_category, e.designation, tl.skill_trade) AS person_trade,
                tl.worker_type,
                c.name AS contractor_name
         FROM task_labour tl
         LEFT JOIN contractor_workers cw ON cw.id = tl.worker_id AND tl.worker_type = 'labour'
         LEFT JOIN contractors c ON c.id = cw.contractor_id
         LEFT JOIN employees e ON e.id = tl.worker_id AND tl.worker_type = 'company_employee'
         WHERE tl.task_id = ? ORDER BY tl.id ASC\`,
        [update.task_id]
      );
      assignedRows = legacyRows;
    }`;

if (serviceContent.includes(targetAssignedQuery)) {
  serviceContent = serviceContent.replace(targetAssignedQuery, replacementAssignedQuery);
}

// In getById return object: include misc fields and total daily expenses
if (!serviceContent.includes('miscAmount: update.misc_amount')) {
  serviceContent = serviceContent.replace(
    'remarks: update.remarks,',
    `remarks: update.remarks,
    miscAmount: update.misc_amount ? Number(update.misc_amount) : 0,
    miscDescription: update.misc_description,
    miscRemarks: update.misc_remarks,
    totalDailyExpense: Number(
      (
        workers.reduce((s, w) => s + (Number(w.hours_worked || 8) / 8) * Number(w.daily_wage || 0), 0) +
        (update.quantity_used ? Number(update.quantity_used) * Number(material ? material.default_rate || 0 : 0) : 0) +
        Number(update.misc_amount || 0)
      ).toFixed(2)
    ),`
  );
}

// In create function: handle misc_amount expense creation
const targetCreateCall = `  const updateId = await dailyWorkModel.createUpdate({
    project_id: projectId,
    site_id: siteId,
    contractor_id: contractorId,
    task_id: task ? task.id : null,
    phase_number: phaseNumber,
    phase_title: phaseTitle,
    subcategory,
    material_id: materialId,
    quantity_used: quantityUsed > 0 ? quantityUsed : null,
    unit: material ? material.unit : null,
    warehouse_transaction_id: issueTx ? issueTx.id : null,
    expense_id: expenseId,
    work_date: workDate,
    work_done: workDoneText,
    work_status: payload.work_status || 'in-progress',
    progress_percentage: Math.min(100, Math.max(0, Number(payload.progress_percentage || 0))),
    remarks: payload.remarks,
    created_by: userId,
  });`;

const replacementCreateCall = `  // Miscellaneous expense processing
  const miscAmount = payload.misc_amount ? Number(payload.misc_amount) : 0;
  const miscDescription = (payload.misc_description || '').trim();
  const miscRemarks = (payload.misc_remarks || '').trim();

  if (miscAmount > 0) {
    const miscExpenseNumber = \`EXP-MISC-\${Date.now().toString().slice(-4)}\${Math.floor(Math.random() * 900 + 100)}\`;
    await financeModel.createExpense({
      expense_number: miscExpenseNumber,
      project_id: projectId,
      site_id: siteId,
      contractor_id: contractorId,
      task_id: task ? task.id : null,
      category: 'Miscellaneous',
      description: miscDescription || \`Daily misc expense (\${task ? task.name : 'Site'})\`,
      amount: miscAmount,
      expense_date: workDate,
      paid_by: 'Contractor Daily Operational',
      party_name: 'Site Operational Misc',
      payment_method: 'other',
      reference: \`DWU-MISC-\${workDate}\`,
      status: 'approved',
      notes: miscRemarks || null,
      created_by: userId,
    });
  }

  const updateId = await dailyWorkModel.createUpdate({
    project_id: projectId,
    site_id: siteId,
    contractor_id: contractorId,
    task_id: task ? task.id : null,
    phase_number: phaseNumber,
    phase_title: phaseTitle,
    subcategory,
    material_id: materialId,
    quantity_used: quantityUsed > 0 ? quantityUsed : null,
    unit: material ? material.unit : null,
    warehouse_transaction_id: issueTx ? issueTx.id : null,
    expense_id: expenseId,
    work_date: workDate,
    work_done: workDoneText,
    work_status: payload.work_status || 'in-progress',
    progress_percentage: Math.min(100, Math.max(0, Number(payload.progress_percentage || 0))),
    remarks: payload.remarks,
    created_by: userId,
    misc_description: miscDescription || null,
    misc_amount: miscAmount,
    misc_remarks: miscRemarks || null,
  });`;

if (serviceContent.includes(targetCreateCall)) {
  serviceContent = serviceContent.replace(targetCreateCall, replacementCreateCall);
}

fs.writeFileSync('server/src/services/dailyWorkService.js', serviceContent, 'utf8');
console.log('dailyWorkService.js updated');
