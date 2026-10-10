'use strict';

const { pool } = require('../config/db');
const { ROLES } = require('../config/roles');
const employeeModel = require('../models/employeeModel');

/**
 * Resolves project IDs accessible by the current Project Manager.
 * Returns null if user is admin or unrestricted (i.e. access to all projects).
 */
async function resolvePmProjectIds(userId, role) {
  if (role === ROLES.ADMIN) return null;

  const projectIds = new Set();

  // 1. Check if user is linked to an employee record assigned as project_manager_id
  try {
    const employee = await employeeModel.findByUserId(userId);
    if (employee?.id) {
      const [pmProjects] = await pool.query(
        'SELECT id FROM projects WHERE project_manager_id = ? AND is_archived = 0',
        [employee.id]
      );
      pmProjects.forEach((p) => projectIds.add(p.id));
    }
  } catch (_) {}

  // 2. Check user_project_access table
  try {
    const [upa] = await pool.query(
      'SELECT project_id FROM user_project_access WHERE user_id = ?',
      [userId]
    );
    upa.forEach((u) => projectIds.add(u.project_id));
  } catch (_) {}

  if (projectIds.size === 0) {
    // A Project Manager with no assigned project sees nothing (deny-by-default).
    // [-1] matches no project id, so every IN (...) filter below returns no rows.
    return [-1];
  }

  return Array.from(projectIds);
}

/**
 * Generates project filter SQL condition and parameters.
 */
function buildProjectFilter(projectIds, tableAlias = 'p') {
  if (!projectIds || projectIds.length === 0) {
    return { clause: '1=1', params: [] };
  }
  return {
    clause: `${tableAlias}.id IN (${projectIds.map(() => '?').join(',')})`,
    params: projectIds,
  };
}

/**
 * PM Dashboard:
 * Summary KPIs, Upcoming Site Deadlines, Site Requirements & Pending Needs,
 * Contractors Summary, and Recent Site Work Updates.
 */
