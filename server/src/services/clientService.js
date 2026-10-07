'use strict';

const ApiError = require('../utils/ApiError');
const clientModel = require('../models/clientModel');

function formatClient(r) {
  if (!r) return null;
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

  return {
    clients: rows.map(formatClient),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id) {
  const client = await clientModel.findById(id);
  if (!client) throw ApiError.notFound('Client not found.');
  return formatClient(client);
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

module.exports = { list, getById, create, update, remove };
