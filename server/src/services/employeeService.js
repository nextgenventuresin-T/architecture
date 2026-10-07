'use strict';

const ApiError = require('../utils/ApiError');
const employeeModel = require('../models/employeeModel');
const projectModel = require('../models/projectModel');
const siteModel = require('../models/siteModel');

/**
 * Statuses that still count as "on the books". Interface 3's team pickers read
 * `is_active`, so an employee on leave stays selectable while someone who has
 * left drops out. Keeping the mapping here means the flag and the status can
 * never drift apart.
 */
const ACTIVE_STATUSES = new Set(['active', 'on-leave']);

const isActiveFlag = (status) => (ACTIVE_STATUSES.has(status) ? 1 : 0);

/** Converts a DB row into the camelCase shape the client consumes. */
function toEmployee(row, skills = [], profile360 = null, searchQuery = null) {
  if (!row) return null;

  // Compute matchedAttributes for Smart People Search (Feature 26)
  const matchedAttributes = [];
  if (searchQuery && typeof searchQuery === 'string') {
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      // Check skills
      for (const s of skills) {
        if (s.skillName?.toLowerCase().includes(q)) {
          const stars = '★'.repeat(s.proficiency) + '☆'.repeat(5 - s.proficiency);
          matchedAttributes.push({ type: 'skill', label: `${s.skillName} ${stars}`, value: s.skillName });
        }
      }
      // Check 360 fields
      if (profile360) {
        for (const item of (profile360.interests || [])) {
          if (String(item).toLowerCase().includes(q)) {
            matchedAttributes.push({ type: 'interest', label: `Interest: ${item}`, value: item });
          }
        }
        for (const item of (profile360.strengths || [])) {
          if (String(item).toLowerCase().includes(q)) {
            matchedAttributes.push({ type: 'strength', label: `Strength: ${item}`, value: item });
          }
        }
        for (const item of (profile360.careerInterests || [])) {
          if (String(item).toLowerCase().includes(q)) {
            matchedAttributes.push({ type: 'career_interest', label: `Career Goal: ${item}`, value: item });
          }
        }
        for (const item of (profile360.hobbies || [])) {
          if (String(item).toLowerCase().includes(q)) {
            matchedAttributes.push({ type: 'hobby', label: `Hobby: ${item}`, value: item });
          }
        }
        for (const item of (profile360.developmentAreas || [])) {
          if (String(item).toLowerCase().includes(q)) {
            matchedAttributes.push({ type: 'development_area', label: `Dev Area: ${item}`, value: item });
          }
        }
      }
      // Check designation/department
      if (row.designation?.toLowerCase().includes(q)) {
        matchedAttributes.push({ type: 'designation', label: `Designation: ${row.designation}`, value: row.designation });
      }
      if (row.department?.toLowerCase().includes(q)) {
        matchedAttributes.push({ type: 'department', label: `Department: ${row.department}`, value: row.department });
      }
      if (row.work_location?.toLowerCase().includes(q)) {
        matchedAttributes.push({ type: 'location', label: `Location: ${row.work_location}`, value: row.work_location });
      }
    }
  }

  return {
    id: row.id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    designation: row.designation,
    department: row.department || null,
    reportingManager: row.reporting_manager_id
      ? {
          id: row.reporting_manager_id,
          name: row.reporting_manager_name,
          code: row.reporting_manager_code,
          designation: row.reporting_manager_designation || null,
        }
      : null,
    managersManager: row.managers_manager_id
      ? {
          id: row.managers_manager_id,
          name: row.managers_manager_name,
          code: row.managers_manager_code,
          designation: row.managers_manager_designation || null,
        }
      : null,
    employeeType: row.employee_type,
    joiningDate: row.joining_date,
    experienceYears: row.experience_years !== null ? Number(row.experience_years) : 0,
    email: row.email,
    phone: row.phone,
    address: row.address,
    workLocation: row.work_location || null,
    workMode: row.work_mode || 'office',
    status: row.status,
    availabilityStatus: row.availability_status || 'available',
    avatarUrl: row.avatar_url || null,
    notes: row.notes,
    userId: row.user_id,
    createdAt: row.created_at,
    currentProject: row.current_project || null,
    currentSite: row.current_site || null,
    currentTask: row.current_task || null,
    current: {
      project: row.current_project || null,
      site: row.current_site || null,
      role: row.current_role || null,
      task: row.current_task || null,
    },
    stats: {
      projectCount: Number(row.project_count || 0),
      siteCount: Number(row.site_count || 0),
      labourCount: Number(row.labour_count || 0),
      progress: Math.round(Number(row.progress || 0)),
    },
    skills,
    profile360: profile360 || {
      interests: [],
      hobbies: [],
      strengths: [],
      developmentAreas: [],
      careerInterests: [],
      bio: '',
    },
    matchedAttributes,
  };
}

