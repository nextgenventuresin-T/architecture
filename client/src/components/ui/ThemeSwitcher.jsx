import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Palette, Sliders } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/**
 * Compact theme picker shown at the top of the ERP. Lets the user switch the
 * accent theme at any time; the choice persists (localStorage, handled by
 * ThemeProvider). Same dropdown/click-outside pattern as ProfileMenu.
 *
 * `tone`:
 *   'default' — dark trigger for a light surface (admin Topbar)
 *   'light'   — white trigger for the coloured role-workspace rail
 */
export default function ThemeSwitcher({ tone = 'default' }) {
  const { theme, setTheme, themes, currentColors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointer = (event) => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const active =
    theme === 'custom'
      ? { id: 'custom', label: 'Custom Theme', swatch: currentColors?.primary || '#6B3FD4' }
      : themes.find((t) => t.id === theme) || themes[0];

  const triggerClass =
    tone === 'light'
      ? 'flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50'
      : 'flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Theme: ${active?.label ?? 'default'}. Change theme`}
        title="Change theme"
        className={triggerClass}
      >
        <Palette className="h-[18px] w-[18px]" aria-hidden="true" />
        <span
          className="h-4 w-4 shrink-0 rounded-full border border-black/10 shadow-sm"
          style={{ background: active?.swatch }}
          aria-hidden="true"
        />
        <span className="hidden sm:block">{active?.label}</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-card"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Theme
          </p>
          {themes.map((t) => {
            const isActive = t.id === theme;
            return (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  setTheme(t.id);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  isActive ? 'bg-canvas text-ink' : 'text-ink-muted hover:bg-canvas hover:text-ink'
                }`}
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                  style={{ background: t.swatch }}
                  aria-hidden="true"
                />
                <span className="flex-1 text-left">{t.label}</span>
                {isActive && <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />}
              </button>
            );
          })}
          <div className="mt-1 border-t border-line pt-1">
            <Link
              to="/admin/settings"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-brand-600 hover:bg-canvas transition-colors"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Customize Colors...</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
