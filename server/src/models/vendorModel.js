'use strict';

const { pool } = require('../config/db');

async function findAll({ search = '', status = 'all', page = 1, pageSize = 50 } = {}) {
  const where = [];
  const params = [];

  if (status && status !== 'all') {
    where.push('v.status = ?');
    params.push(status);
  }

  if (search && search.trim()) {
    where.push('(v.name LIKE ? OR v.contact_person LIKE ? OR v.phone LIKE ? OR v.email LIKE ? OR v.gst_number LIKE ?)');
    const q = `%${search.trim()}%`;
    params.push(q, q, q, q, q);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM vendors v ${whereSql}`,
    params
  );
  const total = Number(countRow.total || 0);

  const offset = (Number(page) - 1) * Number(pageSize);
  const [rows] = await pool.query(
    `SELECT v.*,
            (SELECT COUNT(*) FROM procurement_requests pr WHERE pr.vendor_id = v.id) AS procurement_count,
            (SELECT COALESCE(SUM(pr.total_amount), 0) FROM procurement_requests pr WHERE pr.vendor_id = v.id) AS total_procured_amount
     FROM vendors v
     ${whereSql}
     ORDER BY v.name ASC
     LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      contactPerson: r.contact_person,
      phone: r.phone,
      email: r.email,
      gstNumber: r.gst_number,
      panNumber: r.pan_number,
      address: r.address,
      billingAddress: r.billing_address,
      bankName: r.bank_name,
      bankAccountNumber: r.bank_account_number,
      bankIfsc: r.bank_ifsc,
      status: r.status,
      notes: r.notes,
      procurementCount: Number(r.procurement_count || 0),
      totalProcuredAmount: Number(r.total_procured_amount || 0),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total,
    page: Number(page),
    pageSize: Number(pageSize),
  };
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM vendors WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) return null;
  const r = rows[0];

  // Also fetch recent procurement orders from this vendor
  const [procurements] = await pool.query(
    `SELECT pr.*, m.name AS material_name, m.unit AS material_unit, w.name AS warehouse_name
     FROM procurement_requests pr
     JOIN materials m ON m.id = pr.material_id
     LEFT JOIN warehouses w ON w.id = pr.destination_warehouse_id
     WHERE pr.vendor_id = ?
     ORDER BY pr.created_at DESC LIMIT 20`,
    [id]
  );

  return {
    id: r.id,
    name: r.name,
    contactPerson: r.contact_person,
    phone: r.phone,
    email: r.email,
    gstNumber: r.gst_number,
    panNumber: r.pan_number,
    address: r.address,
    billingAddress: r.billing_address,
    bankName: r.bank_name,
    bankAccountNumber: r.bank_account_number,
    bankIfsc: r.bank_ifsc,
    status: r.status,
    notes: r.notes,
    procurements: procurements.map((p) => ({
      id: p.id,
      requestNumber: p.request_number,
      materialName: p.material_name,
      materialUnit: p.material_unit,
      quantity: Number(p.quantity || 0),
      purchaseRate: Number(p.purchase_rate || 0),
      totalAmount: Number(p.total_amount || 0),
      status: p.status,
      warehouseName: p.warehouse_name,
      purchaseDate: p.purchase_date,
      invoiceNumber: p.invoice_number,
      challanNumber: p.challan_number,
    })),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function create(payload) {
  const [res] = await pool.query(
    `INSERT INTO vendors (
      name, contact_person, phone, email, gst_number, pan_number,
      address, billing_address, bank_name, bank_account_number, bank_ifsc,
      status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.name.trim(),
      payload.contact_person ? payload.contact_person.trim() : null,
      payload.phone ? payload.phone.trim() : null,
      payload.email ? payload.email.trim() : null,
      payload.gst_number ? payload.gst_number.trim() : null,
      payload.pan_number ? payload.pan_number.trim() : null,
      payload.address ? payload.address.trim() : null,
      payload.billing_address ? payload.billing_address.trim() : null,
      payload.bank_name ? payload.bank_name.trim() : null,
      payload.bank_account_number ? payload.bank_account_number.trim() : null,
      payload.bank_ifsc ? payload.bank_ifsc.trim() : null,
      payload.status || 'active',
      payload.notes ? payload.notes.trim() : null,
    ]
  );
  return findById(res.insertId);
}

async function update(id, payload) {
  const fields = [];
  const params = [];

  const mapping = {
    name: 'name',
    contactPerson: 'contact_person',
    contact_person: 'contact_person',
    phone: 'phone',
    email: 'email',
    gstNumber: 'gst_number',
    gst_number: 'gst_number',
    panNumber: 'pan_number',
    pan_number: 'pan_number',
    address: 'address',
    billingAddress: 'billing_address',
    billing_address: 'billing_address',
    bankName: 'bank_name',
    bank_name: 'bank_name',
    bankAccountNumber: 'bank_account_number',
    bank_account_number: 'bank_account_number',
    bankIfsc: 'bank_ifsc',
    bank_ifsc: 'bank_ifsc',
    status: 'status',
    notes: 'notes',
  };

  for (const [key, col] of Object.entries(mapping)) {
    if (payload[key] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(payload[key]);
    }
  }

  if (fields.length) {
    params.push(id);
    await pool.query(`UPDATE vendors SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  return findById(id);
}

async function remove(id) {
  const [res] = await pool.query('DELETE FROM vendors WHERE id = ?', [id]);
  return res.affectedRows > 0;
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove,
};
