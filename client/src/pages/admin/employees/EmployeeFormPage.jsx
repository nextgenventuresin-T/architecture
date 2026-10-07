import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Save, X, Plus, Trash2, Star, Sparkles, UserCheck, ShieldCheck, Target } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import { InputField, SelectField, TextAreaField } from '../../../components/ui/Field';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import useAsync from '../../../hooks/useAsync';
import { employeesApi } from '../../../api/employeesApi';
import { toApiError } from '../../../api/axiosClient';
import { EMPLOYEE_STATUSES, EMPLOYEE_TYPES } from '../../../utils/employeeOptions';

const WORK_MODE_OPTIONS = [
  { value: 'office', label: 'Office' },
  { value: 'wfh', label: 'Work From Home (WFH)' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'site', label: 'On-Site' },
  { value: 'remote', label: 'Full Remote' },
];

const AVAILABILITY_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy' },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'allocated', label: 'Fully Allocated' },
];

const EMPTY = {
  employee_code: '',
  full_name: '',
  designation: '',
  department: '',
  reporting_manager_id: '',
  employee_type: 'full-time',
  joining_date: '',
  experience_years: '',
  phone: '',
  email: '',
  address: '',
  work_location: '',
  work_mode: 'office',
  status: 'active',
  availability_status: 'available',
  notes: '',
  bio: '',
  interests: '',
  hobbies: '',
  strengths: '',
  development_areas: '',
  career_interests: '',
};

/** Trims a date coming back from the API down to the yyyy-mm-dd an input needs. */
const toDateInput = (value) => (value ? String(value).slice(0, 10) : '');

/** Converts an array or string into comma-separated text for simple multi-entry */
const toCommaSeparated = (val) => {
  if (Array.isArray(val)) return val.join(', ');
  return val || '';
};

