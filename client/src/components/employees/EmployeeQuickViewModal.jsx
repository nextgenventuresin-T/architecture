import {
  X,
  User,
  Briefcase,
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Star,
  Sparkles,
  TrendingUp,
  Target,
  Heart,
  Smile,
  ShieldCheck,
  ExternalLink,
  Pencil,
  Clock,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import {
  EMPLOYEE_STATUS_LABELS,
  EMPLOYEE_STATUS_TONE,
  EMPLOYEE_TYPE_LABELS,
} from '../../utils/employeeOptions';
import { formatDate } from '../../utils/format';

export default function EmployeeQuickViewModal({ employee, isOpen, onClose }) {
  const navigate = useNavigate();

  if (!isOpen || !employee) return null;

  const initials = (employee.fullName || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const p360 = employee.profile360 || {};
  const skills = employee.skills || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex w-full max-w-2xl flex-col max-h-[92vh] rounded-2xl bg-white shadow-2xl border border-line overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-line bg-canvas px-6 py-4">
          <div className="flex items-center gap-3">
            {employee.avatarUrl ? (
              <img
                src={employee.avatarUrl}
                alt={employee.fullName}
                className="h-10 w-10 rounded-full border border-line object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-bold text-white shadow-xs">
                {initials}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-ink text-base">{employee.fullName}</h3>
                <span className="font-mono text-xs font-semibold text-brand-800 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                  {employee.employeeCode}
                </span>
                <Badge tone={EMPLOYEE_STATUS_TONE[employee.status] ?? 'neutral'} size="sm">
                  {EMPLOYEE_STATUS_LABELS[employee.status] ?? employee.status}
                </Badge>
              </div>
              <p className="text-xs text-ink-muted">
                {employee.designation} · {employee.department || 'General'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-subtle hover:bg-white hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-ink text-xs sm:text-sm">
          {/* Quick Stats Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-line bg-canvas/30 p-3 text-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Experience</p>
              <p className="mt-0.5 font-bold text-ink text-sm">
                {employee.experienceYears > 0 ? `${employee.experienceYears} Years` : 'Fresher'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Work Mode</p>
              <p className="mt-0.5 font-bold text-brand-700 text-sm capitalize">
                {employee.workMode || 'Office'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Availability</p>
              <p className="mt-0.5 font-bold text-emerald-700 text-sm capitalize">
                {employee.availabilityStatus?.replace('_', ' ') || 'Available'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Projects</p>
              <p className="mt-0.5 font-bold text-indigo-700 text-sm">
                {employee.stats?.projectCount || 0} Assigned
              </p>
            </div>
          </div>

          {/* Contact & Reporting Line */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-line p-3.5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-ink-muted">
                <Mail className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                <span className="truncate">{employee.email || 'No email registered'}</span>
              </div>
              <div className="flex items-center gap-2 text-ink-muted">
                <Phone className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                <span>{employee.phone || 'No phone number'}</span>
              </div>
              <div className="flex items-center gap-2 text-ink-muted">
                <MapPin className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                <span>{employee.workLocation || employee.address || 'Headquarters'}</span>
              </div>
            </div>

            <div className="space-y-1.5 sm:border-l sm:border-line sm:pl-3">
              <div className="flex items-center gap-2 text-ink-muted">
                <Calendar className="h-3.5 w-3.5 text-ink-subtle shrink-0" />
                <span>Joined: {employee.joiningDate ? formatDate(employee.joiningDate) : '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-ink-muted">
                <Briefcase className="h-3.5 w-3.5 text-ink-subtle shrink-0" />
                <span>Type: {EMPLOYEE_TYPE_LABELS[employee.employeeType] ?? employee.employeeType}</span>
              </div>
              <div className="flex items-center gap-2 text-ink-muted">
                <User className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                <span>
                  Reports to:{' '}
                  {employee.reportingManager ? (
                    <strong className="text-ink font-semibold">
                      {employee.reportingManager.name}
                      {employee.reportingManager.designation ? ` (${employee.reportingManager.designation})` : ''}
                    </strong>
                  ) : (
                    <span className="text-ink-subtle italic">None (Executive / Management)</span>
                  )}
                </span>
              </div>
              {employee.managersManager && (
                <div className="flex items-center gap-2 text-ink-muted">
                  <User className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                  <span>
                    Manager's Mgr:{' '}
                    <strong className="text-ink font-semibold">
                      {employee.managersManager.name}
                      {employee.managersManager.designation ? ` (${employee.managersManager.designation})` : ''}
                    </strong>
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-ink-muted">
                <Building2 className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                <span>
                  Dept Head / Unit:{' '}
                  <strong className="text-ink font-semibold">
                    {employee.departmentHead?.fullName || employee.department || 'General'}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Bio / Executive Summary */}
          {p360.bio && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle mb-1">Professional Bio</h4>
              <p className="rounded-xl border border-line bg-canvas/20 p-3 text-xs leading-relaxed text-ink">
                {p360.bio}
              </p>
            </div>
          )}

          {/* Skills with Proficiency Rating Stars */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                <Star className="h-4 w-4 text-amber-500 fill-amber-400" />
                Skills & Technical Competencies ({skills.length})
              </h4>
            </div>

            {skills.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {skills.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-line bg-white p-2.5 shadow-2xs"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-xs text-ink">{s.skillName}</span>
                      {s.isPrimary && (
                        <span className="ml-1.5 text-[10px] font-bold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-3 w-3 ${
                            star <= s.proficiency
                              ? 'fill-amber-400 text-amber-500'
                              : 'text-line fill-canvas'
                          }`}
                        />
                      ))}
                      <span className="font-mono text-xs font-bold text-ink ml-1">
                        {s.proficiency}/5
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs italic text-ink-subtle rounded-xl border border-dashed border-line p-3 text-center">
                No skills recorded for this profile yet.
              </p>
            )}
          </div>

          {/* Employee 360° Matrix: Strengths & Growth Areas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Strengths */}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-3.5 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Core Strengths
              </h4>
              {p360.strengths && p360.strengths.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {p360.strengths.map((item, idx) => (
                    <span
                      key={idx}
                      className="rounded-md bg-white border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-900 shadow-2xs"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-ink-subtle">None listed</p>
              )}
            </div>

            {/* Development Areas */}
            <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-3.5 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-amber-600" />
                Areas for Development
              </h4>
              {p360.developmentAreas && p360.developmentAreas.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {p360.developmentAreas.map((item, idx) => (
                    <span
                      key={idx}
                      className="rounded-md bg-white border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900 shadow-2xs"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-ink-subtle">None listed</p>
              )}
            </div>
          </div>

          {/* Employee 360° Matrix: Interests, Hobbies & Career Ambitions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Career Interests */}
            <div className="rounded-xl border border-line p-3 space-y-1.5 bg-canvas/20">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-indigo-600" />
                Career Interests
              </h4>
              {p360.careerInterests && p360.careerInterests.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {p360.careerInterests.map((item, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-white border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-ink-subtle">—</p>
              )}
            </div>

            {/* Professional Interests */}
            <div className="rounded-xl border border-line p-3 space-y-1.5 bg-canvas/20">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5 text-rose-500" />
                Interests
              </h4>
              {p360.interests && p360.interests.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {p360.interests.map((item, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-white border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-ink-subtle">—</p>
              )}
            </div>

            {/* Hobbies */}
            <div className="rounded-xl border border-line p-3 space-y-1.5 bg-canvas/20">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle flex items-center gap-1.5">
                <Smile className="h-3.5 w-3.5 text-amber-500" />
                Hobbies
              </h4>
              {p360.hobbies && p360.hobbies.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {p360.hobbies.map((item, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-white border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-ink-subtle">—</p>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer Bar */}
        <div className="border-t border-line bg-canvas px-6 py-3.5 flex items-center justify-between gap-3">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/admin/employees/${employee.id}/edit`);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-canvas transition-colors shadow-2xs"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Employee
            </button>

            <Link to={`/admin/employees/${employee.id}`} onClick={onClose}>
              <Button className="gap-1.5">
                Open Full 360° Profile
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