async function getDashboard(userId, role) {
  const projectIds = await resolvePmProjectIds(userId, role);

  let projWhere = 'p.is_archived = 0';
  const projParams = [];
  if (projectIds && projectIds.length > 0) {
    projWhere += ` AND p.id IN (${projectIds.map(() => '?').join(',')})`;
    projParams.push(...projectIds);
  }

  // 1. Projects Count & Overview
  const [projects] = await pool.query(
    `SELECT p.id, p.code, p.name, p.status, p.progress, p.expected_completion,
            p.estimated_budget, p.start_date,
            c.name AS client_name, ct.name AS contractor_name
     FROM projects p
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN contractors ct ON ct.id = p.contractor_id
     WHERE ${projWhere}
     ORDER BY p.expected_completion ASC`,
    projParams
  );

  const projectsCount = projects.length;
  const pIds = projects.map((p) => p.id);

  if (pIds.length === 0) {
    return {
      metrics: {
        projectsCount: 0,
        sitesCount: 0,
        contractorsCount: 0,
        todayWorkersCount: 0,
        totalProcuredAmount: 0,
        pendingRequirementsCount: 0,
      },
      upcomingDeadlines: [],
      siteRequirements: [],
      contractorsSummary: [],
      recentWorkUpdates: [],
    };
  }

  // 2. Sites under these projects
  const [sites] = await pool.query(
    `SELECT s.id, s.name, s.project_id, s.status, s.progress, s.contractor_id,
            p.name AS project_name, p.code AS project_code, p.current_phase,
            p.expected_completion,
            ct.name AS contractor_name, ct.phone AS contractor_phone
     FROM sites s
     JOIN projects p ON p.id = s.project_id
     LEFT JOIN contractors ct ON ct.id = s.contractor_id
     WHERE s.project_id IN (${pIds.map(() => '?').join(',')})
     ORDER BY p.expected_completion ASC, s.id ASC`,
    pIds
  );

  const sitesCount = sites.length;

  // 3. Distinct Contractors handling these sites / projects
  const contractorMap = new Map();
  sites.forEach((s) => {
    if (s.contractor_id) {
      if (!contractorMap.has(s.contractor_id)) {
        contractorMap.set(s.contractor_id, {
          id: s.contractor_id,
          name: s.contractor_name || 'Contractor',
          phone: s.contractor_phone || '',
          sites: [],
        });
      }
      contractorMap.get(s.contractor_id).sites.push({
        id: s.id,
        name: s.name,
        projectName: s.project_name,
      });
    }
  });

  // 4. Calculate Upcoming Deadlines for Sites & Projects
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingDeadlines = [];

  // Add site deadlines
  sites.forEach((s) => {
    const deadlineDate = s.expected_completion;
    if (deadlineDate && s.status !== 'completed') {
      const target = new Date(deadlineDate);
      target.setHours(0, 0, 0, 0);
      const diffTime = target.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let urgency = 'normal';
      if (daysRemaining < 0) urgency = 'overdue';
      else if (daysRemaining <= 3) urgency = 'critical';
      else if (daysRemaining <= 10) urgency = 'urgent';

      upcomingDeadlines.push({
        type: 'site',
        id: s.id,
        name: s.name,
        projectId: s.project_id,
        projectName: s.project_name,
        projectCode: s.project_code,
        contractorName: s.contractor_name || 'Unassigned',
        currentPhase: s.current_phase || 'Execution',
        progress: Number(s.progress || 0),
        status: s.status,
        deadline: deadlineDate,
        daysRemaining,
        urgency,
      });
    }
  });

  // Add project deadlines
  projects.forEach((p) => {
    if (p.expected_completion && p.status !== 'completed') {
      const target = new Date(p.expected_completion);
      target.setHours(0, 0, 0, 0);
      const diffTime = target.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let urgency = 'normal';
      if (daysRemaining < 0) urgency = 'overdue';
      else if (daysRemaining <= 3) urgency = 'critical';
      else if (daysRemaining <= 10) urgency = 'urgent';

      upcomingDeadlines.push({
        type: 'project',
        id: p.id,
        name: p.name,
        projectId: p.id,
        projectName: p.name,
        projectCode: p.code,
        contractorName: p.contractor_name || 'Various',
        currentPhase: 'Overall Project',
        progress: Number(p.progress || 0),
        status: p.status,
        deadline: p.expected_completion,
        daysRemaining,
        urgency,
      });
    }
  });

  upcomingDeadlines.sort((a, b) => a.daysRemaining - b.daysRemaining);

  // 5. Site Requirements & Pending Needs (Contractor Procurement requests waiting)
  const [procurementReqs] = await pool.query(
    `SELECT pr.id, pr.request_number, pr.material_id, pr.quantity, pr.unit,
            pr.estimated_rate, pr.purchase_rate, pr.total_amount, pr.status, pr.priority,
            pr.procurement_kind, pr.source_type, pr.required_date, pr.created_at,
            m.name AS material_name, m.category AS material_category,
            p.name AS project_name, s.name AS site_name,
            COALESCE(ct.name, u.full_name, 'Contractor') AS requested_by_name
     FROM procurement_requests pr
     LEFT JOIN materials m ON m.id = pr.material_id
     LEFT JOIN projects p ON p.id = pr.project_id
     LEFT JOIN sites s ON s.id = pr.site_id
     LEFT JOIN users u ON u.id = pr.requested_by
     LEFT JOIN contractors ct ON ct.id = pr.source_contractor_id OR ct.id = pr.destination_contractor_id
     WHERE pr.project_id IN (${pIds.map(() => '?').join(',')})
       AND pr.status IN ('requested', 'approved', 'ordered', 'in_transit')
     ORDER BY (pr.status = 'requested') DESC, pr.id DESC
     LIMIT 15`,
    pIds
  );

  const pendingRequirementsCount = procurementReqs.filter((r) =>
    ['requested', 'approved', 'ordered'].includes(r.status)
  ).length;

  // 6. Total Procured Amount across PM's projects
  const [procTotal] = await pool.query(
    `SELECT COALESCE(SUM(COALESCE(total_amount, quantity * COALESCE(purchase_rate, estimated_rate, 0))), 0) AS total_procured
     FROM procurement_requests
     WHERE project_id IN (${pIds.map(() => '?').join(',')})
       AND status IN ('ordered', 'received')`,
    pIds
  );
  const totalProcuredAmount = Number(procTotal[0]?.total_procured || 0);

  // 7. Today's active labour on PM's sites
  const todayStr = today.toISOString().slice(0, 10);
  let todayWorkersCount = 0;
  try {
    const [attRows] = await pool.query(
      `SELECT COUNT(DISTINCT ar.worker_id) AS cnt
       FROM attendance_records ar
       WHERE ar.date = ? AND ar.status = 'present'
         AND (ar.project_id IN (${pIds.map(() => '?').join(',')}))`,
      [todayStr, ...pIds]
    );
    todayWorkersCount = Number(attRows[0]?.cnt || 0);
  } catch (_) {}

  // 8. Recent Daily Work Updates from Contractors
  let recentWorkUpdates = [];
  try {
    const [dwRows] = await pool.query(
      `SELECT dw.id, dw.project_id, dw.site_id, dw.work_date, dw.progress_percentage,
              dw.work_done, dw.work_status, dw.created_at,
              p.name AS project_name, p.code AS project_code,
              s.name AS site_name,
              ct.name AS contractor_name,
              (SELECT COUNT(*) FROM daily_work_photos WHERE work_update_id = dw.id) AS photo_count,
              (SELECT COUNT(*) FROM task_worker_logs WHERE daily_work_id = dw.id) AS worker_count
       FROM daily_work_updates dw
       JOIN projects p ON p.id = dw.project_id
       LEFT JOIN sites s ON s.id = dw.site_id
       LEFT JOIN contractors ct ON ct.id = dw.contractor_id
       WHERE dw.project_id IN (${pIds.map(() => '?').join(',')})
       ORDER BY dw.work_date DESC, dw.id DESC
       LIMIT 8`,
      pIds
    );
    recentWorkUpdates = dwRows;
  } catch (_) {}

  // 9. Contractor summaries with total procurement and worker count
  const contractorsSummary = Array.from(contractorMap.values()).map((c) => ({
    ...c,
    siteCount: c.sites.length,
  }));

  return {
    metrics: {
      projectsCount,
      sitesCount,
      contractorsCount: contractorMap.size,
      todayWorkersCount,
      totalProcuredAmount,
      pendingRequirementsCount,
    },
    upcomingDeadlines: upcomingDeadlines.slice(0, 10),
    siteRequirements: procurementReqs,
    contractorsSummary,
    recentWorkUpdates,
  };
}

