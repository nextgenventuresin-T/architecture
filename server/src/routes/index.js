'use strict';

const express = require('express');
const authRoutes = require('./authRoutes');
const projectRoutes = require('./projectRoutes');
const clientRoutes = require('./clientRoutes');
const toolRoutes = require('./toolRoutes');
const dailyWorkRoutes = require('./dailyWorkRoutes');
const siteRoutes = require('./siteRoutes');
const approvalRoutes = require('./approvalRoutes');
const contractorRoutes = require('./contractorRoutes');
const employeeRoutes = require('./employeeRoutes');
const materialRoutes = require('./materialRoutes');
const procurementRoutes = require('./procurementRoutes');
const warehouseRoutes = require('./warehouseRoutes');
const materialMovementRoutes = require('./materialMovementRoutes');
const financeRoutes = require('./financeRoutes');
const userAccessRoutes = require('./userAccessRoutes');
const hrLabourRoutes = require('./hrLabourRoutes');
const reportRoutes = require('./reportRoutes');
const contractorContractsRoutes = require('./contractorContractsRoutes');
const themeSettingsRoutes = require('./themeSettingsRoutes');
const taskRoutes = require('./taskRoutes');
const vendorRoutes = require('./vendorRoutes');
const notificationRoutes = require('./notificationRoutes');
const pmRoutes = require('./pmRoutes');
const projectManagerRoutes = require('./projectManagerRoutes');
const labourRoutes = require('./labourRoutes');
const staffPortalRoutes = require('./staffPortalRoutes');
const importRoutes = require('./importRoutes');
const siteReceivingRoutes = require('./siteReceivingRoutes');

const router = express.Router();


router.get('/health', async (req, res) => {
  // Deploy check: when this process started, and whether the database has every
  // column the running code needs (no data, only column names).
  const { missingColumns, startup } = require('../db/ensureSchema');
  let missing = null;
  try { missing = await missingColumns(); } catch (e) { missing = [`check failed: ${e.code || e.message}`]; }
  res.json({
    success: true,
    data: {
      status: 'ok', time: new Date().toISOString(), build: '2026-11-17c',
      startedAt: startup.startedAt, schemaMissing: missing, migrationErrors: startup.migrationErrors,
      recentErrors: require('../middleware/errorHandler').recentErrors,
    },
  });
});

router.use('/auth', authRoutes);
router.use('/projects', projectRoutes);
router.use('/clients', clientRoutes);
router.use('/tools', toolRoutes);
router.use('/daily-work', dailyWorkRoutes);
router.use('/sites', siteRoutes);
router.use('/approvals', approvalRoutes);
router.use('/contractors', contractorRoutes);
router.use('/employees', employeeRoutes);
router.use('/materials', materialRoutes);
router.use('/procurement', procurementRoutes);
router.use('/warehouse', warehouseRoutes);
router.use('/material-movements', materialMovementRoutes);
router.use('/finance', financeRoutes);
router.use('/users', userAccessRoutes);
router.use('/hr', hrLabourRoutes);
router.use('/reports', reportRoutes);
router.use('/contractor-portal/contracts', contractorContractsRoutes);
router.use('/settings', themeSettingsRoutes);
router.use('/tasks', taskRoutes);
router.use('/vendors', vendorRoutes);
router.use('/notifications', notificationRoutes);
router.use('/pm', pmRoutes);
router.use('/project-managers', projectManagerRoutes);
router.use('/labour', labourRoutes);
// "My Portal" (every login: own attendance + leave) and its Admin/HR side.
router.use('/my-portal', staffPortalRoutes.myPortal);
router.use('/staff-attendance', staffPortalRoutes.staff);
// Bulk Excel/CSV import: vendors, materials, machine types, serial machines.
router.use('/imports', importRoutes);
// Site Engineers / Project Managers receive Admin's deliveries to their sites.
router.use('/site-receiving', siteReceivingRoutes);

// Future ERP modules mount here, one per interface.

module.exports = router;
