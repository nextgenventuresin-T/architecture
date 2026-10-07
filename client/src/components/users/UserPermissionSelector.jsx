import { useMemo, useState } from 'react';
import { Check, Search, RotateCcw, CheckSquare, Square, Shield, ShieldCheck, Sparkles } from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { PERMISSION_ACTIONS, moduleLabel } from '../../utils/userOptions';

/**
 * Granular individual permissions selector for adding and editing users.
 * Allows administrators to select/deselect individual permissions (view, create, edit, delete, approve)
 * across all 15 modules. Pre-populates from the selected role with one-click Select All,
 * Clear All, and Reset to Role Defaults.
 */
export default function UserPermissionSelector({
  modules = [],
  permissions = [],
  selectedIds = new Set(),
  onChange,
  roleName = '',
  roleDefaultIds = [],
}) {
  const [search, setSearch] = useState('');

  // Total available permissions
  const totalCount = permissions.length;
  const selectedCount = selectedIds instanceof Set ? selectedIds.size : (selectedIds?.length || 0);

  // Determine if current selection matches role defaults
  const isMatchingRoleDefaults = useMemo(() => {
    if (!roleDefaultIds) return false;
    const defaultSet = new Set(roleDefaultIds);
    if (defaultSet.size !== selectedCount) return false;
    for (const id of selectedIds) {
      if (!defaultSet.has(id)) return false;
    }
    return true;
  }, [roleDefaultIds, selectedIds, selectedCount]);

  // Filter modules based on search query
  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return modules;
    return modules.filter(({ module, actions }) => {
      const label = moduleLabel(module).toLowerCase();
      if (label.includes(q) || module.toLowerCase().includes(q)) return true;
      return actions.some((a) => (a.label || '').toLowerCase().includes(q) || a.action.toLowerCase().includes(q));
    });
  }, [modules, search]);

  function togglePermission(permissionId) {
    const next = new Set(selectedIds);
    if (next.has(permissionId)) {
      next.delete(permissionId);
    } else {
      next.add(permissionId);
    }
    onChange(next);
  }

  function toggleModuleRow(actions) {
    const next = new Set(selectedIds);
    const rowIds = actions.map((a) => a.id);
    const allSelected = rowIds.every((id) => next.has(id));

    rowIds.forEach((id) => {
      if (allSelected) {
        next.delete(id);
      } else {
        next.add(id);
      }
    });

    onChange(next);
  }

  function selectAll() {
    const next = new Set(permissions.map((p) => p.id));
    onChange(next);
  }

  function clearAll() {
    onChange(new Set());
  }

  function resetToRoleDefaults() {
    onChange(new Set(roleDefaultIds || []));
  }

  return (
    <div className="space-y-4">
      {/* Header & Status Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <h3 className="font-display text-base font-semibold text-ink">
              Individual Permissions &amp; Privileges
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">
            Customize individual permissions across all modules for this user. Roles pre-fill standard defaults.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={selectedCount > 0 ? 'brand' : 'neutral'}>
            {selectedCount} of {totalCount} permissions granted
          </Badge>
          {isMatchingRoleDefaults ? (
            <Badge tone="positive">Standard {roleName || 'Role'} Defaults</Badge>
          ) : (
            <Badge tone="warning">Custom Permissions</Badge>
          )}
        </div>
      </div>

      {/* Toolbar: Search & Action Buttons */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-line bg-canvas/60 p-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter modules (e.g. projects, warehouse)…"
            className="w-full rounded-lg border border-line bg-white py-1.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-subtle hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>

        {/* Quick Batch Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={selectAll}
            title="Grant all 75 permissions"
          >
            <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
            Select All
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={clearAll}
            title="Clear all permissions"
          >
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            Clear All
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={resetToRoleDefaults}
            title={`Reset back to default permissions for ${roleName || 'selected role'}`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset to {roleName || 'Role'} Defaults
          </Button>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-xs">
        <table className="w-full min-w-[660px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas/70">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                Module
              </th>
              {PERMISSION_ACTIONS.map((action) => (
                <th
                  key={action.value}
                  className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-ink-subtle"
                >
                  {action.label}
                </th>
              ))}
              <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                Row Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredModules.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-muted">
                  No modules match your filter &ldquo;{search}&rdquo;.
                </td>
              </tr>
            ) : (
              filteredModules.map(({ module, actions }) => {
                const rowIds = actions.map((a) => a.id);
                const isAllRowSelected = rowIds.length > 0 && rowIds.every((id) => selectedIds.has(id));
                const isPartiallySelected = !isAllRowSelected && rowIds.some((id) => selectedIds.has(id));

                return (
                  <tr
                    key={module}
                    className={`transition-colors hover:bg-canvas/50 ${
                      isAllRowSelected ? 'bg-brand-50/20' : ''
                    }`}
                  >
                    {/* Module Title */}
                    <td className="px-4 py-2.5 font-medium text-ink">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleModuleRow(actions)}
                          className="text-left font-medium text-ink hover:text-brand-700 hover:underline"
                          title="Click to toggle entire module"
                        >
                          {moduleLabel(module)}
                        </button>
                        <span className="text-xs text-ink-subtle">({actions.length})</span>
                      </div>
                    </td>

                    {/* 5 Permission Actions */}
                    {PERMISSION_ACTIONS.map((actionCol) => {
                      const permission = actions.find((a) => a.action === actionCol.value);
                      if (!permission) {
                        return (
                          <td key={actionCol.value} className="px-3 py-2.5 text-center text-ink-subtle">
                            —
                          </td>
                        );
                      }

                      const isOn = selectedIds.has(permission.id);

                      return (
                        <td key={actionCol.value} className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => togglePermission(permission.id)}
                            aria-pressed={isOn}
                            title={`${permission.label} (${moduleLabel(module)})`}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition-all ${
                              isOn
                                ? 'border-brand-600 bg-brand-600 text-white shadow-xs hover:bg-brand-700'
                                : 'border-line bg-white text-transparent hover:border-brand-400 hover:bg-brand-50/30'
                            }`}
                          >
                            <Check
                              className={`h-3.5 w-3.5 stroke-[2.5] ${isOn ? 'opacity-100' : 'opacity-0'}`}
                              aria-hidden="true"
                            />
                          </button>
                        </td>
                      );
                    })}

                    {/* Quick Row Toggle Button */}
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => toggleModuleRow(actions)}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                          isAllRowSelected
                            ? 'bg-ink-subtle/15 text-ink hover:bg-ink-subtle/25'
                            : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                        }`}
                        title={isAllRowSelected ? 'Deselect all in row' : 'Select all in row'}
                      >
                        {isAllRowSelected ? 'Clear Row' : isPartiallySelected ? 'Select Rest' : 'Select All'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
