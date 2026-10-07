'use strict';

const { pool } = require('../config/db');

/**
 * Read/write access for employees and the roll-ups the Employee Management
 * screens need (assigned projects/sites, current work, labour).
 *
 * Nothing here changes how Interface 3 reads `employees` — lookupModel still
 * uses `SELECT id, full_name, designation FROM employees WHERE is_active = 1`,
 * and projects/sites keep their own team foreign keys.
 */

/**
 * Every project/site an employee is connected to, from BOTH sources:
 *  - the three team roles Interface 3 stores on `projects`
 *  - the site engineer Interface 3 stores on `sites`
 *  - explicit postings in `employee_assignments` (Interface 5)
 * Counted with DISTINCT downstream so holding a role AND an explicit
 * assignment on the same project is not double counted.
 */
const WORK_UNION = `
  SELECT p.project_manager_id AS emp_id, p.id AS project_id, CAST(NULL AS UNSIGNED) AS site_id
    FROM projects p WHERE p.is_archived = 0 AND p.project_manager_id IS NOT NULL
  UNION ALL
  SELECT p.architect_id, p.id, CAST(NULL AS UNSIGNED)
    FROM projects p WHERE p.is_archived = 0 AND p.architect_id IS NOT NULL
  UNION ALL
  SELECT p.site_engineer_id, p.id, CAST(NULL AS UNSIGNED)
    FROM projects p WHERE p.is_archived = 0 AND p.site_engineer_id IS NOT NULL
  UNION ALL
  SELECT s.site_engineer_id, s.project_id, s.id
    FROM sites s WHERE s.site_engineer_id IS NOT NULL
  UNION ALL
  SELECT a.employee_id, a.project_id, a.site_id
    FROM employee_assignments a WHERE a.is_current = 1
`;

/** Distinct sites an employee works on, used for labour and progress totals. */
const SITE_UNION = `
  SELECT s.site_engineer_id AS emp_id, s.id AS site_id
    FROM sites s WHERE s.site_engineer_id IS NOT NULL
  UNION
  SELECT a.employee_id, a.site_id
    FROM employee_assignments a WHERE a.is_current = 1 AND a.site_id IS NOT NULL
`;

/**
 * Rows inserted by Interface 3's demo seed run after this interface's backfill,
 * so they can still hold a NULL code. Derive a stable display code for those
 * instead of showing a blank Employee ID; saving the employee persists it.
 */
const CODE_EXPR = "COALESCE(e.employee_code, CONCAT('EMP-', LPAD(e.id, 4, '0')))";
const CODE_EXPR_MGR = "COALESCE(mgr.employee_code, CONCAT('EMP-', LPAD(mgr.id, 4, '0')))";
const CODE_EXPR_MGR2 = "COALESCE(mgr2.employee_code, CONCAT('EMP-', LPAD(mgr2.id, 4, '0')))";

