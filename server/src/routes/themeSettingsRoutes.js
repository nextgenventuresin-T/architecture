'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const themeSettingsController = require('../controllers/themeSettingsController');

const router = express.Router();

// Get active theme (accessible by any logged in user or query companyId)
router.get('/theme', themeSettingsController.getActiveTheme);

// List all themes + presets (requires auth)
router.get('/themes', requireAuth, themeSettingsController.listAllThemes);

// Get theme for specific company
router.get('/themes/:companyId', requireAuth, themeSettingsController.getThemeForCompany);

// Save / Update theme for company (Admin or users with permission)
router.put(
  '/themes/:companyId',
  requireAuth,
  requireRole('admin'),
  themeSettingsController.saveCompanyTheme
);

// Reset theme for company back to default
router.delete(
  '/themes/:companyId',
  requireAuth,
  requireRole('admin'),
  themeSettingsController.resetCompanyTheme
);

module.exports = router;
