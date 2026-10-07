import { NavLink } from 'react-router-dom';
import { X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Logo from '../ui/Logo';
import { ADMIN_NAV } from '../../config/navigation';

/**
 * Module navigation. One component serves both breakpoints: a fixed rail on
 * desktop and an off-canvas drawer on mobile, so the link list is defined once.
 */
export default function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse, counts = {} }) {
  return (
    <>
      {/* Mobile scrim */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-ink/30 transition-opacity duration-200 lg:hidden ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={[
          'app-sidebar fixed inset-y-0 left-0 z-40 flex flex-col border-r border-brand-900/30',
          'transition-[transform,width] duration-200 ease-out',
          isCollapsed ? 'w-[76px]' : 'w-[264px]',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
        ].join(' ')}
        aria-label="Main navigation"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4 text-white">
          {isCollapsed ? <Logo size={32} tone="light" /> : <Logo size={32} tone="light" withWordmark />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {ADMIN_NAV.map(({ label, path, icon: Icon, end, badgeKey }) => {
            const count = badgeKey ? counts[badgeKey] : 0;

            return (
              <NavLink
                key={path}
                to={path}
                end={end}
                onClick={onClose}
                title={isCollapsed ? label : undefined}
                className={({ isActive }) =>
                  [
                    'sidebar-link group relative',
                    isCollapsed ? 'justify-center' : '',
                    isActive ? 'sidebar-link-active' : '',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active marker doubles as the only decoration in the rail */}
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 h-5 w-1 rounded-r-full bg-white transition-opacity ${
                        isActive ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    {!isCollapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
                    {!isCollapsed && count > 0 && (
                      <span className="sidebar-badge">
                        {count}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`hidden w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white lg:flex ${
              isCollapsed ? 'justify-center' : ''
            }`}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" />
                <span>Collapse menu</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
