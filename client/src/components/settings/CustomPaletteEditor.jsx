import { useState } from 'react';
import { Sparkles, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { generateHarmonizedPalette, evaluateContrast, autoFixContrast } from '../../utils/colorUtils';
import Button from '../ui/Button';

function ColorField({ label, value, onChange, description }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between py-2 border-b border-line last:border-b-0">
      <div>
        <label className="text-sm font-medium text-ink">{label}</label>
        {description && <p className="text-xs text-ink-muted">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded-lg border border-line bg-transparent p-0.5"
          title={`Pick ${label}`}
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-24 rounded-lg border border-line bg-canvas px-2 text-xs font-mono text-ink uppercase focus:outline-none focus:border-brand-500"
        />
      </div>
    </div>
  );
}

export default function CustomPaletteEditor({ colors, onChange, onLivePreview }) {
  const [showContrastModal, setShowContrastModal] = useState(false);

  const handleColorChange = (key, value) => {
    const next = { ...colors, [key]: value };
    onChange(next);
    if (onLivePreview) {
      onLivePreview(next);
    }
  };

  const handleSmartGenerate = () => {
    const harmonized = generateHarmonizedPalette(colors.primary || '#6B3FD4');
    onChange(harmonized);
    if (onLivePreview) onLivePreview(harmonized);
  };

  const handleAutoFix = () => {
    const fixed = autoFixContrast(colors);
    onChange(fixed);
    if (onLivePreview) onLivePreview(fixed);
  };

  const contrastChecks = evaluateContrast(colors);
  const failingCount = contrastChecks.filter((c) => !c.passes).length;

  return (
    <div className="space-y-6">
      {/* Top Helper Tools */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-canvas p-4 border border-line">
        <div>
          <h4 className="text-sm font-semibold text-ink">Smart Theme Tools</h4>
          <p className="text-xs text-ink-muted">
            Auto-generate matching shades or inspect WCAG 2.1 accessibility contrast.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={handleSmartGenerate}
            className="text-xs !h-9"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Generate from Primary</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setShowContrastModal(!showContrastModal)}
            className="text-xs !h-9"
          >
            {failingCount > 0 ? (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            )}
            <span>
              Contrast Check {failingCount > 0 ? `(${failingCount} warning)` : '(All Pass)'}
            </span>
          </Button>
        </div>
      </div>

      {/* Contrast Report Collapsible */}
      {showContrastModal && (
        <div className="rounded-xl border border-line bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink">Readability & Contrast Report</h4>
            {failingCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={handleAutoFix}
                className="text-xs !h-7 text-brand-600"
              >
                Auto-Fix Contrast
              </Button>
            )}
          </div>
          <div className="divide-y divide-line text-xs">
            {contrastChecks.map((chk, idx) => (
              <div key={idx} className="flex items-center justify-between py-2">
                <span className="text-ink-muted">{chk.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{chk.ratio}:1</span>
                  {chk.passes ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> {chk.level}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                      <AlertTriangle className="h-3 w-3" /> Low ({chk.minRatio}:1 min)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grouped Color Pickers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Column 1 */}
        <div className="rounded-xl border border-line bg-card p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Primary & Brand Accents
          </h4>
          <ColorField
            label="Primary Brand Color"
            description="Main brand colour used for primary buttons, active markers, and highlights."
            value={colors.primary}
            onChange={(v) => handleColorChange('primary', v)}
          />
          <ColorField
            label="Secondary Accent"
            description="Secondary highlights and decorative accents."
            value={colors.secondary}
            onChange={(v) => handleColorChange('secondary', v)}
          />
          <ColorField
            label="Accent / Star Color"
            description="Ratings, badges, and attention focus highlights."
            value={colors.accent}
            onChange={(v) => handleColorChange('accent', v)}
          />
        </div>

        {/* Column 2 */}
        <div className="rounded-xl border border-line bg-card p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Sidebar & Navigation
          </h4>
          <ColorField
            label="Sidebar Background"
            description="Left navigation rail background."
            value={colors.sidebarBg}
            onChange={(v) => handleColorChange('sidebarBg', v)}
          />
          <ColorField
            label="Sidebar Text & Icons"
            description="Text and icon colour for navigation entries."
            value={colors.sidebarText}
            onChange={(v) => handleColorChange('sidebarText', v)}
          />
        </div>

        {/* Column 3 */}
        <div className="rounded-xl border border-line bg-card p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Backgrounds & Surfaces
          </h4>
          <ColorField
            label="Canvas Background"
            description="Main app background behind cards and pages."
            value={colors.background}
            onChange={(v) => handleColorChange('background', v)}
          />
          <ColorField
            label="Card / Panel Surface"
            description="Panels, modals, and container surfaces."
            value={colors.card}
            onChange={(v) => handleColorChange('card', v)}
          />
          <ColorField
            label="Borders & Dividers"
            description="Card outlines and table grid lines."
            value={colors.border}
            onChange={(v) => handleColorChange('border', v)}
          />
        </div>

        {/* Column 4 */}
        <div className="rounded-xl border border-line bg-card p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Buttons & Typography
          </h4>
          <ColorField
            label="Primary Button Background"
            description="Call-to-action button surface."
            value={colors.buttonPrimaryBg}
            onChange={(v) => handleColorChange('buttonPrimaryBg', v)}
          />
          <ColorField
            label="Primary Button Text"
            description="Text colour inside primary buttons."
            value={colors.buttonPrimaryText}
            onChange={(v) => handleColorChange('buttonPrimaryText', v)}
          />
          <ColorField
            label="Main Body Text"
            description="Primary typography and headings."
            value={colors.textMain}
            onChange={(v) => handleColorChange('textMain', v)}
          />
          <ColorField
            label="Muted / Secondary Text"
            description="Labels, timestamps, and secondary descriptions."
            value={colors.textMuted}
            onChange={(v) => handleColorChange('textMuted', v)}
          />
        </div>

        {/* Column 5: Status Indicators */}
        <div className="col-span-1 md:col-span-2 rounded-xl border border-line bg-card p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Status & Indicator Colors
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ColorField
              label="Success (On Track / Done)"
              value={colors.statusSuccess}
              onChange={(v) => handleColorChange('statusSuccess', v)}
            />
            <ColorField
              label="Warning (Pending / Attention)"
              value={colors.statusWarning}
              onChange={(v) => handleColorChange('statusWarning', v)}
            />
            <ColorField
              label="Danger (Delayed / Rejected)"
              value={colors.statusDanger}
              onChange={(v) => handleColorChange('statusDanger', v)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