const LIST_SELECT = `
  SELECT
    e.id, ${CODE_EXPR} AS employee_code, e.full_name, e.designation, e.department,
    e.reporting_manager_id, mgr.full_name AS reporting_manager_name, ${CODE_EXPR_MGR} AS reporting_manager_code, mgr.designation AS reporting_manager_designation,
    mgr.reporting_manager_id AS managers_manager_id, mgr2.full_name AS managers_manager_name, ${CODE_EXPR_MGR2} AS managers_manager_code, mgr2.designation AS managers_manager_designation,
    e.employee_type, e.joining_date, e.experience_years, e.email, e.phone, e.address,
    e.work_location, e.work_mode, e.status, e.availability_status, e.avatar_url, e.notes,
    e.is_active, e.user_id, e.created_at,
    COALESCE(work.project_total, 0) AS project_count,
    COALESCE(work.site_total, 0)    AS site_count,
    COALESCE(sm.labour_total, 0)    AS labour_count,
    COALESCE(sm.progress_avg, 0)    AS progress,
    cur.project_name                AS current_project,
    cur.site_name                   AS current_site,
    cur.role                        AS \`current_role\`,
    cur_task.task_name              AS current_task
  FROM employees e
  LEFT JOIN employees mgr ON mgr.id = e.reporting_manager_id
  LEFT JOIN employees mgr2 ON mgr2.id = mgr.reporting_manager_id
  LEFT JOIN (
    SELECT w.emp_id,
           COUNT(DISTINCT w.project_id) AS project_total,
           COUNT(DISTINCT w.site_id)    AS site_total
    FROM (${WORK_UNION}) w
    WHERE w.emp_id IS NOT NULL
    GROUP BY w.emp_id
  ) work ON work.emp_id = e.id
  LEFT JOIN (
    SELECT su.emp_id,
           SUM(s.labour_count) AS labour_total,
           AVG(s.progress)     AS progress_avg
    FROM (${SITE_UNION}) su
    JOIN sites s ON s.id = su.site_id
    GROUP BY su.emp_id
  ) sm ON sm.emp_id = e.id
  LEFT JOIN (
    SELECT x.employee_id, x.role, x.project_name, x.site_name
    FROM (
      SELECT a.employee_id, a.role,
             p.name AS project_name, s.name AS site_name,
             ROW_NUMBER() OVER (PARTITION BY a.employee_id ORDER BY a.assigned_on DESC, a.id DESC) AS rn
      FROM employee_assignments a
      LEFT JOIN projects p ON p.id = a.project_id
      LEFT JOIN sites    s ON s.id = a.site_id
      WHERE a.is_current = 1
    ) x
    WHERE x.rn = 1
  ) cur ON cur.employee_id = e.id
  LEFT JOIN (
    SELECT tlk.worker_id, pt.name AS task_name
    FROM (
      SELECT tl.worker_id, tl.task_id,
             ROW_NUMBER() OVER (PARTITION BY tl.worker_id ORDER BY tl.id DESC) AS rn
      FROM task_labour tl
      WHERE tl.worker_type = 'company_employee'
    ) tlk
    JOIN project_tasks pt ON pt.id = tlk.task_id
    WHERE tlk.rn = 1
  ) cur_task ON cur_task.worker_id = e.id
`;