/**
 * Projects and Sites detailed view for PM
 */
async function getProjects(userId, role) {
  const projectIds = await resolvePmProjectIds(userId, role);

  let projWhere = 'p.is_archived = 0';
  const projParams = [];
  if (projectIds && projectIds.length > 0) {
    projWhere += ` AND p.id IN (${projectIds.map(() => '?').join(',')})`;
    projParams.push(...projectIds);
  }

  const [projects] = await pool.query(
    `SELECT p.id, p.code, p.name, p.project_type, p.location, p.description,
            p.start_date, p.expected_completion, p.estimated_budget, p.status, p.progress,
            c.name AS client_name, ct.name AS main_contractor_name,
            COALESCE(spent.total, 0) AS total_spent
     FROM projects p
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN contractors ct ON ct.id = p.contractor_id
     LEFT JOIN (SELECT project_id, SUM(amount) AS total FROM expenses GROUP BY project_id) spent
            ON spent.project_id = p.id
     WHERE ${projWhere}
     ORDER BY p.id DESC`,
    projParams
  );

  const pIds = projects.map((p) => p.id);
  if (pIds.length === 0) return { projects: [] };

  const [sites] = await pool.query(
    `SELECT s.id, s.name, s.project_id, s.status, s.progress, s.contractor_id,
            ct.name AS contractor_name, ct.phone AS contractor_phone
     FROM sites s
     LEFT JOIN contractors ct ON ct.id = s.contractor_id
     WHERE s.project_id IN (${pIds.map(() => '?').join(',')})
     ORDER BY s.id ASC`,
    pIds
  );

  const sitesByProject = {};
  sites.forEach((s) => {
    if (!sitesByProject[s.project_id]) sitesByProject[s.project_id] = [];
    sitesByProject[s.project_id].push(s);
  });

  return {
    projects: projects.map((p) => ({
      ...p,
      sites: sitesByProject[p.id] || [],
      siteCount: (sitesByProject[p.id] || []).length,
    })),
  };
}

/**
 * Contractors handling breakdown for PM
 */