async function list(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 12));

  const { rows, total } = await employeeModel.findAll({ ...query, page, pageSize });
  const employeeIds = rows.map((r) => r.id);

  const [skillsByEmp, profilesByEmp] = await Promise.all([
    employeeModel.findSkillsForEmployeeIds(employeeIds),
    employeeModel.findProfiles360ForEmployeeIds(employeeIds),
  ]);

  const searchQuery = query.search || query.smartSearch;

  return {
    employees: rows.map((r) =>
      toEmployee(r, skillsByEmp[r.id] || [], profilesByEmp[r.id] || null, searchQuery)
    ),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id) {
  const row = await employeeModel.findById(id);
  if (!row) throw ApiError.notFound('That employee does not exist.');
  const [skillsByEmp, profilesByEmp] = await Promise.all([
    employeeModel.findSkillsForEmployeeIds([id]),
    employeeModel.findProfiles360ForEmployeeIds([id]),
  ]);
  return toEmployee(row, skillsByEmp[id] || [], profilesByEmp[id] || null);
}

/** Full detail payload backing the employee detail screen. */
async function getDetail(id) {
  const employee = await getById(id);

  const [projects, sites, assignments, labour, activities] = await Promise.all([
    employeeModel.findProjects(id),
    employeeModel.findSites(id),
    employeeModel.findAssignments(id),
    employeeModel.findLabour(id),
    employeeModel.findActivities(id),
  ]);

  return { employee, projects, sites, assignments, labour, activities };
}

/** Designations, departments, skills, and projects the filter dropdowns need. */
async function getLookups() {
  const [lookups, projects] = await Promise.all([
    employeeModel.findDistinctLookups(),
    projectModel.findAll({ page: 1, pageSize: 100 }),
  ]);

  return {
    ...lookups,
    projects: (projects.rows || []).map((p) => ({ id: p.id, code: p.code, name: p.name })),
  };
}

/** Generates the next free EMP-#### code. */
async function generateCode() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `EMP-${String(await employeeModel.nextCodeNumber() + attempt).padStart(4, '0')}`;
    if (!(await employeeModel.findByCode(candidate))) return candidate;
  }
  throw ApiError.badRequest('Could not generate an employee ID. Enter one manually.');
}

async function create(payload) {
  const employee_code = payload.employee_code?.trim() || (await generateCode());

  if (await employeeModel.findByCode(employee_code)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      employee_code: 'That employee ID is already in use.',
    });
  }

  const status = payload.status ?? 'active';
  const id = await employeeModel.create({
    ...payload,
    employee_code,
    status,
    is_active: isActiveFlag(status),
  });

  // Save skills if provided
  if (Array.isArray(payload.skills)) {
    await employeeModel.saveSkills(id, payload.skills);
  }

  // Save 360 profile if provided
  if (payload.profile360 || payload.interests || payload.strengths || payload.careerInterests) {
    await employeeModel.saveProfile360(id, payload.profile360 || payload);
  }

  return getById(id);
}

