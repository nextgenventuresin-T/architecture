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

const router = express.Router();


router.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
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

// Future ERP modules mount here, one per interface.

module.exports = router;
