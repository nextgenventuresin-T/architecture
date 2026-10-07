/**
 * Color utilities for the Theme Customizer:
 * - Hex/RGB conversion
 * - Continuous 50..900 brand ramp generation for Tailwind CSS variables
 * - Harmonized palette generation
 * - WCAG 2.1 relative luminance and contrast ratio calculation
 * - Auto-contrast optimization
 */

export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 107, g: 63, b: 212 };
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num) || clean.length !== 6) return { r: 107, g: 63, b: 212 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToString(r, g, b) {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
}

function mixRgb(rgb1, rgb2, weight) {
  const w = Math.max(0, Math.min(1, weight));
  return {
    r: Math.round(rgb1.r * (1 - w) + rgb2.r * w),
    g: Math.round(rgb1.g * (1 - w) + rgb2.g * w),
    b: Math.round(rgb1.b * (1 - w) + rgb2.b * w),
  };
}

/**
 * Generates the full 50..900 continuous brand ramp from any primary hex.
 * Outputs RGB triplets ("r g b") expected by Tailwind CSS variables.
 */
export function generateBrandRamp(primaryHex) {
  const base = hexToRgb(primaryHex);
  const white = { r: 255, g: 255, b: 255 };
  const darkNavy = { r: 15, g: 10, b: 35 };

  // Weights chosen to produce clean, accessible ramps matching the default purple scale
  return {
    50: rgbToString(mixRgb(white, base, 0.08).r, mixRgb(white, base, 0.08).g, mixRgb(white, base, 0.08).b),
    100: rgbToString(mixRgb(white, base, 0.16).r, mixRgb(white, base, 0.16).g, mixRgb(white, base, 0.16).b),
    200: rgbToString(mixRgb(white, base, 0.30).r, mixRgb(white, base, 0.30).g, mixRgb(white, base, 0.30).b),
    300: rgbToString(mixRgb(white, base, 0.50).r, mixRgb(white, base, 0.50).g, mixRgb(white, base, 0.50).b),
    400: rgbToString(mixRgb(white, base, 0.75).r, mixRgb(white, base, 0.75).g, mixRgb(white, base, 0.75).b),
    500: rgbToString(mixRgb(white, base, 0.90).r, mixRgb(white, base, 0.90).g, mixRgb(white, base, 0.90).b),
    600: rgbToString(base.r, base.g, base.b),
    700: rgbToString(mixRgb(base, darkNavy, 0.18).r, mixRgb(base, darkNavy, 0.18).g, mixRgb(base, darkNavy, 0.18).b),
    800: rgbToString(mixRgb(base, darkNavy, 0.38).r, mixRgb(base, darkNavy, 0.38).g, mixRgb(base, darkNavy, 0.38).b),
    900: rgbToString(mixRgb(base, darkNavy, 0.58).r, mixRgb(base, darkNavy, 0.58).g, mixRgb(base, darkNavy, 0.58).b),
  };
}

/**
 * Computes WCAG 2.1 relative luminance for a given hex color.
 */
export function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * Calculates WCAG 2.1 contrast ratio between two colors (returns between 1.0 and 21.0).
 */
export function getContrastRatio(fgHex, bgHex) {
  const lum1 = getLuminance(fgHex);
  const lum2 = getLuminance(bgHex);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}

/**
 * Evaluates accessibility contrast across critical theme pairings.
 */
export function evaluateContrast(colors) {
  if (!colors) return [];
  const checks = [
    {
      label: 'Main Body Text on Card Surface',
      fg: colors.textMain || '#1C1731',
      bg: colors.card || '#FFFFFF',
      minRatio: 4.5,
    },
    {
      label: 'Muted Text on Card Surface',
      fg: colors.textMuted || '#3A3552',
      bg: colors.card || '#FFFFFF',
      minRatio: 3.0,
    },
    {
      label: 'Primary Button Text on Button Background',
      fg: colors.buttonPrimaryText || '#FFFFFF',
      bg: colors.buttonPrimaryBg || colors.primary || '#6B3FD4',
      minRatio: 4.5,
    },
    {
      label: 'Sidebar Navigation Text on Sidebar Background',
      fg: colors.sidebarText || '#FFFFFF',
      bg: colors.sidebarBg || '#4A2992',
      minRatio: 4.5,
    },
    {
      label: 'Main Text on Background Canvas',
      fg: colors.textMain || '#1C1731',
      bg: colors.background || '#F7F5FC',
      minRatio: 4.5,
    },
  ];

  return checks.map((check) => {
    const ratio = getContrastRatio(check.fg, check.bg);
    const passes = ratio >= check.minRatio;
    return {
      ...check,
      ratio,
      passes,
      level: ratio >= 7.0 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3.0 ? 'AA Large' : 'Fail',
    };
  });
}

/**
 * Auto-adjusts low-contrast foreground colors against background surfaces.
 */
export function autoFixContrast(colors) {
  const updated = { ...colors };

  // Button text
  const btnRatio = getContrastRatio(updated.buttonPrimaryText, updated.buttonPrimaryBg || updated.primary);
  if (btnRatio < 4.5) {
    const whiteRatio = getContrastRatio('#FFFFFF', updated.buttonPrimaryBg || updated.primary);
    const blackRatio = getContrastRatio('#0F172A', updated.buttonPrimaryBg || updated.primary);
    updated.buttonPrimaryText = whiteRatio >= blackRatio ? '#FFFFFF' : '#0F172A';
  }

  // Sidebar text
  const sbRatio = getContrastRatio(updated.sidebarText, updated.sidebarBg);
  if (sbRatio < 4.5) {
    const whiteRatio = getContrastRatio('#FFFFFF', updated.sidebarBg);
    const blackRatio = getContrastRatio('#0F172A', updated.sidebarBg);
    updated.sidebarText = whiteRatio >= blackRatio ? '#FFFFFF' : '#0F172A';
  }

  // Text on card
  const textCardRatio = getContrastRatio(updated.textMain, updated.card);
  if (textCardRatio < 4.5) {
    const bgLum = getLuminance(updated.card);
    updated.textMain = bgLum > 0.5 ? '#0F172A' : '#F8FAFC';
    updated.textMuted = bgLum > 0.5 ? '#334155' : '#CBD5E1';
  }

  return updated;
}

/**
 * Generates a complete, aesthetically harmonized palette from any primary color.
 */
export function generateHarmonizedPalette(primaryHex) {
  const base = hexToRgb(primaryHex);
  const ramp = generateBrandRamp(primaryHex);

  // Parse ramp values to hex
  const rampHex = (key) => {
    const [r, g, b] = (ramp[key] || '107 63 212').split(' ').map(Number);
    return rgbToHex(r, g, b);
  };

  const bgHex = rampHex('50');
  const sidebarBgHex = rampHex('800');
  const borderHex = rampHex('200');

  // Choose high-contrast button text
  const whiteRatio = getContrastRatio('#FFFFFF', primaryHex);
  const btnText = whiteRatio >= 4.5 ? '#FFFFFF' : '#0F172A';

  return {
    primary: primaryHex,
    secondary: rampHex('500'),
    accent: '#F59E0B',
    sidebarBg: sidebarBgHex,
    sidebarText: '#FFFFFF',
    background: bgHex,
    card: '#FFFFFF',
    buttonPrimaryBg: primaryHex,
    buttonPrimaryText: btnText,
    textMain: '#1C1731',
    textMuted: '#3A3552',
    border: borderHex,
    statusSuccess: '#059669',
    statusWarning: '#D97706',
    statusDanger: '#B32424',
    statusInfo: '#2563EB',
  };
}