async function update(id, payload) {
  await getById(id); // 404s when missing

  if (payload.employee_code) {
    const existing = await employeeModel.findByCode(payload.employee_code);
    if (existing && existing.id !== Number(id)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        employee_code: 'That employee ID is already in use.',
      });
    }
  }

  const patch = { ...payload };
  if (payload.status !== undefined) {
    patch.is_active = isActiveFlag(payload.status);
  }

  await employeeModel.update(id, patch);

  // Update skills if provided
  if (payload.skills !== undefined) {
    await employeeModel.saveSkills(id, payload.skills);
  }

  // Update 360 profile if provided
  if (payload.profile360 !== undefined || payload.interests !== undefined || payload.strengths !== undefined || payload.careerInterests !== undefined) {
    await employeeModel.saveProfile360(id, payload.profile360 || payload);
  }

  return getById(id);
}

/**
 * Posts an employee to a project, optionally narrowed to one of its sites.
 * This writes to `employee_assignments` only — the team columns Interface 3
 * keeps on `projects`/`sites` are left untouched.
 */
async function assign(id, { project_id, site_id, role, notes }) {
  await getById(id);

  if (!project_id && !site_id) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      project_id: 'Select a project or a site.',
    });
  }

  let projectId = project_id ?? null;

  if (projectId) {
    const project = await projectModel.findById(projectId);
    if (!project) throw ApiError.notFound('That project does not exist.');
  }

  if (site_id) {
    const site = await siteModel.findById(site_id);
    if (!site) throw ApiError.notFound('That site does not exist.');
    if (projectId && Number(site.project_id) !== Number(projectId)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        site_id: 'That site does not belong to the selected project.',
      });
    }
    projectId = projectId ?? site.project_id;
  }

  await employeeModel.createAssignment({
    employee_id: id,
    project_id: projectId,
    site_id: site_id ?? null,
    role: role ?? null,
    notes: notes ?? null,
  });

  return getDetail(id);
}

/** Ends a posting, keeping it in the history rather than deleting it. */
async function endAssignment(id, assignmentId) {
  await getById(id);

  const assignment = await employeeModel.findAssignmentById(assignmentId);
  if (!assignment || Number(assignment.employee_id) !== Number(id)) {
    throw ApiError.notFound('That assignment does not exist.');
  }

  await employeeModel.endAssignment(assignmentId);
  return getDetail(id);
}

/** Returns the complete organizational hierarchy tree and department heads */
async function getHierarchy() {
  const rawRows = await employeeModel.findFullOrgEmployees();

  const empMap = new Map();
  const byDept = {};

  rawRows.forEach((r) => {
    const node = {
      id: r.id,
      employeeCode: r.employee_code,
      fullName: r.full_name,
      designation: r.designation,
      department: r.department || 'General',
      reportingManagerId: r.reporting_manager_id,
      reportingManagerName: r.reporting_manager_name,
      reportingManagerCode: r.reporting_manager_code,
      reportingManagerDesignation: r.reporting_manager_designation,
      managersManagerId: r.managers_manager_id,
      managersManagerName: r.managers_manager_name,
      managersManagerCode: r.managers_manager_code,
      managersManagerDesignation: r.managers_manager_designation,
      avatarUrl: r.avatar_url,
      status: r.status,
      email: r.email,
      phone: r.phone,
      workLocation: r.work_location,
      workMode: r.work_mode,
      experienceYears: r.experience_years,
      directReports: [],
      directReportsCount: 0,
      totalSubordinatesCount: 0,
    };
    empMap.set(r.id, node);

    const dept = node.department;
    if (!byDept[dept]) byDept[dept] = [];
    byDept[dept].push(node);
  });

  // Link directReports
  empMap.forEach((node) => {
    if (node.reportingManagerId && empMap.has(node.reportingManagerId)) {
      const mgr = empMap.get(node.reportingManagerId);
      mgr.directReports.push(node);
      mgr.directReportsCount = mgr.directReports.length;
    }
  });

  // Determine Department Heads
  const departmentHeads = {};
  Object.keys(byDept).forEach((dept) => {
    const emps = byDept[dept];
    let head = emps.find((e) => !e.reportingManagerId || !emps.some((other) => other.id === e.reportingManagerId));
    if (!head && emps.length > 0) head = emps[0];
    departmentHeads[dept] = head
      ? {
          id: head.id,
          employeeCode: head.employeeCode,
          fullName: head.fullName,
          designation: head.designation,
          department: head.department,
          avatarUrl: head.avatarUrl,
        }
      : null;
  });

  // Recursive subordinate count
  function countSubordinates(node) {
    let count = node.directReports.length;
    for (const child of node.directReports) {
      count += countSubordinates(child);
    }
    node.totalSubordinatesCount = count;
    return count;
  }

  // Attach departmentHead to all nodes
  empMap.forEach((node) => {
    node.departmentHead = departmentHeads[node.department] || null;
  });

  // Build tree roots (those without a manager or whose manager is not in empMap)
  const tree = [];
  empMap.forEach((node) => {
    if (!node.reportingManagerId || !empMap.has(node.reportingManagerId)) {
      countSubordinates(node);
      tree.push(node);
    }
  });

  return {
    tree,
    allEmployees: Array.from(empMap.values()),
    departmentHeads,
    totalEmployees: empMap.size,
  };
}

