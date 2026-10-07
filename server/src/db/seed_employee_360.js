'use strict';

const { pool } = require('../config/db');

async function seed() {
  const conn = await pool.getConnection();
  try {
    console.log('Seeding Employee 360 profiles, skills, and department data...');

    // 1. Update existing employee #1: Sukhvir kaur
    await conn.query(`
      UPDATE employees
      SET department = 'HR',
          work_location = 'Corporate Office - Noida',
          work_mode = 'office',
          availability_status = 'available',
          experience_years = 5.5
      WHERE id = 1
    `);

    // Add skills for Sukhvir Kaur
    await conn.query(`DELETE FROM employee_skills WHERE employee_id = 1`);
    await conn.query(`
      INSERT INTO employee_skills (employee_id, skill_name, proficiency, is_primary) VALUES
      (1, 'HR Management', 5, 1),
      (1, 'Payroll & Compliance', 4, 1),
      (1, 'Leadership', 4, 0),
      (1, 'Conflict Resolution', 4, 0)
    `);

    // Add 360 profile for Sukhvir Kaur
    await conn.query(`
      INSERT INTO employee_profiles_360 (employee_id, interests, hobbies, strengths, development_areas, career_interests, bio)
      VALUES (
        1,
        JSON_ARRAY('Human Capital Development', 'Labor Law Adherence', 'Organizational Psychology'),
        JSON_ARRAY('Reading', 'Badminton', 'Traveling'),
        JSON_ARRAY('Leadership', 'Empathetic Communication', 'Policy Formulation'),
        JSON_ARRAY('Advanced HR Analytics', 'Automation Tools'),
        JSON_ARRAY('VP of Human Resources', 'People Operations Director'),
        'Senior Human Resources professional overseeing employee relations, workforce planning, and organizational compliance.'
      )
      ON DUPLICATE KEY UPDATE
        interests = VALUES(interests),
        hobbies = VALUES(hobbies),
        strengths = VALUES(strengths),
        development_areas = VALUES(development_areas),
        career_interests = VALUES(career_interests),
        bio = VALUES(bio)
    `);

    // 2. Helper to insert or get employee by code
    async function upsertEmployee(emp) {
      const [existing] = await conn.query('SELECT id FROM employees WHERE employee_code = ?', [emp.employee_code]);
      let empId;
      if (existing.length > 0) {
        empId = existing[0].id;
        await conn.query(`
          UPDATE employees SET
            full_name = ?, designation = ?, department = ?, employee_type = ?,
            joining_date = ?, experience_years = ?, email = ?, phone = ?, address = ?,
            work_location = ?, work_mode = ?, status = ?, availability_status = ?, notes = ?
          WHERE id = ?
        `, [
          emp.full_name, emp.designation, emp.department, emp.employee_type || 'full-time',
          emp.joining_date, emp.experience_years, emp.email, emp.phone, emp.address,
          emp.work_location, emp.work_mode, emp.status || 'active', emp.availability_status || 'available', emp.notes,
          empId
        ]);
      } else {
        const [res] = await conn.query(`
          INSERT INTO employees (
            employee_code, full_name, designation, department, employee_type,
            joining_date, experience_years, email, phone, address,
            work_location, work_mode, status, availability_status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          emp.employee_code, emp.full_name, emp.designation, emp.department, emp.employee_type || 'full-time',
          emp.joining_date, emp.experience_years, emp.email, emp.phone, emp.address,
          emp.work_location, emp.work_mode, emp.status || 'active', emp.availability_status || 'available', emp.notes
        ]);
        empId = res.insertId;
      }

      // Skills
      await conn.query('DELETE FROM employee_skills WHERE employee_id = ?', [empId]);
      if (Array.isArray(emp.skills) && emp.skills.length > 0) {
        const skillValues = emp.skills.map(s => [empId, s.name, s.proficiency, s.is_primary ? 1 : 0]);
        await conn.query(
          'INSERT INTO employee_skills (employee_id, skill_name, proficiency, is_primary) VALUES ?',
          [skillValues]
        );
      }

      // 360 Profile
      await conn.query(`
        INSERT INTO employee_profiles_360 (employee_id, interests, hobbies, strengths, development_areas, career_interests, bio)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          interests = VALUES(interests),
          hobbies = VALUES(hobbies),
          strengths = VALUES(strengths),
          development_areas = VALUES(development_areas),
          career_interests = VALUES(career_interests),
          bio = VALUES(bio)
      `, [
        empId,
        JSON.stringify(emp.interests || []),
        JSON.stringify(emp.hobbies || []),
        JSON.stringify(emp.strengths || []),
        JSON.stringify(emp.development_areas || []),
        JSON.stringify(emp.career_interests || []),
        emp.bio || null
      ]);

      return empId;
    }

    // 3. Insert realistic employees matching user prompt examples:
    // Rajesh Kumar (Executive Architect & Leader)
    const rajeshId = await upsertEmployee({
      employee_code: 'EMP-0010',
      full_name: 'Rajesh Kumar',
      designation: 'Chief Architect',
      department: 'Management',
      employee_type: 'full-time',
      joining_date: '2021-03-15',
      experience_years: 14.5,
      email: 'rajesh.kumar@architecture-erp.com',
      phone: '+91 98765 43210',
      address: 'Sector 50, Noida, UP',
      work_location: 'Head Office - Noida',
      work_mode: 'office',
      status: 'active',
      availability_status: 'available',
      notes: 'Key architectural design leader for commercial high-rises.',
      skills: [
        { name: 'Revit', proficiency: 5, is_primary: true },
        { name: 'AutoCAD', proficiency: 5, is_primary: true },
        { name: 'Leadership', proficiency: 5, is_primary: true },
        { name: 'Urban Planning', proficiency: 4, is_primary: false },
        { name: 'Structural Coordination', proficiency: 4, is_primary: false }
      ],
      interests: ['Sustainable Architecture', 'Green Buildings', 'BIM Innovation', 'Urban Regeneration'],
      hobbies: ['Architectural Photography', 'Sketching', 'Chess'],
      strengths: ['Leadership', 'Strategic Vision', 'Client Presentation', 'Design Governance'],
      development_areas: ['Public Speaking at Global Conferences', 'Advanced Parametric Scripting'],
      career_interests: ['Executive Director', 'Chief Architect', 'Advisory Board Member'],
      bio: 'Leading master planning, architectural elevation, and sustainable building guidelines across landmark commercial projects.'
    });

    // Arjun Sharma (Data Analyst / IT - exact match for prompt example)
    await upsertEmployee({
      employee_code: 'EMP-0011',
      full_name: 'Arjun Sharma',
      designation: 'Data Analyst',
      department: 'IT',
      employee_type: 'full-time',
      joining_date: '2023-06-01',
      experience_years: 3.5,
      email: 'arjun.sharma@architecture-erp.com',
      phone: '+91 98111 22334',
      address: 'Indirapuram, Ghaziabad, UP',
      work_location: 'Head Office - Noida',
      work_mode: 'hybrid',
      status: 'active',
      availability_status: 'available',
      notes: 'Analytics & ERP intelligence specialist.',
      skills: [
        { name: 'Python', proficiency: 4, is_primary: true },
        { name: 'SQL', proficiency: 4, is_primary: true },
        { name: 'Power BI', proficiency: 3, is_primary: true },
        { name: 'Data Visualization', proficiency: 4, is_primary: false },
        { name: 'Excel Advanced', proficiency: 5, is_primary: false }
      ],
      interests: ['Data Science', 'Machine Learning', 'Process Automation', 'Predictive Modeling'],
      hobbies: ['Cricket', 'Tech Blogging', 'PC Gaming'],
      strengths: ['Analytical Thinking', 'Problem Solving', 'Data Storytelling'],
      development_areas: ['Cloud Data Warehousing', 'Data Pipeline Orchestration'],
      career_interests: ['Lead Data Scientist', 'Analytics Manager', 'BI Architect'],
      bio: 'Data Analyst focused on operational metric models, ERP forecasting, and real-time dashboarding for project managers.'
    });

    // Priya Verma (Full Stack Lead - IT / React)
    await upsertEmployee({
      employee_code: 'EMP-0012',
      full_name: 'Priya Verma',
      designation: 'Senior Frontend Engineer',
      department: 'IT',
      employee_type: 'full-time',
      joining_date: '2022-08-10',
      experience_years: 5.0,
      email: 'priya.verma@architecture-erp.com',
      phone: '+91 98222 33445',
      address: 'South City, Gurugram, Haryana',
      work_location: 'Remote',
      work_mode: 'wfh',
      status: 'active',
      availability_status: 'available',
      notes: 'Core frontend developer on Architecture ERP portal.',
      skills: [
        { name: 'React', proficiency: 5, is_primary: true },
        { name: 'TypeScript', proficiency: 4, is_primary: true },
        { name: 'Node.js', proficiency: 4, is_primary: true },
        { name: 'Tailwind CSS', proficiency: 5, is_primary: false },
        { name: 'REST APIs', proficiency: 4, is_primary: false }
      ],
      interests: ['Web Performance', 'Micro-frontends', 'Accessibility (a11y)', 'Cloud Native'],
      hobbies: ['Badminton', 'Digital Illustration', 'Podcasts'],
      strengths: ['Frontend Architecture', 'Code Quality', 'Team Mentorship'],
      development_areas: ['Mobile Apps (React Native)', 'System Design'],
      career_interests: ['Engineering Manager', 'Frontend Architect', 'Product Engineering Lead'],
      bio: 'Specialized in building high-performance, accessible enterprise web applications and responsive design systems.'
    });

    // Sneha Patel (Project Manager - Leadership, Project Management)
    await upsertEmployee({
      employee_code: 'EMP-0013',
      full_name: 'Sneha Patel',
      designation: 'Senior Project Manager',
      department: 'Management',
      employee_type: 'full-time',
      joining_date: '2020-11-01',
      experience_years: 9.0,
      email: 'sneha.patel@architecture-erp.com',
      phone: '+91 98333 44556',
      address: 'Powai, Mumbai, Maharashtra',
      work_location: 'Mumbai Project Site',
      work_mode: 'site',
      status: 'active',
      availability_status: 'busy',
      notes: 'Overseeing ground progress and contractor schedules.',
      skills: [
        { name: 'Project Management', proficiency: 5, is_primary: true },
        { name: 'Leadership', proficiency: 5, is_primary: true },
        { name: 'Cost Estimation', proficiency: 4, is_primary: true },
        { name: 'Agile Construction', proficiency: 4, is_primary: false },
        { name: 'Contract Administration', proficiency: 4, is_primary: false }
      ],
      interests: ['Construction Tech', 'Lean Construction', 'Risk Mitigation', 'Team Motivation'],
      hobbies: ['Marathon Running', 'Gardening', 'Classical Music'],
      strengths: ['Leadership', 'Crisis Management', 'Execution Discipline', 'Conflict Resolution'],
      development_areas: ['Six Sigma Black Belt', 'BIM Schedule Simulation (4D)'],
      career_interests: ['Project Management', 'Vice President of Operations', 'General Manager'],
      bio: 'Seasoned project delivery leader managing multi-crore EPC contracts, on-time milestones, and inter-departmental operations.'
    });

    // Vikram Malhotra (Finance / Budgeting)
    await upsertEmployee({
      employee_code: 'EMP-0014',
      full_name: 'Vikram Malhotra',
      designation: 'Finance Controller',
      department: 'Finance',
      employee_type: 'full-time',
      joining_date: '2019-05-20',
      experience_years: 11.2,
      email: 'vikram.malhotra@architecture-erp.com',
      phone: '+91 98444 55667',
      address: 'Greater Kailash, New Delhi',
      work_location: 'Head Office - Noida',
      work_mode: 'office',
      status: 'active',
      availability_status: 'available',
      notes: 'Leads financial reporting, cash flow audits, and vendor payouts.',
      skills: [
        { name: 'Financial Modeling', proficiency: 5, is_primary: true },
        { name: 'Budgeting', proficiency: 5, is_primary: true },
        { name: 'Cost Auditing', proficiency: 4, is_primary: true },
        { name: 'Taxation & GST', proficiency: 4, is_primary: false },
        { name: 'Leadership', proficiency: 4, is_primary: false }
      ],
      interests: ['Corporate Finance', 'FinTech', 'Treasury Management', 'Venture Funding'],
      hobbies: ['Tennis', 'Numismatics', 'Reading Economics'],
      strengths: ['Fiscal Governance', 'Negotiation', 'Analytical Precision', 'Leadership'],
      development_areas: ['International Taxation', 'M&A Due Diligence'],
      career_interests: ['Chief Financial Officer (CFO)', 'Finance Director'],
      bio: 'Chartered financial specialist steering organizational budgets, capital expenditure audits, and banking relations.'
    });

    // Ananya Sen (HR - On Leave)
    await upsertEmployee({
      employee_code: 'EMP-0015',
      full_name: 'Ananya Sen',
      designation: 'HR Specialist',
      department: 'HR',
      employee_type: 'full-time',
      joining_date: '2023-01-15',
      experience_years: 4.0,
      email: 'ananya.sen@architecture-erp.com',
      phone: '+91 98555 66778',
      address: 'Salt Lake, Kolkata, West Bengal',
      work_location: 'Head Office - Noida',
      work_mode: 'hybrid',
      status: 'on-leave',
      availability_status: 'on_leave',
      notes: 'Currently on planned leave until next Monday.',
      skills: [
        { name: 'Talent Acquisition', proficiency: 5, is_primary: true },
        { name: 'Employee Engagement', proficiency: 4, is_primary: true },
        { name: 'Performance Management', proficiency: 4, is_primary: true },
        { name: 'HR Operations', proficiency: 3, is_primary: false }
      ],
      interests: ['Workplace Well-being', 'Employer Branding', 'Diversity & Inclusion'],
      hobbies: ['Yoga', 'Pottery', 'Baking'],
      strengths: ['Interpersonal Relations', 'Active Listening', 'Talent Evaluation'],
      development_areas: ['Labor Law Compliance', 'HR Automation'],
      career_interests: ['HR Business Partner', 'Head of People Operations'],
      bio: 'Passionate HR specialist driving full-lifecycle recruitment, onboarding experiences, and talent retention strategies.'
    });

    // Update reporting managers: Arjun, Priya report to Rajesh; DEMO engineers report to Sneha
    await conn.query('UPDATE employees SET reporting_manager_id = ? WHERE employee_code IN (?, ?)', [
      rajeshId, 'EMP-0011', 'EMP-0012'
    ]);

    console.log('Seeding completed successfully!');
  } finally {
    conn.release();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}

module.exports = seed;
