import { useState, useEffect } from 'react';
import { Palette, Check, RotateCcw, Save, Building2, Sliders, Eye } from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import CustomPaletteEditor from '../../../components/settings/CustomPaletteEditor';
import ThemeLivePreview from '../../../components/settings/ThemeLivePreview';
import { useTheme, THEMES } from '../../../context/ThemeContext';
import themeApi from '../../../api/themeApi';

export default function SettingsPage() {
  const {
    theme: currentActiveThemeId,
    currentColors,
    previewTheme,
    resetPreview,
    saveCompanyTheme,
    loadThemeForCompany,
  } = useTheme();

  const [clients, setClients] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('global');
  const [paletteMode, setPaletteMode] = useState('presets'); // 'presets' | 'custom'

  const [activeThemeId, setActiveThemeId] = useState(currentActiveThemeId);
  const [customColors, setCustomColors] = useState(currentColors);
  const [isCustom, setIsCustom] = useState(currentActiveThemeId === 'custom');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Load clients and current company theme
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setIsLoading(true);
      try {
        const data = await themeApi.listAllThemes();
        if (cancelled) return;
        if (data?.clients) {
          setClients(data.clients);
        }
      } catch (err) {
        console.error('Failed to load theme data:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  // When selected company changes, load its specific theme
  useEffect(() => {
    let cancelled = false;
    async function fetchCompanyTheme() {
      try {
        const data = await themeApi.getThemeForCompany(selectedCompanyId);
        if (cancelled) return;
        if (data) {
          setActiveThemeId(data.themeId);
          setIsCustom(Boolean(data.isCustom));
          if (data.colors) {
            setCustomColors(data.colors);
          }
          if (data.isCustom) {
            setPaletteMode('custom');
          }
          // Live preview the company's theme
          previewTheme({
            themeId: data.themeId,
            colors: data.colors,
          });
        }
      } catch (err) {
        console.error('Failed to fetch company theme:', err);
      }
    }
    fetchCompanyTheme();
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId, previewTheme]);

  const handleSelectPreset = (preset) => {
    setActiveThemeId(preset.id);
    setIsCustom(false);
    setCustomColors(preset.colors);
    // Instant live preview
    previewTheme({
      themeId: preset.id,
      colors: preset.colors,
    });
  };

  const handleCustomColorsChange = (updatedColors) => {
    setCustomColors(updatedColors);
    setIsCustom(true);
    setActiveThemeId('custom');
    // Instant live preview
    previewTheme({
      themeId: 'custom',
      colors: updatedColors,
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const selectedPreset = THEMES.find((t) => t.id === activeThemeId);
      const themeName = isCustom ? 'Custom Company Theme' : selectedPreset?.label || 'Custom Theme';

      await saveCompanyTheme(selectedCompanyId, {
        themeId: activeThemeId,
        themeName,
        isCustom,
        colors: customColors,
      });

      setFeedback({ type: 'success', message: 'Theme settings saved and applied successfully!' });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save theme settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const reset = await themeApi.resetCompanyTheme(selectedCompanyId);
      if (reset) {
        setActiveThemeId(reset.themeId);
        setIsCustom(Boolean(reset.isCustom));
        setCustomColors(reset.colors);
        previewTheme({
          themeId: reset.themeId,
          colors: reset.colors,
        });
      }
      setFeedback({ type: 'success', message: 'Reset to system default successfully.' });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to reset theme.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPreview = () => {
    resetPreview();
    setFeedback({ type: 'info', message: 'Preview reset to active theme.' });
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Theme & Color Settings</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Customize the ERP color palettes for the whole organization or assign custom brand colors to specific clients.
          </p>
        </div>

        {/* Global / Company Selector */}
        <div className="flex items-center gap-2 rounded-xl border border-line bg-card p-2 shadow-xs">
          <Building2 className="h-4 w-4 text-ink-subtle ml-1 shrink-0" />
          <span className="text-xs font-semibold text-ink-muted whitespace-nowrap">Configure for:</span>
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="h-8 rounded-lg border border-line bg-canvas px-2.5 text-xs font-medium text-ink focus:outline-none focus:border-brand-500"
          >
            <option value="global">🏢 Global Organization (Default)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                Client: {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : feedback.type === 'error'
              ? 'bg-danger-soft text-danger border-danger/25'
              : 'bg-canvas text-ink-muted border-line'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-bold uppercase hover:opacity-75"
          >
            ✕
          </button>
        </div>
      )}

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <button
          type="button"
          onClick={() => setPaletteMode('presets')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            paletteMode === 'presets'
              ? 'bg-brand-50 text-brand-700 border border-brand-200'
              : 'text-ink-muted hover:bg-canvas hover:text-ink'
          }`}
        >
          <Palette className="h-4 w-4" />
          <span>Ready-Made Palettes</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setPaletteMode('custom');
            setIsCustom(true);
            setActiveThemeId('custom');
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            paletteMode === 'custom'
              ? 'bg-brand-50 text-brand-700 border border-brand-200'
              : 'text-ink-muted hover:bg-canvas hover:text-ink'
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Custom Palette Builder</span>
        </button>
      </div>

      {/* Main Grid: Selector & Editor on left, Live Preview on right */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Palettes or Custom Editor */}
        <div className="xl:col-span-7 space-y-6">
          {paletteMode === 'presets' ? (
            <Card>
              <CardHeader
                title="Select a Ready-Made Palette"
                description="Pick one of the curated professional color combinations. Click any card to preview it instantly."
              />
              <CardBody>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {THEMES.map((preset) => {
                    const isSelected = activeThemeId === preset.id && !isCustom;
                    return (
                      <div
                        key={preset.id}
                        onClick={() => handleSelectPreset(preset)}
                        className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition duration-150 hover:-translate-y-0.5 hover:shadow-card ${
                          isSelected
                            ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/20'
                            : 'border-line bg-card hover:border-brand-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-semibold text-sm text-ink">{preset.label}</span>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                              <span>Brand & Sidebar:</span>
                              <span
                                className="h-3.5 w-3.5 rounded-full border border-black/10 inline-block shadow-xs"
                                style={{ background: preset.swatch }}
                              />
                            </div>
                          </div>
                          {isSelected && (
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-xs">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                        </div>

                        {/* Palette mini swatches bar */}
                        <div className="mt-4 flex h-3 w-full overflow-hidden rounded-md border border-line">
                          <div className="flex-1" style={{ background: preset.colors.primary }} title="Primary" />
                          <div className="flex-1" style={{ background: preset.colors.secondary }} title="Secondary" />
                          <div className="flex-1" style={{ background: preset.colors.sidebarBg }} title="Sidebar" />
                          <div className="flex-1" style={{ background: preset.colors.background }} title="Background" />
                          <div className="flex-1" style={{ background: preset.colors.accent }} title="Accent" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader
                title="Custom Color Palette Builder"
                description="Fine-tune individual design tokens. Changes update the ERP live as you adjust the pickers."
              />
              <CardBody>
                <CustomPaletteEditor
                  colors={customColors}
                  onChange={handleCustomColorsChange}
                  onLivePreview={(updated) =>
                    previewTheme({
                      themeId: 'custom',
                      colors: updated,
                    })
                  }
                />
              </CardBody>
            </Card>
          )}

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={handleResetPreview}
                className="text-xs"
                title="Revert live preview without saving"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Preview</span>
              </Button>
              {selectedCompanyId !== 'global' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={handleResetToDefault}
                  className="text-xs text-danger"
                  title="Remove client override and revert to global default"
                >
                  <span>Reset to Company Default</span>
                </Button>
              )}
            </div>

            <Button
              type="button"
              variant="primary"
              size="md"
              isLoading={isSaving}
              onClick={handleSave}
            >
              <Save className="h-4 w-4" />
              <span>Save Theme Settings</span>
            </Button>
          </div>
        </div>

        {/* Right Column: Real-Time Preview Component */}
        <div className="xl:col-span-5 sticky top-20">
          <ThemeLivePreview />
        </div>
      </div>
    </div>
  );
}