function buildFilters({
  search,
  smartSearch,
  status,
  type,
  designation,
  department,
  reportingManagerId,
  skill,
  minProficiency,
  interest,
  hobby,
  strength,
  developmentArea,
  careerInterest,
  workLocation,
  workMode,
  availabilityStatus,
  projectId,
  siteId,
}) {
  const where = [];
  const params = [];

  const searchKeyword = search || smartSearch;
  if (searchKeyword && searchKeyword.trim()) {
    const term = `%${searchKeyword.trim()}%`;
    where.push(`(
      e.full_name LIKE ?
      OR ${CODE_EXPR} LIKE ?
      OR e.email LIKE ?
      OR e.phone LIKE ?
      OR e.designation LIKE ?
      OR e.department LIKE ?
      OR e.work_location LIKE ?
      OR mgr.full_name LIKE ?
      OR EXISTS (
        SELECT 1 FROM employee_skills es
        WHERE es.employee_id = e.id AND es.skill_name LIKE ?
      )
      OR EXISTS (
        SELECT 1 FROM employee_profiles_360 ep
        WHERE ep.employee_id = e.id AND (
          ep.interests LIKE ?
          OR ep.hobbies LIKE ?
          OR ep.strengths LIKE ?
          OR ep.development_areas LIKE ?
          OR ep.career_interests LIKE ?
          OR ep.bio LIKE ?
        )
      )
    )`);
    params.push(
      term, // full_name
      term, // employee_code
      term, // email
      term, // phone
      term, // designation
      term, // department
      term, // work_location
      term, // mgr.full_name
      term, // skill_name
      term, term, term, term, term, term // 360 fields
    );
  }

  if (department && department !== 'all') {
    if (Array.isArray(department)) {
      where.push(`e.department IN (?)`);
      params.push(department);
    } else {
      where.push('e.department = ?');
      params.push(department);
    }
  }

  if (reportingManagerId && reportingManagerId !== 'all') {
    where.push('e.reporting_manager_id = ?');
    params.push(Number(reportingManagerId));
  }

  if (skill && skill !== 'all') {
    if (minProficiency && Number(minProficiency) > 0) {
      where.push(
        'EXISTS (SELECT 1 FROM employee_skills es WHERE es.employee_id = e.id AND es.skill_name LIKE ? AND es.proficiency >= ?)'
      );
      params.push(`%${skill}%`, Number(minProficiency));
    } else {
      where.push('EXISTS (SELECT 1 FROM employee_skills es WHERE es.employee_id = e.id AND es.skill_name LIKE ?)');
      params.push(`%${skill}%`);
    }
  } else if (minProficiency && Number(minProficiency) > 0) {
    where.push('EXISTS (SELECT 1 FROM employee_skills es WHERE es.employee_id = e.id AND es.proficiency >= ?)');
    params.push(Number(minProficiency));
  }

  if (careerInterest && careerInterest !== 'all') {
    where.push('EXISTS (SELECT 1 FROM employee_profiles_360 ep WHERE ep.employee_id = e.id AND ep.career_interests LIKE ?)');
    params.push(`%${careerInterest}%`);
  }

  if (interest && interest !== 'all') {
    where.push('EXISTS (SELECT 1 FROM employee_profiles_360 ep WHERE ep.employee_id = e.id AND ep.interests LIKE ?)');
    params.push(`%${interest}%`);
  }

  if (strength && strength !== 'all') {
    where.push('EXISTS (SELECT 1 FROM employee_profiles_360 ep WHERE ep.employee_id = e.id AND ep.strengths LIKE ?)');
    params.push(`%${strength}%`);
  }

  if (hobby && hobby !== 'all') {
    where.push('EXISTS (SELECT 1 FROM employee_profiles_360 ep WHERE ep.employee_id = e.id AND ep.hobbies LIKE ?)');
    params.push(`%${hobby}%`);
  }

  if (developmentArea && developmentArea !== 'all') {
    where.push('EXISTS (SELECT 1 FROM employee_profiles_360 ep WHERE ep.employee_id = e.id AND ep.development_areas LIKE ?)');
    params.push(`%${developmentArea}%`);
  }

  if (workLocation && workLocation !== 'all') {
    where.push('e.work_location LIKE ?');
    params.push(`%${workLocation}%`);
  }

  if (workMode && workMode !== 'all') {
    where.push('e.work_mode = ?');
    params.push(workMode);
  }

  if (availabilityStatus && availabilityStatus !== 'all') {
    where.push('e.availability_status = ?');
    params.push(availabilityStatus);
  }

  if (status && status !== 'all') {
    where.push('e.status = ?');
    params.push(status);
  }
  if (type && type !== 'all') {
    where.push('e.employee_type = ?');
    params.push(type);
  }
  if (designation && designation !== 'all') {
    where.push('e.designation = ?');
    params.push(designation);
  }
  if (projectId) {
    where.push(`EXISTS (SELECT 1 FROM (${WORK_UNION}) wf WHERE wf.emp_id = e.id AND wf.project_id = ?)`);
    params.push(Number(projectId));
  }
  if (siteId) {
    where.push(`EXISTS (SELECT 1 FROM (${WORK_UNION}) wf2 WHERE wf2.emp_id = e.id AND wf2.site_id = ?)`);
    params.push(Number(siteId));
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function findAll({ page = 1, pageSize = 12, ...filters }) {
  const { whereSql, params } = buildFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${LIST_SELECT} ${whereSql} ORDER BY e.full_name LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM employees e
     LEFT JOIN employees mgr ON mgr.id = e.reporting_manager_id
     ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id) {
  const [rows] = await pool.query(`${LIST_SELECT} WHERE e.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

/** Matches a stored code, or the derived code of a row that has none. */
async function findByCode(code) {
  const [rows] = await pool.query(
    `SELECT id FROM employees
     WHERE employee_code = ?
        OR (employee_code IS NULL AND CONCAT('EMP-', LPAD(id, 4, '0')) = ?)
     LIMIT 1`,
    [code, code]
  );
  return rows[0] || null;
}

/** The employee record linked to a login account — used by HR & Labour
 * (Interface 11) so a signed-in EMPLOYEE user's own attendance/leave scope
 * is resolved server-side rather than trusted from the request. */
async function findByUserId(userId) {
  const [rows] = await pool.query(
    `SELECT id, full_name, status, is_active FROM employees WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Highest number already in play, so a generated code never collides — with a
 * stored EMP-#### code or with the code derived from a row's id.
 */
async function nextCodeNumber() {
  const [rows] = await pool.query(
    `SELECT GREATEST(
              COALESCE(MAX(CASE WHEN employee_code REGEXP '^EMP-[0-9]+$'
                                THEN CAST(SUBSTRING(employee_code, 5) AS UNSIGNED) END), 0),
              COALESCE(MAX(id), 0)
            ) AS max_num
     FROM employees`
  );
  return Number(rows[0]?.max_num || 0) + 1;
}

const WRITABLE = [
  'employee_code', 'full_name', 'designation', 'department', 'reporting_manager_id',
  'employee_type', 'joining_date', 'experience_years', 'email', 'phone', 'address',
  'work_location', 'work_mode', 'status', 'availability_status', 'avatar_url',
  'notes', 'is_active',
];

function normalizePayload(payload) {
  const normalized = { ...payload };
  if (payload.reportingManagerId !== undefined) normalized.reporting_manager_id = payload.reportingManagerId;
  if (payload.experienceYears !== undefined) normalized.experience_years = payload.experienceYears;
  if (payload.workLocation !== undefined) normalized.work_location = payload.workLocation;
  if (payload.workMode !== undefined) normalized.work_mode = payload.workMode;
  if (payload.availabilityStatus !== undefined) normalized.availability_status = payload.availabilityStatus;
  if (payload.avatarUrl !== undefined) normalized.avatar_url = payload.avatarUrl;
  if (payload.employeeCode !== undefined) normalized.employee_code = payload.employeeCode;
  if (payload.fullName !== undefined) normalized.full_name = payload.fullName;
  if (payload.employeeType !== undefined) normalized.employee_type = payload.employeeType;
  if (payload.joiningDate !== undefined) normalized.joining_date = payload.joiningDate;
  return normalized;
}

async function create(rawPayload) {
  const payload = normalizePayload(rawPayload);
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO employees (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((key) => payload[key])
  );
  return result.insertId;
}

async function update(id, rawPayload) {
  const payload = normalizePayload(rawPayload);
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE employees SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

// ------------------------------------------------------------ related data

/** Projects reached through an Interface 3 team role or an explicit assignment. */
async function findProjects(employeeId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.code, p.name, p.status, p.progress, p.location,
            p.estimated_budget, p.expected_completion,
            GROUP_CONCAT(DISTINCT r.role_label ORDER BY r.role_label SEPARATOR ', ') AS roles
     FROM (
       SELECT project_manager_id AS emp_id, id AS project_id, 'Project Manager' AS role_label
         FROM projects WHERE is_archived = 0 AND project_manager_id IS NOT NULL
       UNION ALL
       SELECT architect_id, id, 'Architect' FROM projects WHERE is_archived = 0 AND architect_id IS NOT NULL
       UNION ALL
       SELECT site_engineer_id, id, 'Site Engineer' FROM projects WHERE is_archived = 0 AND site_engineer_id IS NOT NULL
       UNION ALL
       SELECT a.employee_id, a.project_id, COALESCE(a.role, 'Assigned')
         FROM employee_assignments a WHERE a.is_current = 1 AND a.project_id IS NOT NULL
     ) r
     JOIN projects p ON p.id = r.project_id AND p.is_archived = 0
     WHERE r.emp_id = ?
     GROUP BY p.id, p.code, p.name, p.status, p.progress, p.location, p.estimated_budget, p.expected_completion
     ORDER BY p.name`,
    [employeeId]
  );
  return rows;
}

/** Sites reached through the Interface 3 site-engineer role or an assignment. */
async function findSites(employeeId) {
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.address, s.labour_count, s.progress, s.status, s.safety_status,
            p.id AS project_id, p.name AS project_name, p.code AS project_code,
            GROUP_CONCAT(DISTINCT r.role_label ORDER BY r.role_label SEPARATOR ', ') AS roles
     FROM (
       SELECT site_engineer_id AS emp_id, id AS site_id, 'Site Engineer' AS role_label
         FROM sites WHERE site_engineer_id IS NOT NULL
       UNION ALL
       SELECT a.employee_id, a.site_id, COALESCE(a.role, 'Assigned')
         FROM employee_assignments a WHERE a.is_current = 1 AND a.site_id IS NOT NULL
     ) r
     JOIN sites s ON s.id = r.site_id
     JOIN projects p ON p.id = s.project_id
     WHERE r.emp_id = ?
     GROUP BY s.id, s.name, s.address, s.labour_count, s.progress, s.status, s.safety_status,
              p.id, p.name, p.code
     ORDER BY s.name`,
    [employeeId]
  );
  return rows;
}

/** Explicit Interface 5 postings, newest first, current ones on top. */
async function findAssignments(employeeId) {
  const [rows] = await pool.query(
    `SELECT a.id, a.role, a.assigned_on, a.end_date, a.is_current, a.notes,
            p.id AS project_id, p.name AS project_name, p.code AS project_code,
            s.id AS site_id, s.name AS site_name
     FROM employee_assignments a
     LEFT JOIN projects p ON p.id = a.project_id
     LEFT JOIN sites    s ON s.id = a.site_id
     WHERE a.employee_id = ?
     ORDER BY a.is_current DESC, a.assigned_on DESC, a.id DESC`,
    [employeeId]
  );
  return rows;
}

/** Labour on the sites this employee covers — the "labour information where applicable". */
async function findLabour(employeeId) {
  const [rows] = await pool.query(
    `SELECT l.id, l.category, l.worker_count, l.present_count, l.record_date,
            l.daily_rate, l.payment_status,
            (l.present_count * l.daily_rate) AS daily_cost,
            s.id AS site_id, s.name AS site_name, p.name AS project_name,
            c.name AS contractor_name
     FROM labour_records l
     JOIN sites s ON s.id = l.site_id
     JOIN projects p ON p.id = s.project_id
     LEFT JOIN contractors c ON c.id = l.contractor_id
     WHERE l.site_id IN (SELECT su.site_id FROM (${SITE_UNION}) su WHERE su.emp_id = ?)
     ORDER BY l.record_date DESC, l.id
     LIMIT 100`,
    [employeeId]
  );
  return rows;
}

/** Latest site activity on this employee's sites — the "current work". */
async function findActivities(employeeId) {
  const [rows] = await pool.query(
    `SELECT sa.id, sa.activity_date, sa.work_completed, sa.labour_present,
            sa.equipment_used, sa.issues,
            s.id AS site_id, s.name AS site_name, p.name AS project_name
     FROM site_activities sa
     JOIN sites s ON s.id = sa.site_id
     JOIN projects p ON p.id = s.project_id
     WHERE sa.site_id IN (SELECT su.site_id FROM (${SITE_UNION}) su WHERE su.emp_id = ?)
     ORDER BY sa.activity_date DESC, sa.id DESC
     LIMIT 30`,
    [employeeId]
  );
  return rows;
}

// ------------------------------------------------------------- assignments

async function createAssignment(payload) {
  const [result] = await pool.query(
    `INSERT INTO employee_assignments
       (employee_id, project_id, site_id, role, assigned_on, notes, is_current)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [
      payload.employee_id,
      payload.project_id ?? null,
      payload.site_id ?? null,
      payload.role ?? null,
      payload.assigned_on ?? new Date().toISOString().slice(0, 10),
      payload.notes ?? null,
    ]
  );
  return result.insertId;
}

async function findAssignmentById(id) {
  const [rows] = await pool.query('SELECT * FROM employee_assignments WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

/** Ends a posting without deleting the history. */
async function endAssignment(id) {
  await pool.query(
    'UPDATE employee_assignments SET is_current = 0, end_date = COALESCE(end_date, CURDATE()) WHERE id = ?',
    [id]
  );
}

/** Distinct designations already in use, for the list filter. */
async function findDesignations() {
  const [rows] = await pool.query(
    "SELECT DISTINCT designation FROM employees WHERE designation <> '' ORDER BY designation"
  );
  return rows.map((row) => row.designation);
}

// ------------------------------------------------------------ Employee 360 & Skills

async function findSkillsForEmployeeIds(employeeIds) {
  if (!employeeIds || employeeIds.length === 0) return {};
  const [rows] = await pool.query(
    `SELECT employee_id, skill_name, proficiency, is_primary
     FROM employee_skills
     WHERE employee_id IN (?)
     ORDER BY is_primary DESC, proficiency DESC, skill_name ASC`,
    [employeeIds]
  );
  const byEmp = {};
  for (const r of rows) {
    if (!byEmp[r.employee_id]) byEmp[r.employee_id] = [];
    byEmp[r.employee_id].push({
      skillName: r.skill_name,
      proficiency: Number(r.proficiency),
      isPrimary: Boolean(r.is_primary),
    });
  }
  return byEmp;
}

async function findProfiles360ForEmployeeIds(employeeIds) {
  if (!employeeIds || employeeIds.length === 0) return {};
  const [rows] = await pool.query(
    `SELECT employee_id, interests, hobbies, strengths, development_areas, career_interests, bio
     FROM employee_profiles_360
     WHERE employee_id IN (?)`,
    [employeeIds]
  );
  const byEmp = {};
  for (const r of rows) {
    const parse = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [val];
        } catch {
          return [val];
        }
      }
      return [];
    };
    byEmp[r.employee_id] = {
      interests: parse(r.interests),
      hobbies: parse(r.hobbies),
      strengths: parse(r.strengths),
      developmentAreas: parse(r.development_areas),
      careerInterests: parse(r.career_interests),
      bio: r.bio || '',
    };
  }
  return byEmp;
}

async function findDistinctLookups() {
  const [
    [deptRows],
    [desigRows],
    [skillRows],
    [mgrRows],
  ] = await Promise.all([
    pool.query("SELECT DISTINCT department FROM employees WHERE department IS NOT NULL AND department <> '' ORDER BY department"),
    pool.query("SELECT DISTINCT designation FROM employees WHERE designation <> '' ORDER BY designation"),
    pool.query("SELECT DISTINCT skill_name FROM employee_skills ORDER BY skill_name"),
    pool.query(`SELECT e.id, e.full_name, ${CODE_EXPR} AS employee_code FROM employees e WHERE e.status = 'active' ORDER BY e.full_name`),
  ]);

  return {
    departments: deptRows.map((r) => r.department),
    designations: desigRows.map((r) => r.designation),
    skills: skillRows.map((r) => r.skill_name),
    reportingManagers: mgrRows.map((r) => ({ id: r.id, name: r.full_name, code: r.employee_code })),
  };
}

async function saveSkills(employeeId, skills = []) {
  await pool.query('DELETE FROM employee_skills WHERE employee_id = ?', [employeeId]);
  if (Array.isArray(skills) && skills.length > 0) {
    const values = skills
      .filter((s) => s && (s.skillName || s.skill_name || s.name))
      .map((s) => [
        employeeId,
        (s.skillName || s.skill_name || s.name).trim(),
        Math.min(5, Math.max(1, Number(s.proficiency || 3))),
        s.isPrimary !== undefined ? (s.isPrimary ? 1 : 0) : 1,
      ]);
    if (values.length > 0) {
      await pool.query(
        'INSERT INTO employee_skills (employee_id, skill_name, proficiency, is_primary) VALUES ?',
        [values]
      );
    }
  }
}

async function saveProfile360(employeeId, data = {}) {
  const toJson = (val) => {
    if (Array.isArray(val)) return JSON.stringify(val);
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return JSON.stringify(parsed);
      } catch {
        const items = val.split(',').map((s) => s.trim()).filter(Boolean);
        return JSON.stringify(items);
      }
    }
    return JSON.stringify([]);
  };

  await pool.query(
    `INSERT INTO employee_profiles_360 (employee_id, interests, hobbies, strengths, development_areas, career_interests, bio)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       interests = VALUES(interests),
       hobbies = VALUES(hobbies),
       strengths = VALUES(strengths),
       development_areas = VALUES(development_areas),
       career_interests = VALUES(career_interests),
       bio = VALUES(bio)`,
    [
      employeeId,
      toJson(data.interests),
      toJson(data.hobbies),
      toJson(data.strengths),
      toJson(data.developmentAreas || data.development_areas),
      toJson(data.careerInterests || data.career_interests),
      data.bio || null,
    ]
  );
}

async function findFullOrgEmployees() {
  const [rows] = await pool.query(
    `SELECT
       e.id, ${CODE_EXPR} AS employee_code, e.full_name, e.designation, e.department,
       e.reporting_manager_id, mgr.full_name AS reporting_manager_name, ${CODE_EXPR_MGR} AS reporting_manager_code, mgr.designation AS reporting_manager_designation,
       mgr.reporting_manager_id AS managers_manager_id, mgr2.full_name AS managers_manager_name, ${CODE_EXPR_MGR2} AS managers_manager_code, mgr2.designation AS managers_manager_designation,
       e.avatar_url, e.status, e.email, e.phone, e.work_location, e.work_mode, e.experience_years, e.joining_date
     FROM employees e
     LEFT JOIN employees mgr ON mgr.id = e.reporting_manager_id
     LEFT JOIN employees mgr2 ON mgr2.id = mgr.reporting_manager_id
     WHERE e.is_active = 1
     ORDER BY e.reporting_manager_id IS NULL DESC, e.full_name ASC`
  );
  return rows;
}

module.exports = {
  findAll, findById, findByCode, findByUserId, nextCodeNumber, create, update,
  findProjects, findSites, findAssignments, findLabour, findActivities,
  createAssignment, findAssignmentById, endAssignment, findDesignations,
  findSkillsForEmployeeIds, findProfiles360ForEmployeeIds, findDistinctLookups,
  saveSkills, saveProfile360, findFullOrgEmployees,
};
