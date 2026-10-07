import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { generateBrandRamp } from '../utils/colorUtils';
import themeApi from '../api/themeApi';

export const THEME_STORAGE_KEY = 'aerp.theme';
export const THEME_CUSTOM_STORAGE_KEY = 'aerp.theme_custom';
export const DEFAULT_THEME = 'purple';

export const THEMES = [
  {
    id: 'purple',
    label: 'Architecture Purple',
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
    label: 'Sapphire Corporate',
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
    label: 'Emerald Construction',
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
    label: 'Safety Amber',
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
    id: 'yellow',
    label: 'Warm Ochre',
    swatch: '#CA8A04',
    colors: {
      primary: '#CA8A04',
      secondary: '#EAB308',
      accent: '#2563EB',
      sidebarBg: '#713F12',
      sidebarText: '#FFFFFF',
      background: '#FEFCE8',
      card: '#FFFFFF',
      buttonPrimaryBg: '#CA8A04',
      buttonPrimaryText: '#FFFFFF',
      textMain: '#1C1917',
      textMuted: '#44403C',
      border: '#FEF08A',
      statusSuccess: '#059669',
      statusWarning: '#D97706',
      statusDanger: '#DC2626',
      statusInfo: '#2563EB',
    },
  },
  {
    id: 'pink',
    label: 'Modern Rose',
    swatch: '#DB2777',
    colors: {
      primary: '#DB2777',
      secondary: '#EC4899',
      accent: '#8B5CF6',
      sidebarBg: '#831843',
      sidebarText: '#FFFFFF',
      background: '#FDF2F8',
      card: '#FFFFFF',
      buttonPrimaryBg: '#DB2777',
      buttonPrimaryText: '#FFFFFF',
      textMain: '#1F1218',
      textMuted: '#4A2837',
      border: '#FBCFE8',
      statusSuccess: '#059669',
      statusWarning: '#D97706',
      statusDanger: '#DC2626',
      statusInfo: '#2563EB',
    },
  },
  {
    id: 'dark',
    label: 'Slate Studio',
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
    label: 'Graphite Executive',
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
  {
    id: 'white',
    label: 'Zinc Minimalist',
    swatch: '#A1A1AA',
    colors: {
      primary: '#52525B',
      secondary: '#71717A',
      accent: '#3B82F6',
      sidebarBg: '#27272A',
      sidebarText: '#FFFFFF',
      background: '#F4F4F5',
      card: '#FFFFFF',
      buttonPrimaryBg: '#52525B',
      buttonPrimaryText: '#FFFFFF',
      textMain: '#18181B',
      textMuted: '#3F3F46',
      border: '#D4D4D8',
      statusSuccess: '#059669',
      statusWarning: '#D97706',
      statusDanger: '#DC2626',
      statusInfo: '#2563EB',
    },
  },
  {
    id: 'multicolour',
    label: 'Multicolour Gradient',
    swatch: 'linear-gradient(135deg,#6d28d9,#db2777 50%,#f59e0b)',
    colors: {
      primary: '#7C3AED',
      secondary: '#DB2777',
      accent: '#F59E0B',
      sidebarBg: '#4C1D95',
      sidebarText: '#FFFFFF',
      background: '#F5F3FF',
      card: '#FFFFFF',
      buttonPrimaryBg: '#7C3AED',
      buttonPrimaryText: '#FFFFFF',
      textMain: '#1E1B4B',
      textMuted: '#3730A3',
      border: '#DDD6FE',
      statusSuccess: '#059669',
      statusWarning: '#D97706',
      statusDanger: '#DC2626',
      statusInfo: '#2563EB',
    },
  },
];

const THEME_IDS = new Set(THEMES.map((theme) => theme.id).concat(['custom']));

export function isValidTheme(value) {
  return typeof value === 'string' && THEME_IDS.has(value);
}

export function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isValidTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function readStoredCustomColors() {
  try {
    const stored = window.localStorage.getItem(THEME_CUSTOM_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Applies the given theme and tokens to document.documentElement.
 */
export function applyThemeToDom(themeId, customColors = null) {
  const root = document.documentElement;
  root.dataset.theme = themeId;

  const preset = THEMES.find((t) => t.id === themeId);
  const colors = customColors || preset?.colors || THEMES[0].colors;

  if (themeId === 'custom' && colors.primary) {
    // Generate dynamic brand ramp for Tailwind classes (brand-50 .. brand-900)
    const ramp = generateBrandRamp(colors.primary);
    Object.entries(ramp).forEach(([level, triplet]) => {
      root.style.setProperty(`--brand-${level}`, triplet);
    });
  } else {
    // Remove inline brand ramp overrides so preset CSS ramps in index.css take effect
    ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'].forEach((level) => {
      root.style.removeProperty(`--brand-${level}`);
    });
  }

  // Apply design token CSS variables
  if (colors.primary) root.style.setProperty('--color-primary', colors.primary);
  if (colors.secondary) root.style.setProperty('--color-secondary', colors.secondary);
  if (colors.accent) root.style.setProperty('--color-accent', colors.accent);
  if (colors.sidebarBg) root.style.setProperty('--color-sidebar-bg', colors.sidebarBg);
  if (colors.sidebarText) root.style.setProperty('--color-sidebar-text', colors.sidebarText);
  if (colors.background) root.style.setProperty('--color-canvas', colors.background);
  if (colors.card) root.style.setProperty('--color-card', colors.card);
  if (colors.textMain) root.style.setProperty('--color-ink', colors.textMain);
  if (colors.textMuted) root.style.setProperty('--color-ink-muted', colors.textMuted);
  if (colors.border) root.style.setProperty('--color-line', colors.border);
  if (colors.buttonPrimaryBg) root.style.setProperty('--color-button-primary-bg', colors.buttonPrimaryBg);
  if (colors.buttonPrimaryText) root.style.setProperty('--color-button-primary-text', colors.buttonPrimaryText);
  if (colors.statusSuccess) root.style.setProperty('--color-success', colors.statusSuccess);
  if (colors.statusWarning) root.style.setProperty('--color-warning', colors.statusWarning);
  if (colors.statusDanger) root.style.setProperty('--color-danger', colors.statusDanger);

  // Update mobile browser address bar color
  const meta = document.querySelector('meta[name="theme-color"]');
  const swatch = customColors ? customColors.primary : preset?.swatch;
  if (meta && swatch && typeof swatch === 'string' && swatch.startsWith('#')) {
    meta.setAttribute('content', swatch);
  }
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme);
  const [customColors, setCustomColorsState] = useState(readStoredCustomColors);
  const [activeCompanyId, setActiveCompanyId] = useState(null);

  // Apply on mount and state changes
  useEffect(() => {
    applyThemeToDom(theme, theme === 'custom' ? customColors : null);
  }, [theme, customColors]);

  const setTheme = useCallback((nextThemeId, nextColors = null) => {
    if (!isValidTheme(nextThemeId)) return;
    setThemeState(nextThemeId);

    if (nextThemeId === 'custom' && nextColors) {
      setCustomColorsState(nextColors);
      try {
        window.localStorage.setItem(THEME_CUSTOM_STORAGE_KEY, JSON.stringify(nextColors));
      } catch {
        /* storage unavailable */
      }
    }

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextThemeId);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const previewTheme = useCallback((themeConfig) => {
    if (!themeConfig) return;
    applyThemeToDom(themeConfig.themeId, themeConfig.colors);
  }, []);

  const resetPreview = useCallback(() => {
    applyThemeToDom(theme, theme === 'custom' ? customColors : null);
  }, [theme, customColors]);

  const saveCompanyTheme = useCallback(async (companyId, { themeId, themeName, isCustom, colors }) => {
    const saved = await themeApi.saveCompanyTheme(companyId, {
      themeId,
      themeName,
      isCustom,
      colors,
    });

    setThemeState(saved.themeId);
    if (saved.isCustom || saved.themeId === 'custom') {
      setCustomColorsState(saved.colors);
      try {
        window.localStorage.setItem(THEME_CUSTOM_STORAGE_KEY, JSON.stringify(saved.colors));
      } catch {
        /* noop */
      }
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, saved.themeId);
    } catch {
      /* noop */
    }

    applyThemeToDom(saved.themeId, saved.isCustom ? saved.colors : null);
    return saved;
  }, []);

  const loadThemeForCompany = useCallback(async (companyId) => {
    try {
      const data = await themeApi.getThemeForCompany(companyId || 'global');
      if (data) {
        setThemeState(data.themeId);
        if (data.isCustom || data.themeId === 'custom') {
          setCustomColorsState(data.colors);
        }
        applyThemeToDom(data.themeId, data.isCustom ? data.colors : null);
      }
      return data;
    } catch {
      return null;
    }
  }, []);

  const currentColors = useMemo(() => {
    if (theme === 'custom' && customColors) {
      return customColors;
    }
    const preset = THEMES.find((t) => t.id === theme);
    return preset?.colors || THEMES[0].colors;
  }, [theme, customColors]);

  const value = useMemo(
    () => ({
      theme,
      themes: THEMES,
      customColors,
      currentColors,
      activeCompanyId,
      setActiveCompanyId,
      setTheme,
      previewTheme,
      resetPreview,
      saveCompanyTheme,
      loadThemeForCompany,
    }),
    [
      theme,
      customColors,
      currentColors,
      activeCompanyId,
      setTheme,
      previewTheme,
      resetPreview,
      saveCompanyTheme,
      loadThemeForCompany,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return context;
}

export default ThemeContext;