async function getContractors(userId, role) {
  const projectIds = await resolvePmProjectIds(userId, role);
  if (projectIds && projectIds.length === 0) return { contractors: [] };

  let siteFilter = 's.contractor_id IS NOT NULL';
  const siteParams = [];
  if (projectIds && projectIds.length > 0) {
    siteFilter += ` AND s.project_id IN (${projectIds.map(() => '?').join(',')})`;
    siteParams.push(...projectIds);
  }

  const [siteRows] = await pool.query(
    `SELECT s.id AS site_id, s.name AS site_name, s.project_id, s.status AS site_status,
            p.name AS project_name, p.code AS project_code,
            ct.id AS contractor_id, ct.name AS contractor_name, ct.contact_person,
            ct.phone, ct.email, ct.speciality, ct.is_active
     FROM sites s
     JOIN projects p ON p.id = s.project_id
     JOIN contractors ct ON ct.id = s.contractor_id
     WHERE ${siteFilter}
     ORDER BY ct.name ASC`,
    siteParams
  );

  const contractorMap = new Map();
  siteRows.forEach((row) => {
    if (!contractorMap.has(row.contractor_id)) {
      contractorMap.set(row.contractor_id, {
        id: row.contractor_id,
        name: row.contractor_name,
        contactPerson: row.contact_person,
        phone: row.phone,
        email: row.email,
        speciality: row.speciality,
        isActive: row.is_active,
        sites: [],
        totalProcured: 0,
        workerCount: 0,
        lastUpdate: null,
      });
    }
    contractorMap.get(row.contractor_id).sites.push({
      siteId: row.site_id,
      siteName: row.site_name,
      projectId: row.project_id,
      projectName: row.project_name,
      projectCode: row.project_code,
      siteStatus: row.site_status,
    });
  });

  const cIds = Array.from(contractorMap.keys());
  if (cIds.length === 0) return { contractors: [] };

  // Fetch procurement total per contractor on these projects
  try {
    const [procTotals] = await pool.query(
      `SELECT pr.destination_contractor_id AS contractor_id,
              SUM(COALESCE(pr.total_amount, pr.quantity * COALESCE(pr.purchase_rate, pr.estimated_rate, 0))) AS total_val
       FROM procurement_requests pr
       WHERE pr.destination_contractor_id IN (${cIds.map(() => '?').join(',')})
       GROUP BY pr.destination_contractor_id`,
      cIds
    );
    procTotals.forEach((pt) => {
      if (contractorMap.has(pt.contractor_id)) {
        contractorMap.get(pt.contractor_id).totalProcured = Number(pt.total_val || 0);
      }
    });
  } catch (_) {}

  // Fetch worker count per contractor
  try {
    const [workers] = await pool.query(
      `SELECT contractor_id, COUNT(*) AS cnt
       FROM contractor_workers
       WHERE contractor_id IN (${cIds.map(() => '?').join(',')}) AND status = 'active'
       GROUP BY contractor_id`,
      cIds
    );
    workers.forEach((w) => {
      if (contractorMap.has(w.contractor_id)) {
        contractorMap.get(w.contractor_id).workerCount = Number(w.cnt || 0);
      }
    });
  } catch (_) {}

  // Fetch last update per contractor
  try {
    const [lastUpdates] = await pool.query(
      `SELECT contractor_id, MAX(work_date) AS last_date
       FROM daily_work_updates
       WHERE contractor_id IN (${cIds.map(() => '?').join(',')})
       GROUP BY contractor_id`,
      cIds
    );
    lastUpdates.forEach((lu) => {
      if (contractorMap.has(lu.contractor_id)) {
        contractorMap.get(lu.contractor_id).lastUpdate = lu.last_date;
      }
    });
  } catch (_) {}

  return {
    contractors: Array.from(contractorMap.values()),
  };
}

/**
 * Site-wise Daily Work Updates
 */
async function getWorkUpdates(query, userId, role) {
  const projectIds = await resolvePmProjectIds(userId, role);

  const where = ['1=1'];
  const params = [];

  if (projectIds && projectIds.length > 0) {
    where.push(`dw.project_id IN (${projectIds.map(() => '?').join(',')})`);
    params.push(...projectIds);
  }

  if (query.projectId) {
    where.push('dw.project_id = ?');
    params.push(Number(query.projectId));
  }

  if (query.siteId) {
    where.push('dw.site_id = ?');
    params.push(Number(query.siteId));
  }

  if (query.contractorId) {
    where.push('dw.contractor_id = ?');
    params.push(Number(query.contractorId));
  }

  if (query.date) {
    where.push('dw.work_date = ?');
    params.push(query.date);
  }

  const [updates] = await pool.query(
    `SELECT dw.id, dw.project_id, dw.site_id, dw.task_id, dw.phase_number,
            dw.subcategory, dw.work_done, dw.work_date, dw.progress_percentage,
            dw.work_status, dw.remarks, dw.created_at,
            p.name AS project_name, p.code AS project_code,
            s.name AS site_name,
            ct.name AS contractor_name,
            pt.name AS task_name,
            (SELECT COUNT(*) FROM daily_work_photos WHERE work_update_id = dw.id) AS photo_count,
            (SELECT COUNT(*) FROM task_worker_logs WHERE daily_work_id = dw.id) AS worker_count
     FROM daily_work_updates dw
     JOIN projects p ON p.id = dw.project_id
     LEFT JOIN sites s ON s.id = dw.site_id
     LEFT JOIN contractors ct ON ct.id = dw.contractor_id
     LEFT JOIN project_tasks pt ON pt.id = dw.task_id
     WHERE ${where.join(' AND ')}
     ORDER BY dw.work_date DESC, dw.id DESC
     LIMIT 50`,
    params
  );

  return { updates };
}

