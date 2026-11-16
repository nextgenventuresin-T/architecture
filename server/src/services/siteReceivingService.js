'use strict';

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const siteReceiver = require('./siteReceiverScope');
const materialMovementService = require('./materialMovementService');
const procurementService = require('./procurementService');

/**
 * MATERIAL RECEIVING BY SITE ENGINEERS AND PROJECT MANAGERS.
 *
 * A thin layer over the receive code every other role already uses - nothing here
 * posts stock itself:
 *   - in-transit shipments (Admin's Central Warehouse -> Site dispatches, and anything
 *     sent to a PM-run Site Store) -> materialMovementService.receiveMaterial
 *   - vendor orders Admin placed for delivery to the site -> procurementService.receive
 * Both re-check, inside their own row-locked transaction, that this viewer may receive
 * at that site, that the vehicle matches the dispatch, and that the quantity does not
 * exceed what was sent / what remains - so a receipt can never be duplicated, over-
 * received or posted by someone outside the site.
 */

async function requireSites(hrScope) {
  if (!siteReceiver.isSiteReceiverRole(hrScope)) {
    throw ApiError.forbidden('Only Site Engineers and Project Managers use this screen.');
  }
  return siteReceiver.receiverSiteIds(hrScope);
}

/** Vendor orders on their way to one of these sites, with what is still to arrive. */
async function pendingVendorOrders(siteIds) {
  if (!siteIds.length) return [];
  const [rows] = await pool.query(
    `SELECT r.id, r.request_number, r.po_number, r.status, r.unit, r.quantity, r.ordered_quantity,
            r.vehicle_number, r.bilty_number, r.vendor_confirmed_at, r.driver_name, r.driver_phone, r.challan_number, r.order_date, r.expected_delivery_date,
            r.supplier, v.name AS vendor_name, m.name AS material_name,
            p.id AS project_id, p.name AS project_name, s.id AS site_id, s.name AS site_name,
            t.name AS task_name,
            COALESCE((SELECT SUM(rc.received_quantity) FROM procurement_receipts rc WHERE rc.procurement_request_id = r.id), 0) AS received_total
       FROM procurement_requests r
       JOIN materials m ON m.id = r.material_id
       LEFT JOIN vendors v ON v.id = r.vendor_id
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN sites s ON s.id = COALESCE(r.destination_site_id, r.site_id)
       LEFT JOIN project_tasks t ON t.id = r.task_id
      WHERE r.source_type = 'supplier'
        AND COALESCE(r.procurement_kind, 'project_site') <> 'central_purchase'
        AND COALESCE(r.item_type, 'material') = 'material'
        AND r.status IN ('ordered', 'partially_received')
        AND COALESCE(r.destination_site_id, r.site_id) IN (?)
      ORDER BY r.order_date DESC, r.id DESC`,
    [siteIds]
  );
  return rows.map((r) => {
    const ordered = Number(r.ordered_quantity ?? r.quantity);
    const received = Number(r.received_total || 0);
    return {
      kind: 'vendor_order',
      id: r.id,
      reference: r.po_number || r.request_number,
      requestNumber: r.request_number,
      material: r.material_name,
      unit: r.unit,
      sentQuantity: ordered,
      receivedQuantity: received,
      remainingQuantity: Number(Math.max(0, ordered - received).toFixed(2)),
      // The number itself is not sent: the receiver must read it off the Bilty / AWB
      // (or, for older deliveries, the arriving truck).
      verifyBy: String(r.bilty_number || '').trim() ? 'bilty' : 'vehicle',
      vehicleRecorded: Boolean(String(r.bilty_number || '').trim() || (r.vendor_confirmed_at && String(r.vehicle_number || '').trim())),
      driverName: r.driver_name || null,
      driverPhone: r.driver_phone || null,
      challanNumber: r.challan_number || null,
      source: r.vendor_name || r.supplier || 'Vendor',
      project: r.project_id ? { id: r.project_id, name: r.project_name } : null,
      site: r.site_id ? { id: r.site_id, name: r.site_name } : null,
      task: r.task_name || null,
      dispatchDate: r.order_date,
      expectedDate: r.expected_delivery_date || null,
      status: r.status,
    };
  });
}

/** Everything waiting to be received at the viewer's sites. */
async function listIncoming(hrScope) {
  const siteIds = await requireSites(hrScope);
  if (!siteIds.length) return { sites: [], deliveries: [] };
  const [movements, orders, [sites]] = await Promise.all([
    materialMovementService.listIncoming(hrScope),
    pendingVendorOrders(siteIds),
    pool.query(
      `SELECT s.id, s.name, p.id AS project_id, p.name AS project_name
         FROM sites s JOIN projects p ON p.id = s.project_id WHERE s.id IN (?) ORDER BY p.name, s.name`,
      [siteIds]
    ),
  ]);
  const shipments = movements
    .filter((m) => m.status === 'in_transit' && m.itemType === 'material')
    .map((m) => ({
      kind: 'movement',
      id: m.id,
      reference: m.movementNumber,
      requestNumber: m.procurement?.requestNumber || null,
      material: m.material?.name || null,
      unit: m.unit,
      sentQuantity: m.sentQuantity,
      receivedQuantity: 0,
      remainingQuantity: m.sentQuantity,
      vehicleRecorded: Boolean(String(m.vehicleNumber || '').trim()),
      driverName: m.driverName,
      driverPhone: m.driverPhone,
      challanNumber: null,
      source: m.source?.contractorName || m.source?.warehouseName || 'Central Warehouse',
      destination: m.destination?.contractorName || m.destination?.warehouseName || null,
      project: m.project,
      site: m.site,
      task: m.task?.name || null,
      dispatchDate: m.dispatchDate,
      expectedDate: null,
      status: m.status,
    }));
  return {
    sites: sites.map((s) => ({ id: s.id, name: s.name, project: { id: s.project_id, name: s.project_name } })),
    deliveries: [...shipments, ...orders],
  };
}

/** Confirm an in-transit shipment (vehicle verified, quantity <= sent). */
async function receiveShipment(id, payload, hrScope, userId) {
  await requireSites(hrScope);
  const m = await materialMovementService.receiveMaterial(id, {
    vehicle_number: payload.vehicle_number,
    received_quantity: payload.received_quantity,
    received_litres: payload.received_litres,
    receiving_date: payload.receiving_date,
  }, hrScope, userId);
  // Only what the receiver needs back - no costs.
  return {
    kind: 'movement', id: m.id, reference: m.movementNumber, status: m.status,
    material: m.material?.name || null, unit: m.unit,
    sentQuantity: m.sentQuantity, receivedQuantity: m.receivedQuantity, vehicleNumber: m.receivedVehicleNumber,
  };
}

/** Record a delivery against a vendor order (vehicle verified, quantity <= remaining). */
async function receiveVendorOrder(id, payload, hrScope, userId) {
  await requireSites(hrScope);
  const { request: r } = await procurementService.receive(id, {
    received_quantity: payload.received_quantity,
    receiving_date: payload.receiving_date,
    vehicle_number: payload.vehicle_number,
    bilty_number: payload.bilty_number,
    notes: payload.notes,
  }, userId, hrScope, { useQuotedTransport: false });
  return {
    kind: 'vendor_order', id: r.id, reference: r.purchaseOrder?.poNumber || r.requestNumber, status: r.status,
    material: r.material?.name || null, unit: r.unit,
    receivedQuantity: r.receiving?.receivedQuantity ?? null, remainingQuantity: r.receiving?.remainingQuantity ?? null,
  };
}

module.exports = { listIncoming, receiveShipment, receiveVendorOrder };
