'use strict';

const { pool } = require('../config/db');

const PO_SELECT = `
  SELECT
    cpo.id, cpo.po_number, cpo.contractor_id, cpo.project_id, cpo.site_id,
    cpo.po_date, cpo.validity_date, cpo.work_description,
    cpo.total_amount, cpo.advance_amount, cpo.material_amount, cpo.labour_amount,
    cpo.payment_terms, cpo.terms_conditions, cpo.status, cpo.rejection_reason,
    cpo.pdf_path, cpo.signed_pdf_path,
    cpo.contractor_signature_path, cpo.contractor_signed_name, cpo.contractor_signed_at,
    cpo.company_signature_path, cpo.company_signed_name, cpo.company_signed_designation, cpo.company_signed_at,
    cpo.created_by, cpo.created_at, cpo.updated_at,
    c.name AS contractor_name, c.contact_person AS contractor_contact_person,
    c.phone AS contractor_phone, c.email AS contractor_email, c.address AS contractor_address,
    p.name AS project_name, p.code AS project_code, p.location AS project_location,
    s.name AS site_name, s.address AS site_address,
    u.full_name AS created_by_name
  FROM contractor_pos cpo
  JOIN contractors c ON c.id = cpo.contractor_id
  JOIN projects p ON p.id = cpo.project_id
  LEFT JOIN sites s ON s.id = cpo.site_id
  LEFT JOIN users u ON u.id = cpo.created_by
`;

async function nextPoNumber() {
  const [rows] = await pool.query(
    `SELECT GREATEST(
       COALESCE(MAX(CASE WHEN po_number REGEXP '^CPO-[0-9]+$'
                         THEN CAST(SUBSTRING(po_number, 5) AS UNSIGNED) END), 1000),
       1000
     ) AS max_num
     FROM contractor_pos`
  );
  const next = Number(rows[0]?.max_num || 1000) + 1;
  return `CPO-${next}`;
}

