'use strict';

const ApiError = require('../utils/ApiError');
const clientModel = require('../models/clientModel');
const { pool } = require('../config/db');

function num(v, def = 0) {
  if (v === null || v === undefined) return def;
  const n = Number(v);
  return isNaN(n) ? def : n;
}

async function getClientProjects(clientId) {
  const [rows] = await pool.query(
    `SELECT
       p.id, p.name, p.code, p.start_date, p.expected_completion, p.status,
       COALESCE(p.client_contract_value, p.estimated_budget, 0) AS contract_value,
       COALESCE(p.estimated_budget, 0) AS estimated_budget,
       COALESCE((
         SELECT SUM(dwu.quantity_used * COALESCE(mm.cost_per_unit, pr.purchase_rate, m.default_rate, 0))
         FROM daily_work_updates dwu
         LEFT JOIN materials m ON m.id = dwu.material_id
         LEFT JOIN material_movements mm ON mm.id = dwu.warehouse_transaction_id
         LEFT JOIN procurement_requests pr ON pr.id = mm.procurement_request_id
         WHERE dwu.project_id = p.id AND dwu.quantity_used > 0
       ), 0) + COALESCE((
         SELECT SUM(twl.hours_worked / 8.0 * twl.daily_wage)
         FROM task_worker_logs twl
         WHERE twl.project_id = p.id AND COALESCE(twl.worker_type, 'daily_wage') NOT IN ('company_labour', 'company_employee') AND LOWER(COALESCE(twl.labour_type, '')) NOT LIKE '%company%'
       ), 0) + COALESCE((
         SELECT SUM(dwu.tool_cost) FROM daily_work_updates dwu WHERE dwu.project_id = p.id AND dwu.tool_cost > 0
       ), 0) + COALESCE((
         SELECT SUM(dwu.misc_amount) FROM daily_work_updates dwu WHERE dwu.project_id = p.id AND dwu.misc_amount > 0
       ), 0) + COALESCE((
         SELECT SUM(e.amount) FROM expenses e
         WHERE e.project_id = p.id AND e.status NOT IN ('rejected', 'cancelled')
           AND (e.reference IS NULL OR (e.reference NOT LIKE 'DWU-TOOL-%' AND e.reference NOT LIKE 'DWU-MISC-%'))
       ), 0) AS actual_cost,
       COALESCE((
         SELECT SUM(total_amount) FROM contractor_pos cpo WHERE cpo.project_id = p.id
       ), 0) AS contractor_cost,
       COALESCE((
         SELECT SUM(amount) FROM client_payments cp WHERE cp.project_id = p.id
       ), 0) AS client_payments
     FROM projects p
     WHERE p.client_id = ? AND p.is_archived = 0
     ORDER BY p.id DESC`,
    [clientId]
  );

  return rows.map((r) => {
    const contractValue = Number(num(r.contract_value).toFixed(2));
    const budget = Number(num(r.estimated_budget).toFixed(2));
    const actualCost = Number(num(r.actual_cost).toFixed(2));
    const contractorCost = Number(num(r.contractor_cost).toFixed(2));
    const payments = Number(num(r.client_payments).toFixed(2));
    const dueAmount = Number(Math.max(0, contractValue - payments).toFixed(2));
    const profitLoss = Number((contractValue - actualCost).toFixed(2));

    return {
      id: r.id,
      name: r.name,
      code: r.code,
      startDate: r.start_date,
      expectedCompletion: r.expected_completion,
      status: r.status,
      projectBudget: budget,
      contractValue,
      actualCost,
      contractorCost,
      clientPayments: payments,
      dueAmount,
      profitLoss,
    };
  });
}

