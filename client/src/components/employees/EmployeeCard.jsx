import { Eye, Pencil, Building2, MapPin, Briefcase, UserCheck, Star, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import {
  EMPLOYEE_STATUS_LABELS,
  EMPLOYEE_STATUS_TONE,
  EMPLOYEE_TYPE_LABELS,
} from '../../utils/employeeOptions';
import { formatDate } from '../../utils/format';

/** Work mode badge tones */
const WORK_MODE_CONFIG = {
  office: { label: 'Office', tone: 'neutral' },
  wfh: { label: 'WFH', tone: 'brand' },
  hybrid: { label: 'Hybrid', tone: 'info' },
  site: { label: 'On-Site', tone: 'warning' },
  remote: { label: 'Remote', tone: 'brand' },
};

export default function EmployeeCard({
  employee,
  onQuickView,
  onAssign,
  navigate,
}) {
  const initials = (employee.fullName || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const workModeInfo = WORK_MODE_CONFIG[employee.workMode] || {
    label: employee.workMode,
    tone: 'neutral',
  };

  const keySkills = (employee.skills || []).slice(0, 4);
  const remainingSkillsCount = (employee.skills || []).length - keySkills.length;

  return (
    <div className="group relative flex flex-col justify-between rounded-2xl border border-line bg-white p-5 shadow-xs transition-all hover:border-brand-300 hover:shadow-md">
      {/* Smart Search Match Highlight Pill (Feature 26) */}
      {employee.matchedAttributes && employee.matchedAttributes.length > 0 && (
        <div className="mb-3.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-1.5 text-xs text-amber-900">
          <Sparkles className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <span className="font-semibold text-amber-800">Matched:</span>
          {employee.matchedAttributes.slice(0, 2).map((m, idx) => (
            <span
              key={idx}
              className="inline-flex items-center rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200 shadow-2xs"
            >
              {m.label}
            </span>
          ))}
          {employee.matchedAttributes.length > 2 && (
            <span className="text-[11px] text-amber-700 font-medium">
              +{employee.matchedAttributes.length - 2} more
            </span>
          )}
        </div>
      )}

      {/* Card Header: Avatar, Name, Code, Status */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {employee.avatarUrl ? (
              <img
                src={employee.avatarUrl}
                alt={employee.fullName}
                className="h-12 w-12 rounded-full border border-line object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-bold text-white shadow-xs">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => onQuickView(employee)}
                className="text-left font-bold text-ink hover:text-brand-700 transition-colors line-clamp-1 text-sm sm:text-base"
              >
                {employee.fullName}
              </button>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <span className="font-mono text-xs font-semibold text-brand-800 bg-brand-50 px-1.5 py-0.5 rounded border border-brand-100">
                  {employee.employeeCode}
                </span>
                {employee.department && (
                  <span className="rounded-md bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                    {employee.department}
                  </span>
                )}
              </div>
            </div>
          </div>

          <Badge tone={EMPLOYEE_STATUS_TONE[employee.status] ?? 'neutral'} size="sm">
            {EMPLOYEE_STATUS_LABELS[employee.status] ?? employee.status}
          </Badge>
        </div>

        {/* Role & Engagement */}
        <div className="mt-3.5 space-y-1">
          <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-brand-600 shrink-0" />
            <span>{employee.designation}</span>
            <span className="text-ink-subtle font-normal">
              · {EMPLOYEE_TYPE_LABELS[employee.employeeType] ?? employee.employeeType}
            </span>
          </p>

          {/* Reporting Manager */}
          {employee.reportingManager && (
            <div className="space-y-0.5">
              <p className="text-xs text-ink-muted flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                <span>
                  Reports to: <strong className="text-ink">{employee.reportingManager.name}</strong>
                </span>
              </p>
              {employee.managersManager && (
                <p className="text-[11px] text-ink-subtle pl-5">
                  ↳ Mgr's Mgr: <span className="text-ink-muted font-medium">{employee.managersManager.name}</span>
                </p>
              )}
            </div>
          )}

          {/* Location & Work Mode */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-ink-subtle">
            {employee.workLocation && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-ink-subtle" />
                {employee.workLocation}
              </span>
            )}
            <Badge tone={workModeInfo.tone} size="sm" className="text-[10px] py-0 px-1.5">
              {workModeInfo.label}
            </Badge>
          </div>
        </div>

        {/* Key Skills Section with Stars */}
        <div className="mt-4 border-t border-line/80 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle mb-1.5">
            Key Skills
          </p>
          {keySkills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {keySkills.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1 rounded-lg border border-line bg-canvas-subtle/60 px-2 py-0.5 text-xs text-ink transition-colors hover:bg-canvas"
                >
                  <span className="font-medium">{s.skillName}</span>
                  <div className="flex items-center text-amber-500 text-[10px]">
                    <Star className="h-2.5 w-2.5 fill-current text-amber-400" />
                    <span className="font-bold text-[10px] text-amber-700 ml-0.5">{s.proficiency}</span>
                  </div>
                </div>
              ))}
              {remainingSkillsCount > 0 && (
                <span className="rounded-lg border border-dashed border-line px-2 py-0.5 text-[11px] font-medium text-ink-subtle">
                  +{remainingSkillsCount} more
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs italic text-ink-subtle">No skills listed</span>
          )}
        </div>

        {/* Experience & Assignment stats */}
        <div className="mt-3.5 flex items-center justify-between text-xs text-ink-muted border-t border-line/60 pt-2.5">
          <span>
            {employee.experienceYears > 0 ? `${employee.experienceYears} yrs exp` : 'Fresher'}
            {employee.joiningDate && ` · Joined ${formatDate(employee.joiningDate)}`}
          </span>
          <span className="font-medium text-brand-700">
            {employee.stats?.projectCount || 0} project{employee.stats?.projectCount === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Card Actions Footer */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onQuickView(employee)}
          className="gap-1.5 text-xs font-semibold flex-1 justify-center"
        >
          <Eye className="h-3.5 w-3.5" />
          Quick View
        </Button>

        <Link to={`/admin/employees/${employee.id}`} className="flex-1">
          <Button variant="ghost" size="sm" className="w-full text-xs text-brand-700 hover:bg-brand-50">
            360° Profile
          </Button>
        </Link>

        <button
          type="button"
          onClick={() => navigate(`/admin/employees/${employee.id}/edit`)}
          className="rounded-lg p-1.5 text-ink-subtle hover:bg-canvas hover:text-ink transition-colors border border-line"
          title="Edit Employee"
          aria-label={`Edit ${employee.fullName}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onAssign(employee)}
          className="rounded-lg p-1.5 text-brand-700 bg-brand-50 hover:bg-brand-100 transition-colors border border-brand-200"
          title="Assign Project/Site"
          aria-label={`Assign ${employee.fullName}`}
        >
          <Building2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
