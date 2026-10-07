'use strict';

const themeSettingsModel = require('../models/themeSettingsModel');
const clientModel = require('../models/clientModel');

const PRESET_PALETTES = [
  {
    id: 'purple',
    name: 'Architecture Purple (Default)',
    swatch: '#6B3FD4',
    colors: {
      primary: '#6B3FD4',
      secondary: '#8B5CF6',
      accent: '#F59E0B',
      sidebarBg: '#4A2992',
      sidebarText: '#FFFFFF',
      background: '#F7F5FC',
      card: '#FFFFFF',
      buttonPrimaryBg: '#6B3FD4',
      buttonPrimaryText: '#FFFFFF',
      textMain: '#1C1731',
      textMuted: '#3A3552',
      border: '#E6E2F2',
      statusSuccess: '#059669',
      statusWarning: '#D97706',
      statusDanger: '#B32424',
      statusInfo: '#2563EB',
    },
  },
  {
    id: 'blue',
    name: 'Sapphire Corporate',
    swatch: '#2563EB',
    colors: {
      primary: '#2563EB',
      secondary: '#3B82F6',
      accent: '#0D9488',
      sidebarBg: '#1E3A8A',
      sidebarText: '#FFFFFF',
      background: '#F0F6FF',
      card: '#FFFFFF',
      buttonPrimaryBg: '#2563EB',
      buttonPrimaryText: '#FFFFFF',
      textMain: '#0F172A',
      textMuted: '#334155',
      border: '#E2E8F0',
      statusSuccess: '#059669',
      statusWarning: '#D97706',
      statusDanger: '#DC2626',
      statusInfo: '#2563EB',
    },
  },
  {
    id: 'green',
    name: 'Emerald Construction',
    swatch: '#059669',
    colors: {
      primary: '#059669',
      secondary: '#10B981',
      accent: '#D97706',
      sidebarBg: '#064E3B',
      sidebarText: '#FFFFFF',
      background: '#F0FDF4',
      card: '#FFFFFF',
      buttonPrimaryBg: '#059669',
      buttonPrimaryText: '#FFFFFF',
      textMain: '#06281E',
      textMuted: '#1E4638',
      border: '#E2EFE7',
      statusSuccess: '#059669',
      statusWarning: '#D97706',
      statusDanger: '#DC2626',
      statusInfo: '#0284C7',
    },
  },
  {
    id: 'orange',
    name: 'Safety Amber',
    swatch: '#EA580C',
    colors: {
      primary: '#EA580C',
      secondary: '#F97316',
      accent: '#0284C7',
      sidebarBg: '#7C2D12',
      sidebarText: '#FFFFFF',
      background: '#FFF7ED',
      card: '#FFFFFF',
      buttonPrimaryBg: '#EA580C',
      buttonPrimaryText: '#FFFFFF',
      textMain: '#2A170B',
      textMuted: '#4F3320',
      border: '#FED7AA',
      statusSuccess: '#059669',
      statusWarning: '#D97706',
      statusDanger: '#DC2626',
      statusInfo: '#0284C7',
    },
  },
  {
    id: 'dark',
    name: 'Slate Studio',
    swatch: '#1E293B',
    colors: {
      primary: '#334155',
      secondary: '#64748B',
      accent: '#38BDF8',
      sidebarBg: '#0F172A',
      sidebarText: '#FFFFFF',
      background: '#F8FAFC',
      card: '#FFFFFF',
      buttonPrimaryBg: '#1E293B',
      buttonPrimaryText: '#FFFFFF',
      textMain: '#0F172A',
      textMuted: '#334155',
      border: '#CBD5E1',
      statusSuccess: '#059669',
      statusWarning: '#D97706',
      statusDanger: '#DC2626',
      statusInfo: '#0284C7',
    },
  },
  {
    id: 'black',
    name: 'Graphite Executive',
    swatch: '#18181B',
    colors: {
      primary: '#27272A',
      secondary: '#52525B',
      accent: '#6366F1',
      sidebarBg: '#09090B',
      sidebarText: '#FFFFFF',
      background: '#FAFAFA',
      card: '#FFFFFF',
      buttonPrimaryBg: '#18181B',
      buttonPrimaryText: '#FFFFFF',
      textMain: '#09090B',
      textMuted: '#27272A',
      border: '#E4E4E7',
      statusSuccess: '#059669',
      statusWarning: '#D97706',
      statusDanger: '#DC2626',
      statusInfo: '#2563EB',
    },
  },
];

async function getActiveTheme(companyId = null) {
  let theme = null;
  if (companyId) {
    theme = await themeSettingsModel.findByCompanyId(companyId);
  }
  if (!theme) {
    theme = await themeSettingsModel.findGlobalTheme();
  }
  if (!theme) {
    return PRESET_PALETTES[0];
  }
  return theme;
}

async function listAllCompanyThemes() {
  const [savedThemes, clientsResult] = await Promise.all([
    themeSettingsModel.findAll(),
    clientModel.findAll ? clientModel.findAll({ pageSize: 100 }) : { rows: [] },
  ]);

  const clientRows = Array.isArray(clientsResult) ? clientsResult : clientsResult?.rows || [];

  return {
    presets: PRESET_PALETTES,
    savedThemes,
    clients: clientRows.map((c) => ({ id: c.id, name: c.name })),
  };
}

async function getThemeForCompany(companyId) {
  if (companyId === 'global' || !companyId) {
    const globalTheme = await themeSettingsModel.findGlobalTheme();
    return globalTheme || PRESET_PALETTES[0];
  }
  const theme = await themeSettingsModel.findByCompanyId(Number(companyId));
  if (!theme) {
    // Fall back to global theme
    return getActiveTheme(null);
  }
  return theme;
}

async function saveCompanyTheme({ companyId, themeId, themeName, isCustom, colors }) {
  const targetCompanyId = companyId === 'global' || !companyId ? null : Number(companyId);
  return themeSettingsModel.upsert({
    companyId: targetCompanyId,
    themeId: themeId || 'custom',
    themeName: themeName || 'Custom Theme',
    isCustom: Boolean(isCustom),
    colors,
  });
}

async function resetCompanyTheme(companyId) {
  if (!companyId || companyId === 'global') {
    // Reset global to purple
    return themeSettingsModel.upsert({
      companyId: null,
      themeId: PRESET_PALETTES[0].id,
      themeName: PRESET_PALETTES[0].name,
      isCustom: false,
      colors: PRESET_PALETTES[0].colors,
    });
  }
  await themeSettingsModel.deleteByCompanyId(Number(companyId));
  return getActiveTheme(null);
}

module.exports = {
  PRESET_PALETTES,
  getActiveTheme,
  listAllCompanyThemes,
  getThemeForCompany,
  saveCompanyTheme,
  resetCompanyTheme,
};
