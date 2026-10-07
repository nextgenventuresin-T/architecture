'use strict';

const themeSettingsService = require('../services/themeSettingsService');

async function getActiveTheme(req, res, next) {
  try {
    const companyId = req.query.companyId || req.user?.companyId || null;
    const theme = await themeSettingsService.getActiveTheme(companyId);
    res.json({ success: true, data: theme });
  } catch (error) {
    next(error);
  }
}

async function listAllThemes(req, res, next) {
  try {
    const result = await themeSettingsService.listAllCompanyThemes();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getThemeForCompany(req, res, next) {
  try {
    const { companyId } = req.params;
    const theme = await themeSettingsService.getThemeForCompany(companyId);
    res.json({ success: true, data: theme });
  } catch (error) {
    next(error);
  }
}

async function saveCompanyTheme(req, res, next) {
  try {
    const { companyId } = req.params;
    const { themeId, themeName, isCustom, colors } = req.body;

    const saved = await themeSettingsService.saveCompanyTheme({
      companyId,
      themeId,
      themeName,
      isCustom,
      colors,
    });

    res.json({
      success: true,
      message: 'Theme settings saved successfully.',
      data: saved,
    });
  } catch (error) {
    next(error);
  }
}

async function resetCompanyTheme(req, res, next) {
  try {
    const { companyId } = req.params;
    const reset = await themeSettingsService.resetCompanyTheme(companyId);
    res.json({
      success: true,
      message: 'Theme settings reset to default successfully.',
      data: reset,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getActiveTheme,
  listAllThemes,
  getThemeForCompany,
  saveCompanyTheme,
  resetCompanyTheme,
};
