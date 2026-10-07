'use strict';

const { pool } = require('../config/db');
const { PROJECT_PHASES_DEF } = require('../config/projectPhases');

async function ensurePhases(projectId) {
  for (const def of PROJECT_PHASES_DEF) {
    await pool.query(
      `INSERT IGNORE INTO project_phases (project_id, phase_number, phase_title)
       VALUES (?, ?, ?)`,
      [projectId, def.phase_number, def.title]
    );
  }
}

async function getPhasesWithDetails(projectId) {
  await ensurePhases(projectId);

  const [phases] = await pool.query(
    `SELECT * FROM project_phases WHERE project_id = ? ORDER BY phase_number ASC`,
    [projectId]
  );

  const [materials] = await pool.query(
    `SELECT ppm.*, m.name AS material_name, m.unit AS material_unit, m.category AS material_category
     FROM project_phase_materials ppm
     JOIN materials m ON m.id = ppm.material_id
     WHERE ppm.project_id = ? ORDER BY ppm.id ASC`,
    [projectId]
  );

  const [tools] = await pool.query(
    `SELECT ppt.*, t.code AS tool_code, t.type AS tool_master_type
     FROM project_phase_tools ppt
     LEFT JOIN tools t ON t.id = ppt.tool_id
     WHERE ppt.project_id = ? ORDER BY ppt.id ASC`,
    [projectId]
  );

  const [labour] = await pool.query(
    `SELECT * FROM project_phase_labour WHERE project_id = ? ORDER BY id ASC`,
    [projectId]
  );

  const [misc] = await pool.query(
    `SELECT * FROM project_phase_misc WHERE project_id = ? ORDER BY id ASC`,
    [projectId]
  );

  return phases.map((phase) => {
    const def = PROJECT_PHASES_DEF.find((d) => d.phase_number === phase.phase_number);
    return {
      id: phase.id,
      phaseNumber: phase.phase_number,
      title: phase.phase_title,
      subcategories: def ? def.subcategories : [],
      durationMonths: Number(phase.duration_months || 0),
      materialCost: Number(phase.material_cost || 0),
      toolCost: Number(phase.tool_cost || 0),
      labourCost: Number(phase.labour_cost || 0),
      miscCost: Number(phase.misc_cost || 0),
      totalCost: Number(phase.total_cost || 0),
      budgetTotal: Number(phase.total_cost || 0),
      progress: Number(phase.progress || 0),
      status: phase.status,
      materials: materials
        .filter((m) => m.phase_id === phase.id)
        .map((m) => ({
          id: m.id,
          materialId: m.material_id,
          materialName: m.material_name,
          unit: m.material_unit,
          category: m.material_category,
          quantity: Number(m.quantity || 0),
          costPerUnit: Number(m.cost_per_unit || 0),
          totalCost: Number(m.total_cost || 0),
        })),
      tools: tools
        .filter((t) => t.phase_id === phase.id)
        .map((t) => ({
          id: t.id,
          toolId: t.tool_id,
          toolName: t.tool_name,
          rentalType: t.rental_type,
          quantity: Number(t.quantity || 1),
          cost: Number(t.cost || 0),
          totalCost: Number(t.total_cost || 0),
        })),
      labour: labour
        .filter((l) => l.phase_id === phase.id)
        .map((l) => {
          const defaultWorkingDays = Math.round(Number(phase.duration_months || 0) * 25);
          const workingDays = Number(l.working_days != null && l.working_days > 0 ? l.working_days : defaultWorkingDays);
          const workerCount = Number(l.worker_count != null ? l.worker_count : (l.quantity || 1));
          const dailyWage = Number(l.daily_wage != null ? l.daily_wage : (l.cost || 0));
          const totalCost = Number(l.total_cost != null && l.total_cost > 0 ? l.total_cost : (workerCount * dailyWage * workingDays));

          return {
            id: l.id,
            labourType: l.labour_type,
            workerCount,
            dailyWage,
            workingDays,
            totalCost,
            // Compatibility fields
            quantity: workerCount,
            cost: dailyWage,
            category: l.labour_type,
            dailyWageRate: dailyWage,
            durationDays: workingDays,
          };
        }),
      misc: misc
        .filter((mc) => mc.phase_id === phase.id)
        .map((mc) => ({
          id: mc.id,
          description: mc.description,
          amount: Number(mc.amount || 0),
        })),
    };
  });
}

