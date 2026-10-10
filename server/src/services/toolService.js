'use strict';

const ApiError = require('../utils/ApiError');
const toolModel = require('../models/toolModel');
const notificationModel = require('../models/notificationModel');
const { ROLES } = require('../config/roles');
const toolUnitService = require('./toolUnitService');

async function list(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 50));
  const { rows, total } = await toolModel.findAll({
    search: query.search?.trim(),
    type: query.type,
    status: query.status,
    page,
    pageSize,
  });

  return {
    tools: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id) {
  const tool = await toolModel.findById(id);
  if (!tool) throw ApiError.notFound('Tool not found.');
  return tool;
}

async function checkAvailability(id, requestedQuantity = 1) {
  const availability = await toolModel.checkAvailability(id, requestedQuantity);
  if (!availability) throw ApiError.notFound('Tool not found.');
  const units = await toolUnitService.availabilityForTool(id);
  return { ...availability, availableUnits: units.availableUnits, maintenanceQuantity: units.maintenance };
}

async function create(payload) {
  const existing = await toolModel.findByName(payload.name.trim());
  if (existing) throw ApiError.badRequest('A tool with this name already exists.');

  const id = await toolModel.create({
    code: payload.code?.trim(),
    name: payload.name.trim(),
    type: payload.type?.trim() || 'Equipment',
    description: payload.description?.trim(),
    status: payload.status || 'active',
    total_quantity: Number(payload.total_quantity || payload.totalQuantity || 1),
    ownership_type: payload.ownership_type || payload.ownershipType || 'owned',
    default_charge_rate: Number(payload.default_charge_rate || payload.defaultChargeRate || 0),
    rental_rate: Number(payload.rental_rate || payload.rentalRate || 0),
  });
  return getById(id);
}

async function update(id, payload) {
  await getById(id);
  if (payload.name) {
    const existing = await toolModel.findByName(payload.name.trim());
    if (existing && existing.id !== Number(id)) {
      throw ApiError.badRequest('A tool with this name already exists.');
    }
  }
  await toolModel.update(id, {
    name: payload.name?.trim(),
    type: payload.type?.trim(),
    description: payload.description !== undefined ? payload.description?.trim() || null : undefined,
    status: payload.status,
    total_quantity: payload.total_quantity !== undefined ? Number(payload.total_quantity) : (payload.totalQuantity !== undefined ? Number(payload.totalQuantity) : undefined),
    ownership_type: payload.ownership_type || payload.ownershipType,
    default_charge_rate: payload.default_charge_rate !== undefined ? Number(payload.default_charge_rate) : (payload.defaultChargeRate !== undefined ? Number(payload.defaultChargeRate) : undefined),
    rental_rate: payload.rental_rate !== undefined ? Number(payload.rental_rate) : (payload.rentalRate !== undefined ? Number(payload.rentalRate) : undefined),
  });
  return getById(id);
}

async function remove(id) {
  await getById(id);
  const units = await toolUnitService.availabilityForTool(id);
  const [[{ n }]] = await require('../config/db').pool.query('SELECT COUNT(*) AS n FROM tool_units WHERE tool_id = ?', [id]);
  if (Number(n) > 0 || units.total > 0) {
    throw ApiError.badRequest('This machine type has registered serial-numbered units and cannot be deleted. Retire the units instead.');
  }
  await toolModel.remove(id);
  return { success: true };
}

/**
 * `POST /tools/:id/allocate`.
 *   Admin     : allocates a SPECIFIC serial (unit_id) directly.
 *   Others    : never allocate directly. The call raises a machine request for
 *               Admin (notification listing who currently holds each serial)
 *               - an unavailable machine is never auto-approved.
 */
async function allocate(payload, user, hrScope) {
  const toolId = Number(payload.tool_id || payload.toolId);
  const tool = await getById(toolId);

  if (user?.role === ROLES.ADMIN) {
    if (!payload.unit_id && !payload.unitId) {
      throw ApiError.badRequest('Check the highlighted fields.', { unit_id: 'Select the serial number to allocate.' });
    }
    const allocation = await toolUnitService.allocate({ ...payload, unit_id: payload.unit_id || payload.unitId }, user);
    return { status: 'allocated', allocation };
  }

  const availability = await toolUnitService.availabilityForTool(toolId);
  const holders = (availability.holders || [])
    .map((h) => `${h.serialNumber} - ${h.contractor?.name || 'unassigned'}${h.project ? ` at ${h.project.name}${h.site ? ` (${h.site.name})` : ''}` : ''}`)
    .join('; ');
  await notificationModel.create({
    role: 'admin',
    title: `Machine request: ${tool.name}`,
    message: `${user?.name || user?.email || 'A user'} requested ${tool.name}. ${availability.available} of ${availability.total} unit(s) free.${holders ? ` Currently with: ${holders}.` : ''} Admin must approve and choose the serial.`,
    type: availability.available ? 'info' : 'warning',
    category: 'procurement',
    actionUrl: '/admin/procurement',
  }).catch(() => {});
  return {
    status: 'pending_approval',
    message: availability.available
      ? 'Request sent to Admin, who will choose the serial number to allocate.'
      : 'No unit is currently free. Admin has been notified with the current holders and can approve, reject or reassign a unit.',
    availability,
  };
}

async function returnTool(allocationId, payload, user, hrScope) {
  return toolUnitService.returnAllocation(Number(allocationId), payload || {}, user, hrScope);
}

module.exports = {
  list,
  getById,
  checkAvailability,
  create,
  update,
  remove,
  allocate,
  returnTool,
};