async function findAll({ contractorId, projectId, siteId, status, search, page = 1, pageSize = 20 } = {}) {
  const where = [];
  const params = [];

  if (contractorId && contractorId !== 'all') {
    where.push('cpo.contractor_id = ?');
    params.push(Number(contractorId));
  }
  if (projectId && projectId !== 'all') {
    where.push('cpo.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId && siteId !== 'all') {
    where.push('cpo.site_id = ?');
    params.push(Number(siteId));
  }
  if (status && status !== 'all') {
    where.push('cpo.status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(cpo.po_number LIKE ? OR c.name LIKE ? OR p.name LIKE ? OR cpo.work_description LIKE ?)');
    params.push(...Array(4).fill(`%${search}%`));
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${PO_SELECT} ${whereSql} ORDER BY cpo.id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM contractor_pos cpo
     JOIN contractors c ON c.id = cpo.contractor_id
     JOIN projects p ON p.id = cpo.project_id
     ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id) {
  const [rows] = await pool.query(`${PO_SELECT} WHERE cpo.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findByPoNumber(poNumber) {
  const [rows] = await pool.query(`${PO_SELECT} WHERE cpo.po_number = ? LIMIT 1`, [poNumber]);
  return rows[0] || null;
}

async function findMilestones(poId) {
  const [rows] = await pool.query(
    `SELECT * FROM contractor_po_milestones WHERE po_id = ? ORDER BY sort_order ASC, id ASC`,
    [poId]
  );
  return rows;
}

async function findMilestonesForPoIds(poIds) {
  if (!Array.isArray(poIds) || poIds.length === 0) return {};
  const cleanIds = poIds.filter(Boolean);
  if (cleanIds.length === 0) return {};
  const [rows] = await pool.query(
    `SELECT * FROM contractor_po_milestones WHERE po_id IN (?) ORDER BY sort_order ASC, id ASC`,
    [cleanIds]
  );
  const byPoId = {};
  for (const row of rows) {
    if (!byPoId[row.po_id]) byPoId[row.po_id] = [];
    byPoId[row.po_id].push(row);
  }
  return byPoId;
}

async function create(payload, milestones = []) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const poNumber = payload.po_number || (await nextPoNumber());

    const [result] = await conn.query(
      `INSERT INTO contractor_pos
       (po_number, contractor_id, project_id, site_id, po_date, validity_date,
        work_description, total_amount, advance_amount, material_amount, labour_amount,
        payment_terms, terms_conditions, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        poNumber,
        payload.contractor_id,
        payload.project_id,
        payload.site_id || null,
        payload.po_date,
        payload.validity_date || null,
        payload.work_description || null,
        Number(payload.total_amount || 0),
        Number(payload.advance_amount || 0),
        Number(payload.material_amount || 0),
        Number(payload.labour_amount || 0),
        payload.payment_terms || null,
        typeof payload.terms_conditions === 'object' ? JSON.stringify(payload.terms_conditions) : (payload.terms_conditions || null),
        payload.status || 'draft',
        payload.created_by || null,
      ]
    );

    const poId = result.insertId;

    if (Array.isArray(milestones) && milestones.length > 0) {
      const milestoneValues = milestones.map((m, idx) => [
        poId,
        m.milestone_name || m.name || `Milestone ${idx + 1}`,
        Number(m.percentage || 0),
        Number(m.amount || 0),
        m.condition_trigger || m.trigger || null,
        m.status || 'pending',
        m.completed_at || null,
        m.remarks || null,
        idx + 1,
      ]);

      await conn.query(
        `INSERT INTO contractor_po_milestones
         (po_id, milestone_name, percentage, amount, condition_trigger, status, completed_at, remarks, sort_order)
         VALUES ?`,
        [milestoneValues]
      );
    }

    // Connect to existing contractor_payments table (Requirement 17)
    // Upsert contractor_payments record if not exists
    const [existingCp] = await conn.query(
      `SELECT id, contract_value FROM contractor_payments
       WHERE contractor_id = ? AND project_id = ? ${payload.site_id ? 'AND site_id = ?' : ''} LIMIT 1`,
      payload.site_id ? [payload.contractor_id, payload.project_id, payload.site_id] : [payload.contractor_id, payload.project_id]
    );

    if (existingCp.length === 0) {
      await conn.query(
        `INSERT INTO contractor_payments
         (project_id, contractor_id, site_id, contract_value, paid_amount, payment_status, notes)
         VALUES (?, ?, ?, ?, 0.00, 'pending', ?)`,
        [
          payload.project_id,
          payload.contractor_id,
          payload.site_id || null,
          Number(payload.total_amount || 0),
          `Created via PO ${poNumber}`,
        ]
      );
    }

    await conn.commit();
    return poId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function update(id, payload, milestones = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const allowed = [
      'project_id', 'site_id', 'po_date', 'validity_date', 'work_description',
      'total_amount', 'advance_amount', 'material_amount', 'labour_amount',
      'payment_terms', 'terms_conditions', 'pdf_path', 'signed_pdf_path',
    ];

    const updates = {};
    for (const key of allowed) {
      if (payload[key] !== undefined) {
        if (key === 'terms_conditions' && typeof payload[key] === 'object') {
          updates[key] = JSON.stringify(payload[key]);
        } else {
          updates[key] = payload[key];
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await conn.query(
        `UPDATE contractor_pos SET ${Object.keys(updates).map((k) => `\`${k}\` = ?`).join(', ')} WHERE id = ?`,
        [...Object.values(updates), id]
      );
    }

    if (Array.isArray(milestones)) {
      await conn.query('DELETE FROM contractor_po_milestones WHERE po_id = ?', [id]);
      if (milestones.length > 0) {
        const milestoneValues = milestones.map((m, idx) => [
          id,
          m.milestone_name || m.name || `Milestone ${idx + 1}`,
          Number(m.percentage || 0),
          Number(m.amount || 0),
          m.condition_trigger || m.trigger || null,
          m.status || 'pending',
          m.completed_at || null,
          m.remarks || null,
          idx + 1,
        ]);

        await conn.query(
          `INSERT INTO contractor_po_milestones
           (po_id, milestone_name, percentage, amount, condition_trigger, status, completed_at, remarks, sort_order)
           VALUES ?`,
          [milestoneValues]
        );
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateStatus(id, status, extra = {}) {
  const fields = ['status = ?'];
  const params = [status];

  if (extra.rejection_reason !== undefined) {
    fields.push('rejection_reason = ?');
    params.push(extra.rejection_reason);
  }
  if (extra.pdf_path !== undefined) {
    fields.push('pdf_path = ?');
    params.push(extra.pdf_path);
  }
  if (extra.signed_pdf_path !== undefined) {
    fields.push('signed_pdf_path = ?');
    params.push(extra.signed_pdf_path);
  }

  params.push(id);
  await pool.query(`UPDATE contractor_pos SET ${fields.join(', ')} WHERE id = ?`, params);
}

async function saveContractorSignature(id, { signaturePath, signerName, signedAt }) {
  await pool.query(
    `UPDATE contractor_pos
     SET contractor_signature_path = ?,
         contractor_signed_name = ?,
         contractor_signed_at = ?,
         status = 'contractor_signed'
     WHERE id = ?`,
    [signaturePath, signerName, signedAt || new Date(), id]
  );
}

async function saveCompanySignature(id, { signaturePath, signerName, designation, signedAt, signedPdfPath }) {
  await pool.query(
    `UPDATE contractor_pos
     SET company_signature_path = ?,
         company_signed_name = ?,
         company_signed_designation = ?,
         company_signed_at = ?,
         signed_pdf_path = COALESCE(?, signed_pdf_path),
         status = 'contract_signed'
     WHERE id = ?`,
    [signaturePath, signerName, designation || 'Project Director', signedAt || new Date(), signedPdfPath || null, id]
  );
}

async function updateMilestoneStatus(milestoneId, status, { completedAt = null, remarks = null } = {}) {
  await pool.query(
    `UPDATE contractor_po_milestones
     SET status = ?, completed_at = ?, remarks = COALESCE(?, remarks)
     WHERE id = ?`,
    [status, status === 'completed' ? (completedAt || new Date()) : null, remarks, milestoneId]
  );
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM contractor_pos WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

/**
 * Real Finance Integration Summary (Requirement 17):
 * Connects actual contractor_payments and expenses to compute:
 * - total_po_value
 * - advance_paid
 * - released_amount (actual amount paid in finance ledger)
 * - pending_amount = total_po_value - released_amount
 * - amount_due = (sum of completed milestones + advance) - released_amount
 * - milestones_completed_count & milestones_pending_count
 */
async function findFinancialSummary(contractorId) {
  // 1. PO Totals & Milestone progress
  const [poRows] = await pool.query(
    `SELECT
       COUNT(*) AS total_pos,
       COALESCE(SUM(CASE WHEN status NOT IN ('cancelled', 'rejected') THEN total_amount ELSE 0 END), 0) AS total_po_value,
       COALESCE(SUM(CASE WHEN status NOT IN ('cancelled', 'rejected') THEN advance_amount ELSE 0 END), 0) AS total_advance_agreed,
       COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS draft_pos,
       COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) AS sent_pos,
       COALESCE(SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END), 0) AS accepted_pos,
       COALESCE(SUM(CASE WHEN status = 'contractor_signed' THEN 1 ELSE 0 END), 0) AS contractor_signed_pos,
       COALESCE(SUM(CASE WHEN status = 'contract_signed' THEN 1 ELSE 0 END), 0) AS signed_contracts_count
     FROM contractor_pos
     WHERE contractor_id = ?`,
    [contractorId]
  );

  // 2. Milestones progress
  const [msRows] = await pool.query(
    `SELECT
       COUNT(*) AS total_milestones,
       COALESCE(SUM(CASE WHEN m.status = 'completed' THEN 1 ELSE 0 END), 0) AS milestones_completed,
       COALESCE(SUM(CASE WHEN m.status = 'pending' THEN 1 ELSE 0 END), 0) AS milestones_pending,
       COALESCE(SUM(CASE WHEN m.status = 'completed' THEN m.amount ELSE 0 END), 0) AS completed_milestones_amount
     FROM contractor_po_milestones m
     JOIN contractor_pos p ON p.id = m.po_id
     WHERE p.contractor_id = ? AND p.status NOT IN ('cancelled', 'rejected')`,
    [contractorId]
  );

  // 3. Actual Real Payments from contractor_payments (Finance Ledger)
  const [cpRows] = await pool.query(
    `SELECT
       COALESCE(SUM(paid_amount), 0) AS actual_released_amount,
       COALESCE(SUM(contract_value), 0) AS finance_contract_value
     FROM contractor_payments
     WHERE contractor_id = ?`,
    [contractorId]
  );

  // 4. Actual Advance Payments from expenses ledger (Category = contractor / advance)
  const [expRows] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'paid' AND (description LIKE '%advance%' OR notes LIKE '%advance%') THEN amount ELSE 0 END), 0) AS advance_paid_expense,
       COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS total_contractor_expenses_paid
     FROM expenses
     WHERE contractor_id = ? AND status = 'paid'`,
    [contractorId]
  );

  const poSummary = poRows[0] || {};
  const msSummary = msRows[0] || {};
  const cpSummary = cpRows[0] || {};
  const expSummary = expRows[0] || {};

  const totalPoValue = Number(poSummary.total_po_value || 0);
  // Released is the actual settled money recorded in contractor_payments (or paid expenses)
  const releasedAmount = Math.max(Number(cpSummary.actual_released_amount || 0), Number(expSummary.total_contractor_expenses_paid || 0));
  const advanceAgreed = Number(poSummary.total_advance_agreed || 0);
  const advancePaid = Math.min(advanceAgreed, Math.max(Number(expSummary.advance_paid_expense || 0), releasedAmount > 0 ? advanceAgreed : 0));
  const pendingAmount = Math.max(0, totalPoValue - releasedAmount);

  // Amount Due = (completed milestone amount + advance) - released
  const completedMilestoneAmount = Number(msSummary.completed_milestones_amount || 0);
  const eligibleAmount = completedMilestoneAmount + advanceAgreed;
  const amountDue = Math.max(0, eligibleAmount - releasedAmount);

  const paymentProgress = totalPoValue > 0 ? Math.min(100, Math.round((releasedAmount / totalPoValue) * 100)) : 0;

  return {
    totalPoValue,
    advanceAgreed,
    advancePaid,
    totalAdvancePaid: advancePaid,
    releasedAmount,
    totalReleased: releasedAmount,
    pendingAmount,
    totalPending: pendingAmount,
    amountDue,
    totalDue: amountDue,
    paymentProgress,
    totalPos: Number(poSummary.total_pos || 0),
    draftPos: Number(poSummary.draft_pos || 0),
    sentPos: Number(poSummary.sent_pos || 0),
    acceptedPos: Number(poSummary.accepted_pos || 0),
    contractorSignedPos: Number(poSummary.contractor_signed_pos || 0),
    signedContractsCount: Number(poSummary.signed_contracts_count || 0),
    activePosCount: Number(poSummary.total_pos || 0) - Number(poSummary.draft_pos || 0),
    totalMilestones: Number(msSummary.total_milestones || 0),
    milestonesCompleted: Number(msSummary.milestones_completed || 0),
    completedMilestones: Number(msSummary.milestones_completed || 0),
    milestonesPending: Number(msSummary.milestones_pending || 0),
  };
}

module.exports = {
  nextPoNumber,
  findAll,
  findById,
  findByPoNumber,
  findMilestones,
  findMilestonesForPoIds,
  create,
  update,
  updateStatus,
  saveContractorSignature,
  saveCompanySignature,
  updateMilestoneStatus,
  remove,
  findFinancialSummary,
};