export default function EmployeeFormPage({ mode = 'create' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === 'edit';

  const [values, setValues] = useState(EMPTY);
  const [skills, setSkills] = useState([]);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillProficiency, setNewSkillProficiency] = useState(4);
  const [newSkillIsPrimary, setNewSkillIsPrimary] = useState(true);

  const [lookups, setLookups] = useState({
    departments: [],
    designations: [],
    reportingManagers: [],
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load existing employee detail if in edit mode
  const { data: existing, isLoading: loadingEmployee, error: loadError } = useAsync(
    () => (isEdit ? employeesApi.detail(id) : Promise.resolve(null)),
    [isEdit, id]
  );

  // Load lookups for dropdowns
  useEffect(() => {
    let active = true;
    employeesApi.lookups().then((data) => {
      if (!active) return;
      setLookups({
        departments: data.departments || [],
        designations: data.designations || [],
        reportingManagers: data.reportingManagers || [],
      });
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!existing?.employee) return;
    const e = existing.employee;
    const p360 = e.profile360 || {};

    setValues({
      employee_code: e.employeeCode ?? '',
      full_name: e.fullName ?? '',
      designation: e.designation ?? '',
      department: e.department ?? '',
      reporting_manager_id: e.reportingManager?.id ? String(e.reportingManager.id) : '',
      employee_type: e.employeeType ?? 'full-time',
      joining_date: toDateInput(e.joiningDate),
      experience_years: e.experienceYears !== null ? String(e.experienceYears) : '',
      phone: e.phone ?? '',
      email: e.email ?? '',
      address: e.address ?? '',
      work_location: e.workLocation ?? '',
      work_mode: e.workMode ?? 'office',
      status: e.status ?? 'active',
      availability_status: e.availabilityStatus ?? 'available',
      notes: e.notes ?? '',
      bio: p360.bio ?? '',
      interests: toCommaSeparated(p360.interests),
      hobbies: toCommaSeparated(p360.hobbies),
      strengths: toCommaSeparated(p360.strengths),
      development_areas: toCommaSeparated(p360.developmentAreas),
      career_interests: toCommaSeparated(p360.careerInterests),
    });

    setSkills(
      (e.skills || []).map((s) => ({
        skillName: s.skillName,
        proficiency: s.proficiency || 3,
        isPrimary: s.isPrimary ?? true,
      }))
    );
  }, [existing]);

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  };

  function handleAddSkill() {
    if (!newSkillName.trim()) return;
    setSkills((prev) => [
      ...prev,
      {
        skillName: newSkillName.trim(),
        proficiency: Number(newSkillProficiency),
        isPrimary: Boolean(newSkillIsPrimary),
      },
    ]);
    setNewSkillName('');
    setNewSkillProficiency(4);
    setNewSkillIsPrimary(false);
  }

  function handleRemoveSkill(index) {
    setSkills((prev) => prev.filter((_, idx) => idx !== index));
  }

  /** Client-side checks mirror the API rules so mistakes surface immediately. */
  function validate() {
    const errors = {};
    if (!values.full_name.trim()) errors.full_name = 'Enter the employee name.';
    if (!values.designation.trim()) errors.designation = 'Enter a role or designation.';
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (values.joining_date) {
      const joined = new Date(values.joining_date);
      if (Number.isNaN(joined.getTime())) {
        errors.joining_date = 'Enter a valid joining date.';
      } else if (joined > new Date()) {
        errors.joining_date = 'The joining date cannot be in the future.';
      }
    }
    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const parseList = (text) =>
      text
        ? text
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const payload = {
      ...values,
      reporting_manager_id: values.reporting_manager_id ? Number(values.reporting_manager_id) : null,
      experience_years: values.experience_years !== '' ? Number(values.experience_years) : 0,
      skills,
      profile360: {
        bio: values.bio?.trim() || null,
        interests: parseList(values.interests),
        hobbies: parseList(values.hobbies),
        strengths: parseList(values.strengths),
        developmentAreas: parseList(values.development_areas),
        careerInterests: parseList(values.career_interests),
      },
    };

    for (const key of ['employee_code', 'joining_date', 'phone', 'email', 'address', 'work_location', 'notes']) {
      if (payload[key] === '') payload[key] = null;
    }

    try {
      const saved = isEdit
        ? await employeesApi.update(id, payload)
        : await employeesApi.create(payload);
      navigate(`/admin/employees/${saved.id}`, {
        replace: true,
        state: { flash: isEdit ? 'Employee updated.' : 'Employee added.' },
      });
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setFormError(apiError);
      setIsSaving(false);
    }
  }

  const isLoading = isEdit && loadingEmployee;
  const cancelTo = isEdit ? `/admin/employees/${id}` : '/admin/employees';

  if (loadError) {
    return (
      <>
        <PageHeader
          title="Edit employee"
          breadcrumbs={[
            { label: 'Dashboard', to: '/admin' },
            { label: 'Employees', to: '/admin/employees' },
            { label: 'Edit' },
          ]}
          showBack
        />
        <Alert tone="error" title="Could not load this employee">{loadError.message}</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit employee' : 'Add employee'}
        description={
          isEdit
            ? 'Update this employee’s details, skills, competencies, and 360° profile.'
            : 'Add someone to the employee directory with their skills and profile.'
        }
        breadcrumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Employees', to: '/admin/employees' },
          ...(isEdit
            ? [{ label: existing?.employee?.fullName ?? 'Employee', to: `/admin/employees/${id}` }]
            : []),
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        showBack
      />

      {formError && <Alert tone="error" title="Could not save" className="mb-4">{formError.message}</Alert>}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {/* SECTION 1: Personal & Contact */}
          <Card>
            <CardHeader title="Personal details" description="Who they are and how to reach them." />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <InputField
                label="Name"
                required
                value={values.full_name}
                onChange={set('full_name')}
                error={fieldErrors.full_name}
                placeholder="Arjun Sharma"
                className="sm:col-span-2"
              />
              <InputField
                label="Employee ID"
                value={values.employee_code}
                onChange={set('employee_code')}
                error={fieldErrors.employee_code}
                placeholder="EMP-0012"
                hint={isEdit ? undefined : 'Leave blank and one will be generated.'}
              />
              <InputField
                label="Contact number"
                type="tel"
                value={values.phone}
                onChange={set('phone')}
                error={fieldErrors.phone}
                placeholder="+91 98111 22334"
              />
              <InputField
                label="Email"
                type="email"
                value={values.email}
                onChange={set('email')}
                error={fieldErrors.email}
                placeholder="arjun.sharma@architecture-erp.com"
              />
              <InputField
                label="Work location"
                value={values.work_location}
                onChange={set('work_location')}
                error={fieldErrors.work_location}
                placeholder="Head Office - Noida / Site Ground"
              />
              <InputField
                label="Postal Address"
                value={values.address}
                onChange={set('address')}
                error={fieldErrors.address}
                placeholder="Sector 62, Noida, UP"
                className="sm:col-span-2"
              />
            </CardBody>
          </Card>

          {/* SECTION 2: Role, Department & Reporting Line */}
          <Card>
            <CardHeader
              title="Employment & Organization"
              description="Department, hierarchy, engagement mode, and standing."
            />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <InputField
                label="Role / designation"
                required
                value={values.designation}
                onChange={set('designation')}
                error={fieldErrors.designation}
                placeholder="Data Analyst / Senior Architect"
                hint="Used by project team pickers and search."
              />

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-1">
                  Department
                </label>
                <input
                  type="text"
                  list="departments-list"
                  value={values.department}
                  onChange={set('department')}
                  placeholder="e.g. IT, HR, Finance, Management, Architecture"
                  className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-brand-500 focus:outline-none"
                />
                <datalist id="departments-list">
                  {lookups.departments.map((d) => (
                    <option key={d} value={d} />
                  ))}
                  <option value="IT" />
                  <option value="HR" />
                  <option value="Finance" />
                  <option value="Management" />
                  <option value="Architecture" />
                  <option value="Engineering" />
                  <option value="Operations" />
                </datalist>
              </div>

              <SelectField
                label="Reporting Manager"
                value={values.reporting_manager_id}
                onChange={set('reporting_manager_id')}
                options={[
                  { value: '', label: 'None (Direct Management)' },
                  ...lookups.reportingManagers
                    .filter((m) => String(m.id) !== String(id))
                    .map((m) => ({
                      value: String(m.id),
                      label: `${m.name} (${m.code})`,
                    })),
                ]}
              />

              <SelectField
                label="Work mode"
                value={values.work_mode}
                onChange={set('work_mode')}
                options={WORK_MODE_OPTIONS}
              />

              <SelectField
                label="Employee type"
                value={values.employee_type}
                onChange={set('employee_type')}
                options={EMPLOYEE_TYPES}
                error={fieldErrors.employee_type}
              />

              <InputField
                label="Total Experience (Years)"
                type="number"
                step="0.5"
                min="0"
                value={values.experience_years}
                onChange={set('experience_years')}
                placeholder="3.5"
              />

              <InputField
                label="Joining date"
                type="date"
                value={values.joining_date}
                onChange={set('joining_date')}
                error={fieldErrors.joining_date}
              />

              <SelectField
                label="Status"
                value={values.status}
                onChange={set('status')}
                options={EMPLOYEE_STATUSES}
                error={fieldErrors.status}
              />

              <SelectField
                label="Availability Status"
                value={values.availability_status}
                onChange={set('availability_status')}
                options={AVAILABILITY_OPTIONS}
              />

              <TextAreaField
                label="Internal admin notes"
                value={values.notes}
                onChange={set('notes')}
                rows={3}
                className="sm:col-span-2"
                placeholder="Internal HR/admin notes about this employee…"
              />
            </CardBody>
          </Card>

          {/* SECTION 3: Skills & Competencies Manager */}
          <Card>
            <CardHeader
              title="Skills & Technical Proficiencies"
              description="Add skills with star ratings (1 to 5) and highlight primary specializations."
            />
            <CardBody className="space-y-4">
              {/* Add Skill Row */}
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-canvas/30 p-3.5">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-ink-subtle mb-1">
                    Skill Name
                  </label>
                  <input
                    type="text"
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    placeholder="e.g. Python, React, Revit, Leadership, AutoCAD…"
                    className="h-9 w-full rounded-lg border border-line bg-white px-3 text-xs text-ink focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <div className="w-36">
                  <label className="block text-xs font-semibold text-ink-subtle mb-1">
                    Proficiency
                  </label>
                  <select
                    value={newSkillProficiency}
                    onChange={(e) => setNewSkillProficiency(Number(e.target.value))}
                    className="h-9 w-full rounded-lg border border-line bg-white px-2.5 text-xs text-ink focus:border-brand-500 focus:outline-none"
                  >
                    <option value={5}>5 Stars (Expert)</option>
                    <option value={4}>4 Stars (Proficient)</option>
                    <option value={3}>3 Stars (Competent)</option>
                    <option value={2}>2 Stars (Intermediate)</option>
                    <option value={1}>1 Star (Beginner)</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={newSkillIsPrimary}
                    onChange={(e) => setNewSkillIsPrimary(e.target.checked)}
                    className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xs font-medium text-ink">Primary Skill</span>
                </label>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleAddSkill}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Add Skill
                </Button>
              </div>

              {/* Skills List */}
              {skills.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {skills.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl border border-line bg-white p-2.5 shadow-2xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-xs text-ink truncate">{s.skillName}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <div className="flex items-center text-amber-500">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-2.5 w-2.5 ${
                                  star <= s.proficiency ? 'fill-current' : 'text-line fill-canvas'
                                }`}
                              />
                            ))}
                          </div>
                          {s.isPrimary && (
                            <span className="text-[10px] text-brand-700 bg-brand-50 px-1 rounded font-bold">
                              Primary
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveSkill(idx)}
                        className="rounded-lg p-1 text-ink-subtle hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-ink-subtle">No skills added yet.</p>
              )}
            </CardBody>
          </Card>

          {/* SECTION 4: Employee 360° Profile Attributes */}
          <Card>
            <CardHeader
              title="Employee 360° Profile Attributes"
              description="Enables powerful People Search by interests, hobbies, strengths, development areas, and career goals."
            />
            <CardBody className="space-y-4">
              <TextAreaField
                label="Professional Summary / Bio"
                value={values.bio}
                onChange={set('bio')}
                rows={3}
                placeholder="High-level background, domain expertise, and career journey…"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  label="Core Strengths (comma-separated)"
                  value={values.strengths}
                  onChange={set('strengths')}
                  placeholder="e.g. Leadership, Analytical Thinking, Client Presentation"
                  hint="Separate multiple strengths with commas."
                />

                <InputField
                  label="Areas for Development (comma-separated)"
                  value={values.development_areas}
                  onChange={set('development_areas')}
                  placeholder="e.g. Public Speaking, BIM Automation, Cloud Architecture"
                  hint="Separate multiple growth areas with commas."
                />

                <InputField
                  label="Career Interests & Ambitions (comma-separated)"
                  value={values.career_interests}
                  onChange={set('career_interests')}
                  placeholder="e.g. Project Management, Chief Architect, Engineering Manager"
                  hint="Matches when filtering by Career Interest."
                />

                <InputField
                  label="Professional Interests (comma-separated)"
                  value={values.interests}
                  onChange={set('interests')}
                  placeholder="e.g. Sustainable Architecture, Green Buildings, Machine Learning"
                  hint="Matches when searching professional interests."
                />

                <InputField
                  label="Hobbies & Personal Interests (comma-separated)"
                  value={values.hobbies}
                  onChange={set('hobbies')}
                  placeholder="e.g. Photography, Cricket, Chess, Sketching"
                  className="sm:col-span-2"
                />
              </div>
            </CardBody>
          </Card>

          {/* Form Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" size="lg" isLoading={isSaving} loadingText="Saving…">
              <Save className="h-4 w-4" aria-hidden="true" />
              {isEdit ? 'Save Employee 360 Changes' : 'Add Employee to Directory'}
            </Button>
            <Link to={cancelTo}>
              <Button type="button" variant="secondary" size="lg">
                <X className="h-4 w-4" aria-hidden="true" />
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      )}
    </>
  );
}
