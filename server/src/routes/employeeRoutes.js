'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const { ROLES } = require('../config/roles');
const controller = require('../controllers/employeeController');

const router = express.Router();

// Everything below needs a signed-in user.
router.use(requireAuth);
router.use(requirePermission('employees', 'view'));

const TYPES = ['full-time', 'part-time', 'contract', 'consultant', 'intern', 'daily-wage'];
const STATUSES = ['active', 'on-leave', 'inactive', 'resigned'];
const canCreate = requirePermission('employees', 'create');
const canEdit = requirePermission('employees', 'edit');

const employeeRules = (isCreate) => {
  const required = (chain, message) => (isCreate ? chain.notEmpty().withMessage(message) : chain.optional());
  return [
    required(body('full_name').trim().isLength({ max: 150 }).withMessage('That name is too long.'), 'Enter the employee name.'),
    required(body('designation').trim().isLength({ max: 80 }).withMessage('Keep the designation under 80 characters.'), 'Enter a role or designation.'),
    // Optional on create — the API generates EMP-#### when it is left blank.
    body('employee_code').optional({ nullable: true }).trim().isLength({ max: 30 }).withMessage('Keep the employee ID under 30 characters.'),
    body('department').optional({ nullable: true }).trim().isLength({ max: 100 }),
    body('reporting_manager_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('reportingManagerId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('employee_type').optional().isIn(TYPES).withMessage('Choose a valid employee type.'),
    body('joining_date').optional({ nullable: true }).isISO8601().withMessage('Enter a valid joining date.'),
    body('experience_years').optional({ nullable: true }).isFloat({ min: 0 }),
    body('experienceYears').optional({ nullable: true }).isFloat({ min: 0 }),
    body('email').optional({ nullable: true }).isEmail().withMessage('Enter a valid email address.'),
    body('phone').optional({ nullable: true }).trim().isLength({ max: 30 }),
    body('address').optional({ nullable: true }).trim().isLength({ max: 255 }),
    body('work_location').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('workLocation').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('work_mode').optional().trim(),
    body('workMode').optional().trim(),
    body('status').optional().isIn(STATUSES).withMessage('Choose a valid status.'),
    body('availability_status').optional().trim(),
    body('availabilityStatus').optional().trim(),
    body('avatar_url').optional({ nullable: true }).trim(),
    body('avatarUrl').optional({ nullable: true }).trim(),
    body('notes').optional({ nullable: true }).trim(),
    body('skills').optional().isArray(),
    body('profile360').optional().isObject(),
    body('interests').optional(),
    body('hobbies').optional(),
    body('strengths').optional(),
    body('development_areas').optional(),
    body('developmentAreas').optional(),
    body('career_interests').optional(),
    body('careerInterests').optional(),
    body('user_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('userId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('createUserAccess').optional({ nullable: true }).isObject(),
  ];
};

// Declared before `/:id` so the literal path is not swallowed by the id rule.
router.get('/lookups', controller.lookups);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('smartSearch').optional().trim(),
    query('status').optional().trim(),
    query('type').optional().trim(),
    query('designation').optional().trim(),
    query('department').optional().trim(),
    query('reportingManagerId').optional().trim(),
    query('skill').optional().trim(),
    query('minProficiency').optional().isInt({ min: 1, max: 5 }).toInt(),
    query('careerInterest').optional().trim(),
    query('interest').optional().trim(),
    query('hobby').optional().trim(),
    query('strength').optional().trim(),
    query('developmentArea').optional().trim(),
    query('workLocation').optional().trim(),
    query('workMode').optional().trim(),
    query('availabilityStatus').optional().trim(),
    query('projectId').optional().isInt({ min: 1 }).toInt(),
    query('siteId').optional().isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.list
);

router.get('/hierarchy', controller.hierarchy);
router.get('/:id/hierarchy', [param('id').isInt({ min: 1 })], validate, controller.employeeHierarchy);
router.get('/:id', [param('id').isInt({ min: 1 })], validate, controller.detail);

router.post('/', canCreate, employeeRules(true), validate, controller.create);

router.patch('/:id', canEdit, [param('id').isInt({ min: 1 }), ...employeeRules(false)], validate, controller.update);

// Posting someone to a project/site changes who is accountable — Admin only,
// matching how Interface 4 gates contractor assignment.
router.post(
  '/:id/assign',
  requireRole(ROLES.ADMIN),
  [
    param('id').isInt({ min: 1 }),
    body('project_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Select a valid project.').toInt(),
    body('site_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Select a valid site.').toInt(),
    body('role').optional({ nullable: true }).trim().isLength({ max: 80 }),
    body('notes').optional({ nullable: true }).trim(),
  ],
  validate,
  controller.assign
);

router.delete(
  '/:id/assignments/:assignmentId',
  requireRole(ROLES.ADMIN),
  [param('id').isInt({ min: 1 }), param('assignmentId').isInt({ min: 1 })],
  validate,
  controller.endAssignment
);

module.exports = router;
