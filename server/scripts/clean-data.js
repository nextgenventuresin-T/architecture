'use strict';

/**
 * Clean & Reset Script for Architecture ERP
 * Modules: Project, Finance, Procurement, Warehouse
 * 
 * Usage:
 *   node scripts/clean-data.js            (Cleans all 4 modules: project, finance, procurement, warehouse)
 *   node scripts/clean-data.js --all      (Cleans all 4 modules)
 *   node scripts/clean-data.js --project  (Cleans only project module)
 *   node scripts/clean-data.js --finance  (Cleans only finance module)
 *   node scripts/clean-data.js --procurement (Cleans only procurement module)
 *   node scripts/clean-data.js --warehouse (Cleans only warehouse module)
 */

require('dotenv').config();
const { pool } = require('../src/config/db');

const args = process.argv.slice(2).map((a) => a.toLowerCase());

const cleanAll = args.length === 0 || args.includes('--all');
const cleanProject = cleanAll || args.includes('--project');
const cleanFinance = cleanAll || args.includes('--finance');
const cleanProcurement = cleanAll || args.includes('--procurement');
const cleanWarehouse = cleanAll || args.includes('--warehouse');

const PROJECT_TABLES = [
  'daily_work_photos',
  'daily_work_updates',
  'task_worker_logs',
  'task_assigned_workers',
  'task_budget_approvals',
  'task_labour',
  'task_materials',
  'task_misc',
  'task_tools',
  'project_tasks',
  'project_phase_labour',
  'project_phase_materials',
  'project_phase_misc',
  'project_phase_tools',
  'project_phases',
  'project_issues',
  'project_documents',
  'site_activities',
  'user_site_access',
  'user_project_access',
  'sites',
  'projects',
];

const FINANCE_TABLES = [
  'expenses',
  'client_payments',
  'vendor_payments',
  'contractor_payments',
  'contractor_po_milestones',
  'contractor_pos',
];

const PROCUREMENT_TABLES = [
  'procurement_receipts',
  'procurement_requests',
  'material_entries',
  'approval_requests',
  'approval_history',
];

const WAREHOUSE_TABLES = [
  'material_movements',
  'warehouse_transactions',
  'warehouse_stock',
];

async function truncateTable(table) {
  try {
    await pool.query(`TRUNCATE TABLE \`${table}\``);
    console.log(`  ✓ Cleared table: ${table}`);
  } catch (err) {
    // If truncate fails due to FK references, fallback to delete
    try {
      await pool.query(`DELETE FROM \`${table}\``);
      await pool.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`);
      console.log(`  ✓ Cleared table (via DELETE): ${table}`);
    } catch (e) {
      console.warn(`  ⚠️ Could not clear table ${table}: ${e.message}`);
    }
  }
}

async function ensureCentralWarehouse() {
  const [rows] = await pool.query("SELECT id FROM warehouses WHERE type = 'central' OR code = 'WH-001' LIMIT 1");
  if (rows.length === 0) {
    await pool.query(`
      INSERT INTO warehouses (code, name, location, description, status, type)
      VALUES ('WH-001', 'Central Main Warehouse', 'Headquarters / Main Store Yard', 'Main central warehouse for procurement, central stock storage, and site material transfers.', 'active', 'central')
    `);
    console.log('  ✓ Initialized default Central Main Warehouse (WH-001)');
  } else {
    // Delete contractor-specific temporary warehouses, preserve central warehouse
    await pool.query("DELETE FROM warehouses WHERE type != 'central' AND code != 'WH-001'");
    console.log('  ✓ Preserved Central Main Warehouse, removed contractor warehouse instances');
  }
}

async function main() {
  console.log('====================================================');
  console.log('🧹 ARCHITECTURE ERP - DATABASE CLEANING TOOL');
  console.log('====================================================');

  console.log('Scope selected:');
  if (cleanProject) console.log(' • Project (Projects, Sites, Phases, Tasks, Work Updates, Logs)');
  if (cleanFinance) console.log(' • Finance (Expenses, Payments, POs, Milestones)');
  if (cleanProcurement) console.log(' • Procurement (Requests, Receipts, Material Entries, Approvals)');
  if (cleanWarehouse) console.log(' • Warehouse (Stock Balances, Movements, Transactions)');
  console.log('----------------------------------------------------');

  try {
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('✓ Disabled foreign key checks for safe truncation.');

    if (cleanProject) {
      console.log('\n[1/4] Cleaning Project Module...');
      for (const t of PROJECT_TABLES) {
        await truncateTable(t);
      }
      await pool.query('UPDATE attendance_records SET project_id = NULL, site_id = NULL WHERE project_id IS NOT NULL OR site_id IS NOT NULL').catch(() => {});
      await pool.query('UPDATE labour_assignments SET project_id = NULL, site_id = NULL WHERE project_id IS NOT NULL OR site_id IS NOT NULL').catch(() => {});
      await pool.query('UPDATE employee_assignments SET project_id = NULL, site_id = NULL WHERE project_id IS NOT NULL OR site_id IS NOT NULL').catch(() => {});
      console.log('  ✓ Unlinked project/site references on attendance and labour assignment records');
    }

    if (cleanFinance) {
      console.log('\n[2/4] Cleaning Finance Module...');
      for (const t of FINANCE_TABLES) {
        await truncateTable(t);
      }
    }

    if (cleanProcurement) {
      console.log('\n[3/4] Cleaning Procurement Module...');
      for (const t of PROCUREMENT_TABLES) {
        await truncateTable(t);
      }
    }

    if (cleanWarehouse) {
      console.log('\n[4/4] Cleaning Warehouse Module...');
      for (const t of WAREHOUSE_TABLES) {
        await truncateTable(t);
      }
      await ensureCentralWarehouse();
    }

    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\n✓ Re-enabled foreign key checks.');
    console.log('====================================================');
    console.log('✨ CLEAN COMPLETED SUCCESSFULLY!');
    console.log('Master data (Users, Contractors, Vendors, Materials, Tools, Roles) is preserved.');
    console.log('====================================================\n');
  } catch (error) {
    console.error('\n❌ Error during clean:', error);
  } finally {
    await pool.end();
  }
}

main();
