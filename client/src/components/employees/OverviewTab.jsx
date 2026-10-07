import {
  Phone,
  Mail,
  MapPin,
  CalendarDays,
  BadgeCheck,
  Building2,
  Briefcase,
  UserCheck,
  Star,
  ShieldCheck,
  TrendingUp,
  Target,
  Heart,
  Smile,
  Clock,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge from '../ui/Badge';
import ProgressBar from '../ui/ProgressBar';
import InfoList from '../projects/InfoList';
import { formatDate } from '../../utils/format';
import {
  EMPLOYEE_STATUS_LABELS,
  EMPLOYEE_STATUS_TONE,
  EMPLOYEE_TYPE_LABELS,
} from '../../utils/employeeOptions';

const withIcon = (Icon, value, className = 'text-ink-subtle') =>
  value ? (
    <span className="flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${className}`} aria-hidden="true" />
      {value}
    </span>
  ) : null;

/** Contact details, employment record, 360 profile, and current assignments. */
export default function OverviewTab({ employee }) {
  const { stats, current } = employee;
  const p360 = employee.profile360 || {};
  const skills = employee.skills || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Basic Details & 360 Attributes */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader
              title="Employee details"
              description={`${employee.designation} · ${employee.department || 'General'} · ${EMPLOYEE_TYPE_LABELS[employee.employeeType] ?? employee.employeeType}`}
            />
            <CardBody>
              <InfoList
                columns={2}
                items={[
                  { label: 'Employee ID', value: withIcon(BadgeCheck, employee.employeeCode, 'text-brand-600') },
                  { label: 'Role / Designation', value: employee.designation },
                  { label: 'Department', value: employee.department || '—' },
                  {
                    label: 'Reporting Manager',
                    value: employee.reportingManager ? (
                      withIcon(UserCheck, `${employee.reportingManager.name} (${employee.reportingManager.code})`, 'text-teal-600')
                    ) : (
                      'None (Management)'
                    ),
                  },
                  {
                    label: "Manager's Manager",
                    value: employee.managersManager ? (
                      withIcon(UserCheck, `${employee.managersManager.name} (${employee.managersManager.code || employee.managersManager.designation})`, 'text-indigo-600')
                    ) : (
                      'None'
                    ),
                  },
                  { label: 'Employee type', value: EMPLOYEE_TYPE_LABELS[employee.employeeType] ?? employee.employeeType },
                  {
                    label: 'Experience',
                    value: employee.experienceYears > 0 ? `${employee.experienceYears} Years` : 'Fresher',
                  },
                  { label: 'Joining date', value: withIcon(CalendarDays, employee.joiningDate ? formatDate(employee.joiningDate) : null) },
                  { label: 'Work Mode', value: <span className="capitalize">{employee.workMode || 'Office'}</span> },
                  { label: 'Work Location', value: withIcon(MapPin, employee.workLocation || employee.address) },
                  { label: 'Phone', value: withIcon(Phone, employee.phone) },
                  { label: 'Email', value: withIcon(Mail, employee.email) },
                  {
                    label: 'Status',
                    value: (
                      <Badge tone={EMPLOYEE_STATUS_TONE[employee.status] ?? 'neutral'}>
                        {EMPLOYEE_STATUS_LABELS[employee.status] ?? employee.status}
                      </Badge>
                    ),
                  },
                ]}
              />

              {p360.bio && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="mb-1.5 text-xs uppercase tracking-wide text-ink-subtle font-semibold">
                    Professional Summary & Bio
                  </p>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">
                    {p360.bio}
                  </p>
                </div>
              )}

              {employee.notes && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-1 text-xs uppercase tracking-wide text-ink-subtle font-semibold">Admin Notes</p>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-ink-muted">{employee.notes}</p>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Section: Skills & Competencies */}
          <Card>
            <CardHeader
              title="Skills & Technical Competencies"
              description={`Key qualifications and verified proficiencies (${skills.length})`}
            />
            <CardBody>
              {skills.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {skills.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl border border-line bg-canvas/30 p-3"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-ink">{s.skillName}</span>
                          {s.isPrimary && (
                            <span className="rounded bg-brand-50 border border-brand-200 px-1.5 py-0.2 text-[10px] font-bold text-brand-700">
                              Primary
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-3.5 w-3.5 ${
                              star <= s.proficiency
                                ? 'fill-amber-400 text-amber-500'
                                : 'text-line fill-canvas'
                            }`}
                          />
                        ))}
                        <span className="font-mono text-xs font-bold text-ink ml-1.5">
                          {s.proficiency}/5
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-ink-subtle">No skills recorded for this employee.</p>
              )}
            </CardBody>
          </Card>

          {/* Section: Employee 360° Matrix */}
          <Card>
            <CardHeader
              title="Employee 360° Profile Matrix"
              description="Strengths, developmental focus, career aspirations, and personal interests"
            />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-2">
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
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-2">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {/* Career Interests */}
                <div className="rounded-xl border border-line p-3.5 space-y-2 bg-canvas/30">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                    <Target className="h-4 w-4 text-indigo-600" />
                    Career Interests
                  </h4>
                  {p360.careerInterests && p360.careerInterests.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {p360.careerInterests.map((item, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-white border border-line px-2 py-0.5 text-xs font-medium text-ink"
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
                <div className="rounded-xl border border-line p-3.5 space-y-2 bg-canvas/30">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                    <Heart className="h-4 w-4 text-rose-500" />
                    Interests
                  </h4>
                  {p360.interests && p360.interests.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {p360.interests.map((item, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-white border border-line px-2 py-0.5 text-xs font-medium text-ink"
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
                <div className="rounded-xl border border-line p-3.5 space-y-2 bg-canvas/30">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                    <Smile className="h-4 w-4 text-amber-500" />
                    Hobbies
                  </h4>
                  {p360.hobbies && p360.hobbies.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {p360.hobbies.map((item, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-white border border-line px-2 py-0.5 text-xs font-medium text-ink"
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
            </CardBody>
          </Card>
        </div>

        {/* Right Column: Work, Stats, Progress */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Current posting" />
            <CardBody>
              {current.project || current.site ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Building2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{current.site || current.project}</p>
                      {current.site && current.project && (
                        <p className="mt-0.5 text-xs text-ink-subtle">{current.project}</p>
                      )}
                    </div>
                  </div>
                  {current.role && <Badge tone="brand">{current.role}</Badge>}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">
                  No current posting. Use “Assign” to put this employee on a project or site.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="At a glance" />
            <CardBody className="space-y-5">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="text-ink-muted">Average site progress</span>
                  <span className="tabular-nums text-ink">{stats.progress}%</span>
                </div>
                <ProgressBar value={stats.progress} status="on-track" />
              </div>

              <div className="border-t border-line pt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Assigned projects</span>
                  <span className="font-semibold text-ink">{stats.projectCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Active sites</span>
                  <span className="font-semibold text-ink">{stats.siteCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Labour supervised</span>
                  <span className="font-semibold text-ink">{stats.labourCount}</span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