/** Returns the specific chain: Employee -> Reporting Manager -> Manager's Manager -> Department Head, plus reports */
async function getEmployeeHierarchy(id) {
  const { allEmployees, departmentHeads } = await getHierarchy();
  const empMap = new Map(allEmployees.map((e) => [e.id, e]));

  const employee = empMap.get(Number(id));
  if (!employee) throw ApiError.notFound('That employee does not exist.');

  const reportingManager = employee.reportingManagerId ? empMap.get(employee.reportingManagerId) || null : null;
  const managersManager = reportingManager && reportingManager.reportingManagerId ? empMap.get(reportingManager.reportingManagerId) || null : null;
  const departmentHead = departmentHeads[employee.department] || null;

  const directReports = employee.directReports || [];
  const allReports = [];
  function collectSubordinates(node) {
    for (const child of node.directReports) {
      allReports.push({
        id: child.id,
        employeeCode: child.employeeCode,
        fullName: child.fullName,
        designation: child.designation,
        department: child.department,
        avatarUrl: child.avatarUrl,
      });
      collectSubordinates(child);
    }
  }
  collectSubordinates(employee);

  const peers = reportingManager
    ? (reportingManager.directReports || []).filter((e) => e.id !== employee.id)
    : [];

  return {
    employee,
    chain: {
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        designation: employee.designation,
        department: employee.department,
        avatarUrl: employee.avatarUrl,
      },
      reportingManager: reportingManager
        ? {
            id: reportingManager.id,
            employeeCode: reportingManager.employeeCode,
            fullName: reportingManager.fullName,
            designation: reportingManager.designation,
            department: reportingManager.department,
            avatarUrl: reportingManager.avatarUrl,
          }
        : null,
      managersManager: managersManager
        ? {
            id: managersManager.id,
            employeeCode: managersManager.employeeCode,
            fullName: managersManager.fullName,
            designation: managersManager.designation,
            department: managersManager.department,
            avatarUrl: managersManager.avatarUrl,
          }
        : null,
      departmentHead: departmentHead
        ? {
            id: departmentHead.id,
            employeeCode: departmentHead.employeeCode,
            fullName: departmentHead.fullName,
            designation: departmentHead.designation,
            department: departmentHead.department,
            avatarUrl: departmentHead.avatarUrl,
          }
        : null,
    },
    directReports,
    allReports,
    peers,
  };
}

module.exports = {
  list, getById, getDetail, getLookups, create, update, assign, endAssignment, toEmployee,
  getHierarchy, getEmployeeHierarchy,
};
