import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-react';
import useAuth from '../../hooks/useAuth';
import { ROLE_LABELS } from '../../config/roles';

/** Avatar, role indicator and the dropdown holding profile links and sign out. */
export default function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close on outside click or Escape — expected behaviour for a menu.
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

  if (!user) return null;

  const initials = (user.fullName || '?')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-canvas sm:pr-3"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
          {initials}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-sm font-medium leading-tight text-ink">
            {user.fullName}
          </span>
          <span className="block truncate text-xs leading-tight text-brand-700">
            {ROLE_LABELS[user.role] || user.role}
          </span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-ink-subtle sm:block" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-white shadow-card"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-medium text-ink">{user.fullName}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>

          <div className="p-1.5">
            <MenuItem icon={UserRound} onClick={() => { setIsOpen(false); navigate('/admin/settings'); }}>
              My profile
            </MenuItem>
            <MenuItem icon={Settings} onClick={() => { setIsOpen(false); navigate('/admin/settings'); }}>
              Settings
            </MenuItem>
          </div>

          <div className="border-t border-line p-1.5">
            <MenuItem icon={LogOut} tone="danger" onClick={logout}>
              Sign out
            </MenuItem>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, children, onClick, tone = 'default' }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
        tone === 'danger'
          ? 'text-danger hover:bg-danger-soft'
          : 'text-ink-muted hover:bg-canvas hover:text-ink'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}
