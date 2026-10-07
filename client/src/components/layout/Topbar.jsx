import { Menu, Search, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProfileMenu from './ProfileMenu';
import ThemeSwitcher from '../ui/ThemeSwitcher';

/**
 * Page title, global search, notifications and the profile menu.
 * The title comes from the route rather than each page, so every screen gets
 * one without duplicating markup.
 */
export default function Topbar({ title, onOpenSidebar, searchValue, onSearchChange, notificationCount = 0 }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-canvas hover:text-ink lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-ink lg:flex-none lg:text-xl">
          {title}
        </h1>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <div className="relative hidden md:block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchValue}
              onChange={onSearchChange}
              placeholder="Search projects, contractors…"
              aria-label="Search projects and contractors"
              className="h-9 w-56 rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:bg-white focus:shadow-focus focus:outline-none xl:w-72"
            />
          </div>

          <ThemeSwitcher />

          <Link
            to="/admin/notifications"
            aria-label={`Notifications${notificationCount ? `, ${notificationCount} unread` : ''}`}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
            {notificationCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-brand-600 ring-2 ring-white" />
            )}
          </Link>

          <span className="hidden h-6 w-px bg-line sm:block" />
          <ProfileMenu />
        </div>
      </div>

      {/* Search drops below the title on small screens rather than being hidden */}
      <div className="border-t border-line px-4 py-2.5 md:hidden">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchValue}
            onChange={onSearchChange}
            placeholder="Search projects, contractors…"
            aria-label="Search projects and contractors"
            className="h-9 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:bg-white focus:shadow-focus focus:outline-none"
          />
        </div>
      </div>
    </header>
  );
}