/**
 * Contractor Procurement Tracking for PM
 */
async function getProcurement(query, userId, role) {
  const projectIds = await resolvePmProjectIds(userId, role);

  const where = ['1=1'];
  const params = [];

  if (projectIds && projectIds.length > 0) {
    where.push(`pr.project_id IN (${projectIds.map(() => '?').join(',')})`);
    params.push(...projectIds);
  }

  if (query.projectId) {
    where.push('pr.project_id = ?');
    params.push(Number(query.projectId));
  }

  if (query.siteId) {
    where.push('pr.site_id = ?');
    params.push(Number(query.siteId));
  }

  if (query.contractorId) {
    where.push('(pr.destination_contractor_id = ? OR pr.source_contractor_id = ?)');
    params.push(Number(query.contractorId), Number(query.contractorId));
  }

  if (query.status && query.status !== 'all') {
    where.push('pr.status = ?');
    params.push(query.status);
  }

  const [items] = await pool.query(
    `SELECT pr.id, pr.request_number, pr.project_id, pr.site_id, pr.task_id,
            pr.material_id, pr.tool_id, pr.item_type, pr.quantity, pr.unit,
            pr.estimated_rate, pr.purchase_rate, pr.total_amount, pr.status, pr.priority,
            pr.procurement_kind, pr.source_type, pr.vehicle_number, pr.driver_name,
            pr.driver_phone, pr.challan_number, pr.challan_date, pr.invoice_number,
            pr.remarks, pr.created_at, pr.required_date,
            p.name AS project_name, p.code AS project_code,
            s.name AS site_name,
            m.name AS material_name, m.category AS material_category,
            t.name AS tool_name,
            COALESCE(ct.name, u.full_name, 'Contractor') AS contractor_name,
            v.name AS vendor_name
     FROM procurement_requests pr
     LEFT JOIN projects p ON p.id = pr.project_id
     LEFT JOIN sites s ON s.id = pr.site_id
     LEFT JOIN materials m ON m.id = pr.material_id
     LEFT JOIN tools t ON t.id = pr.tool_id
     LEFT JOIN users u ON u.id = pr.requested_by
     LEFT JOIN contractors ct ON ct.id = pr.destination_contractor_id OR ct.id = pr.source_contractor_id
     LEFT JOIN vendors v ON v.id = pr.vendor_id
     WHERE ${where.join(' AND ')}
     ORDER BY pr.id DESC
     LIMIT 100`,
    params
  );

  const totalAmount = items.reduce(
    (sum, it) =>
      sum +
      Number(
        it.total_amount ||
          Number(it.quantity || 0) * Number(it.purchase_rate || it.estimated_rate || 0)
      ),
    0
  );
  const deliveredAmount = items
    .filter((it) => it.status === 'received')
    .reduce(
      (sum, it) =>
        sum +
        Number(
          it.total_amount ||
            Number(it.quantity || 0) * Number(it.purchase_rate || it.estimated_rate || 0)
        ),
      0
    );
  const inTransitCount = items.filter((it) => ['in_transit', 'ordered'].includes(it.status)).length;
  const pendingCount = items.filter((it) => it.status === 'requested').length;

  return {
    summary: {
      totalAmount,
      deliveredAmount,
      inTransitCount,
      pendingCount,
      totalCount: items.length,
    },
    items,
  };
}

/**
 * Site Warehouse & Stock Tracking (clean like admin can see in warehouse details)
 */