async function savePhases(projectId, phasesData = []) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensurePhases(projectId);

    const [existingPhases] = await connection.query(
      'SELECT id, phase_number FROM project_phases WHERE project_id = ?',
      [projectId]
    );
    const phaseMap = new Map(existingPhases.map((p) => [p.phase_number, p.id]));

    let projectTotalBudget = 0;

    for (const phaseInput of phasesData) {
      const phaseNumber = Number(phaseInput.phaseNumber || phaseInput.phase_number);
      const phaseId = phaseMap.get(phaseNumber);
      if (!phaseId) continue;

      const durationMonths = Number(phaseInput.durationMonths ?? phaseInput.duration_months ?? 0);

      // Clean existing items
      await connection.query('DELETE FROM project_phase_materials WHERE phase_id = ?', [phaseId]);
      await connection.query('DELETE FROM project_phase_tools WHERE phase_id = ?', [phaseId]);
      await connection.query('DELETE FROM project_phase_labour WHERE phase_id = ?', [phaseId]);
      await connection.query('DELETE FROM project_phase_misc WHERE phase_id = ?', [phaseId]);

      let phaseMaterialCost = 0;
      let phaseToolCost = 0;
      let phaseLabourCost = 0;
      let phaseMiscCost = 0;

      // Materials
      const materials = phaseInput.materials || [];
      for (const m of materials) {
        const qty = Number(m.quantity ?? m.plannedQuantity ?? 0);
        const rate = Number(m.costPerUnit ?? m.cost_per_unit ?? m.unitRate ?? 0);
        const total = m.totalCost != null ? Number(m.totalCost) : (qty * rate);
        phaseMaterialCost += total;
        if (m.materialId || m.material_id) {
          await connection.query(
            `INSERT INTO project_phase_materials (phase_id, project_id, material_id, quantity, cost_per_unit, total_cost)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [phaseId, projectId, m.materialId || m.material_id, qty, rate, total]
          );
        }
      }

      // Tools
      const tools = phaseInput.tools || [];
      for (const t of tools) {
        const qty = Number(t.quantity ?? 1);
        const cost = Number(t.cost ?? t.estimatedCost ?? 0);
        const total = t.totalCost != null ? Number(t.totalCost) : (qty * cost);
        phaseToolCost += total;
        const toolName = (t.toolName || t.tool_name || t.name || (t.toolId ? `Tool #${t.toolId}` : '')).trim();
        if (toolName) {
          await connection.query(
            `INSERT INTO project_phase_tools (phase_id, project_id, tool_id, tool_name, rental_type, quantity, cost, total_cost)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [phaseId, projectId, t.toolId || t.tool_id || null, toolName, t.rentalType || t.rental_type || t.procurementType || 'Rent', qty, cost, total]
          );
        }
      }

      // Labour
      const labour = phaseInput.labour || [];
      for (const l of labour) {
        const workerCount = Number(l.workerCount ?? l.number_of_workers ?? l.quantity ?? 1);
        const dailyWage = Number(l.dailyWage ?? l.daily_wage ?? l.dailyWageRate ?? l.cost ?? 0);
        // Working days: auto calculated from phase duration (durationMonths * 25), or use legacy durationDays if explicitly set
        const calculatedWorkingDays = Math.round(durationMonths * 25);
        let workingDays = calculatedWorkingDays;
        if (calculatedWorkingDays === 0) {
          workingDays = Number(l.workingDays ?? l.durationDays ?? 0);
        } else if (l.durationDays != null && l.workingDays == null) {
          workingDays = Number(l.durationDays);
        }
        const total = workerCount * dailyWage * workingDays;
        phaseLabourCost += total;
        const lType = (l.labourType || l.labour_type || l.category || 'Mason').trim();
        await connection.query(
          `INSERT INTO project_phase_labour (phase_id, project_id, labour_type, worker_count, daily_wage, working_days, quantity, cost, total_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [phaseId, projectId, lType, workerCount, dailyWage, workingDays, workerCount, dailyWage, total]
        );
      }

      // Misc
      const misc = phaseInput.misc || [];
      for (const mc of misc) {
        const amt = Number(mc.amount || 0);
        phaseMiscCost += amt;
        const desc = (mc.description || mc.expenseTitle || '').trim();
        if (desc) {
          await connection.query(
            `INSERT INTO project_phase_misc (phase_id, project_id, description, amount)
             VALUES (?, ?, ?, ?)`,
            [phaseId, projectId, desc, amt]
          );
        }
      }

      const phaseTotalCost = phaseMaterialCost + phaseToolCost + phaseLabourCost + phaseMiscCost;
      projectTotalBudget += phaseTotalCost;

      await connection.query(
        `UPDATE project_phases
         SET duration_months = ?, material_cost = ?, tool_cost = ?, labour_cost = ?, misc_cost = ?, total_cost = ?
         WHERE id = ?`,
        [durationMonths, phaseMaterialCost, phaseToolCost, phaseLabourCost, phaseMiscCost, phaseTotalCost, phaseId]
      );
    }

    // Update project total estimated budget automatically
    await connection.query(
      'UPDATE projects SET estimated_budget = ? WHERE id = ?',
      [projectTotalBudget, projectId]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  return getPhasesWithDetails(projectId);
}

module.exports = { ensurePhases, getPhasesWithDetails, savePhases };
