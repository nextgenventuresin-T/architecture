import { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { PERMISSION_ACTIONS, moduleLabel } from '../../utils/userOptions';

/**
 * Module x action grid for one role.
 *
 * Rows and columns are built from the `permissions` table the API returns —
 * nothing about the grid is hardcoded, so adding a module to the catalogue
 * makes it appear here without a frontend change.
 *
 * The Administrator role renders read-only: the API refuses to edit a system
 * role, and showing editable checkboxes that always fail would be dishonest.
 */
export default function PermissionMatrix({ modules, role, granted, onSave, isSaving }) {
  const [selected, setSelected] = useState(() => new Set(granted));
  const [dirty, setDirty] = useState(false);

  const isSystem = role?.isSystem;

  function toggle(permissionId) {
    if (isSystem) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
    setDirty(true);
  }

  /** Selects or clears every action in a module row at once. */
  function toggleRow(actions) {
    if (isSystem) return;
    const ids = actions.map((a) => a.id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((current) => {
      const next = new Set(current);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
    setDirty(true);
  }

  function reset() {
    setSelected(new Set(granted));
    setDirty(false);
  }

  return (
    <div>
      {isSystem && (
        <Alert tone="info" className="mb-4">
          The Administrator role always holds every permission and cannot be edited. This protects the
          ERP from being left with nobody able to administer it.
        </Alert>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-ink-subtle">
                Module
              </th>
              {PERMISSION_ACTIONS.map((action) => (
                <th
                  key={action.value}
                  className="px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-ink-subtle"
                >
                  {action.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {modules.map(({ module, actions }) => (
              <tr key={module} className="hover:bg-canvas/50">
                <th scope="row" className="px-4 py-2 text-left font-medium text-ink">
                  <button
                    type="button"
                    onClick={() => toggleRow(actions)}
                    disabled={isSystem}
                    className="text-left hover:text-brand-700 disabled:cursor-default disabled:hover:text-ink"
                    title={isSystem ? undefined : 'Toggle the whole row'}
                  >
                    {moduleLabel(module)}
                  </button>
                </th>
                {PERMISSION_ACTIONS.map((action) => {
                  const permission = actions.find((a) => a.action === action.value);
                  if (!permission) {
                    return <td key={action.value} className="px-3 py-2 text-center text-ink-subtle">—</td>;
                  }
                  const isOn = isSystem || selected.has(permission.id);
                  return (
                    <td key={action.value} className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(permission.id)}
                        disabled={isSystem}
                        aria-pressed={isOn}
                        aria-label={`${permission.label} for ${role?.name}`}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
                          isOn
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-line bg-white text-transparent hover:border-brand-300'
                        } ${isSystem ? 'cursor-default opacity-80' : ''}`}
                      >
                        {isSystem ? <Lock className="h-3 w-3" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isSystem && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {dirty && <span className="mr-auto text-sm text-ink-muted">You have unsaved permission changes.</span>}
          <Button variant="secondary" onClick={reset} disabled={!dirty || isSaving}>Reset</Button>
          <Button
            onClick={() => onSave([...selected]).then(() => setDirty(false))}
            disabled={!dirty}
            isLoading={isSaving}
            loadingText="Saving…"
          >
            Save permissions
          </Button>
        </div>
      )}
    </div>
  );
}