async function getSiteWarehouse(query, userId, role) {
  const projectIds = await resolvePmProjectIds(userId, role);

  const where = ['s.id IS NOT NULL'];
  const params = [];

  if (projectIds && projectIds.length > 0) {
    where.push(`s.project_id IN (${projectIds.map(() => '?').join(',')})`);
    params.push(...projectIds);
  }

  if (query.projectId) {
    where.push('s.project_id = ?');
    params.push(Number(query.projectId));
  }

  if (query.siteId) {
    where.push('s.id = ?');
    params.push(Number(query.siteId));
  }

  // 1. Calculate Received Quantity per site & material
  const [receivedRows] = await pool.query(
    `SELECT pr.site_id, pr.material_id,
            SUM(COALESCE(pr.quantity, 0)) AS total_received
     FROM procurement_requests pr
     JOIN sites s ON s.id = pr.site_id
     WHERE ${where.join(' AND ')} AND pr.status = 'received' AND pr.material_id IS NOT NULL
     GROUP BY pr.site_id, pr.material_id`,
    params
  );

  // 2. Calculate Consumed Quantity from task materials / daily work
  let consumedRows = [];
  try {
    const [cRows] = await pool.query(
      `SELECT tm.site_id, tm.material_id,
              SUM(COALESCE(tm.quantity, 0)) AS total_consumed
       FROM task_materials tm
       JOIN sites s ON s.id = tm.site_id
       WHERE ${where.join(' AND ')}
       GROUP BY tm.site_id, tm.material_id`,
      params
    );
    consumedRows = cRows;
  } catch (_) {}

  // 3. Get Site & Material details
  const [siteDetails] = await pool.query(
    `SELECT s.id AS site_id, s.name AS site_name, s.project_id,
            p.name AS project_name, p.code AS project_code,
            ct.name AS contractor_name
     FROM sites s
     JOIN projects p ON p.id = s.project_id
     LEFT JOIN contractors ct ON ct.id = s.contractor_id
     WHERE ${where.join(' AND ')}`,
    params
  );

  const siteMap = {};
  siteDetails.forEach((s) => {
    siteMap[s.site_id] = s;
  });

  // Fetch materials
  const [materials] = await pool.query(
    'SELECT id, name, category, unit, default_rate FROM materials'
  );
  const matMap = {};
  materials.forEach((m) => {
    matMap[m.id] = m;
  });

  const stockMap = new Map();

  receivedRows.forEach((r) => {
    const key = `${r.site_id}_${r.material_id}`;
    const site = siteMap[r.site_id];
    const mat = matMap[r.material_id];
    if (site && mat) {
      stockMap.set(key, {
        siteId: r.site_id,
        siteName: site.site_name,
        projectId: site.project_id,
        projectName: site.project_name,
        projectCode: site.project_code,
        contractorName: site.contractor_name || 'Unassigned',
        materialId: r.material_id,
        materialName: mat.name,
        materialCategory: mat.category,
        unit: mat.unit,
        receivedQuantity: Number(r.total_received || 0),
        consumedQuantity: 0,
        availableStock: Number(r.total_received || 0),
      });
    }
  });

  consumedRows.forEach((c) => {
    const key = `${c.site_id}_${c.material_id}`;
    if (stockMap.has(key)) {
      const item = stockMap.get(key);
      item.consumedQuantity = Number(c.total_consumed || 0);
      item.availableStock = Math.max(0, item.receivedQuantity - item.consumedQuantity);
    } else {
      const site = siteMap[c.site_id];
      const mat = matMap[c.material_id];
      if (site && mat) {
        stockMap.set(key, {
          siteId: c.site_id,
          siteName: site.site_name,
          projectId: site.project_id,
          projectName: site.project_name,
          projectCode: site.project_code,
          contractorName: site.contractor_name || 'Unassigned',
          materialId: c.material_id,
          materialName: mat.name,
          materialCategory: mat.category,
          unit: mat.unit,
          receivedQuantity: 0,
          consumedQuantity: Number(c.total_consumed || 0),
          availableStock: 0,
        });
      }
    }
  });

  const stockItems = Array.from(stockMap.values());

  return {
    stock: stockItems,
    summary: {
      totalItems: stockItems.length,
      sitesCount: Object.keys(siteMap).length,
    },
  };
}

module.exports = {
  getDashboard,
  getProjects,
  getContractors,
  getWorkUpdates,
  getProcurement,
  getSiteWarehouse,
};