function formatClient(r, projects = []) {
  if (!r) return null;
  const projectList = Array.isArray(projects) ? projects : [];
  const totalContractValue = Number(projectList.reduce((s, p) => s + Number(p.contractValue || 0), 0).toFixed(2));
  const totalPaid = Number(projectList.reduce((s, p) => s + Number(p.clientPayments || 0), 0).toFixed(2));
  const totalDue = Number(Math.max(0, totalContractValue - totalPaid).toFixed(2));

  return {
    id: r.id,
    name: r.name,
    clientType: r.client_type || 'Company',
    pan: r.pan,
    gstin: r.gstin,
    cin: r.cin,
    website: r.website,
    status: r.status || 'active',
    contactPerson: r.contact_person,
    email: r.email,
    alternateEmail: r.alternate_email,
    phone: r.phone,
    alternatePhone: r.alternate_phone,
    address: r.address,
    corporateAddress: r.corporate_address || r.address,
    billingAddress: r.billing_address,
    efy: r.efy,
    adherence: r.adherence,
    notes: r.notes,
    projects: projectList,
    projectCount: projectList.length,
    totalContractValue,
    totalPaid,
    totalDue,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function list(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const { rows, total } = await clientModel.findAll({
    search: query.search?.trim(),
    status: query.status?.trim(),
    page,
    pageSize,
  });

  const clients = await Promise.all(
    rows.map(async (row) => {
      const projects = await getClientProjects(row.id);
      return formatClient(row, projects);
    })
  );

  return {
    clients,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id) {
  const client = await clientModel.findById(id);
  if (!client) throw ApiError.notFound('Client not found.');
  const projects = await getClientProjects(id);
  return formatClient(client, projects);
}

async function create(payload) {
  const name = payload.name?.trim();
  const existing = await clientModel.findByName(name);
  if (existing) {
    throw ApiError.badRequest('A client with this name already exists.');
  }

  const corpAddr = (payload.corporateAddress || payload.corporate_address || payload.address || '').trim() || null;
  const billAddr = (payload.billingAddress || payload.billing_address || '').trim() || null;

  const id = await clientModel.create({
    name,
    client_type: (payload.clientType || payload.client_type || 'Company').trim(),
    pan: (payload.pan || '').trim().toUpperCase() || null,
    gstin: (payload.gstin || '').trim().toUpperCase() || null,
    cin: (payload.cin || '').trim().toUpperCase() || null,
    website: (payload.website || '').trim() || null,
    status: (payload.status || 'active').trim().toLowerCase(),
    contact_person: (payload.contactPerson || payload.contact_person || '').trim() || null,
    email: (payload.email || '').trim() || null,
    alternate_email: (payload.alternateEmail || payload.alternate_email || '').trim() || null,
    phone: (payload.phone || '').trim() || null,
    alternate_phone: (payload.alternatePhone || payload.alternate_phone || '').trim() || null,
    corporate_address: corpAddr,
    billing_address: billAddr,
    address: corpAddr,
    efy: (payload.efy || '').trim() || null,
    adherence: (payload.adherence || '').trim() || null,
    notes: (payload.notes || '').trim() || null,
  });
  return getById(id);
}

async function update(id, payload) {
  await getById(id);
  if (payload.name) {
    const existing = await clientModel.findByName(payload.name.trim());
    if (existing && existing.id !== Number(id)) {
      throw ApiError.badRequest('A client with this name already exists.');
    }
  }

  const updateData = {};
  if (payload.name !== undefined) updateData.name = payload.name?.trim();
  if (payload.clientType !== undefined || payload.client_type !== undefined) {
    updateData.client_type = (payload.clientType || payload.client_type || 'Company').trim();
  }
  if (payload.pan !== undefined) updateData.pan = (payload.pan || '').trim().toUpperCase() || null;
  if (payload.gstin !== undefined) updateData.gstin = (payload.gstin || '').trim().toUpperCase() || null;
  if (payload.cin !== undefined) updateData.cin = (payload.cin || '').trim().toUpperCase() || null;
  if (payload.website !== undefined) updateData.website = (payload.website || '').trim() || null;
  if (payload.status !== undefined) updateData.status = (payload.status || 'active').trim().toLowerCase();
  if (payload.contactPerson !== undefined || payload.contact_person !== undefined) {
    updateData.contact_person = (payload.contactPerson || payload.contact_person || '').trim() || null;
  }
  if (payload.email !== undefined) updateData.email = (payload.email || '').trim() || null;
  if (payload.alternateEmail !== undefined || payload.alternate_email !== undefined) {
    updateData.alternate_email = (payload.alternateEmail || payload.alternate_email || '').trim() || null;
  }
  if (payload.phone !== undefined) updateData.phone = (payload.phone || '').trim() || null;
  if (payload.alternatePhone !== undefined || payload.alternate_phone !== undefined) {
    updateData.alternate_phone = (payload.alternatePhone || payload.alternate_phone || '').trim() || null;
  }
  if (payload.corporateAddress !== undefined || payload.corporate_address !== undefined || payload.address !== undefined) {
    const addr = (payload.corporateAddress || payload.corporate_address || payload.address || '').trim() || null;
    updateData.corporate_address = addr;
    updateData.address = addr;
  }
  if (payload.billingAddress !== undefined || payload.billing_address !== undefined) {
    updateData.billing_address = (payload.billingAddress || payload.billing_address || '').trim() || null;
  }
  if (payload.efy !== undefined) updateData.efy = (payload.efy || '').trim() || null;
  if (payload.adherence !== undefined) updateData.adherence = (payload.adherence || '').trim() || null;
  if (payload.notes !== undefined) updateData.notes = (payload.notes || '').trim() || null;

  await clientModel.update(id, updateData);
  return getById(id);
}

async function remove(id) {
  await getById(id);
  await clientModel.remove(id);
  return { success: true };
}

module.exports = { list, getById, create, update, remove, getClientProjects };
