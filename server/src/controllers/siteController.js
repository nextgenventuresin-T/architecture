'use strict';

const asyncHandler = require('../utils/asyncHandler');
const siteService = require('../services/siteService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/** GET /api/sites/:id */
const detail = asyncHandler(async (req, res) => ok(res, await siteService.getDetail(req.params.id)));

/** PATCH /api/sites/:id */
const update = asyncHandler(async (req, res) => ok(res, { site: await siteService.update(req.params.id, req.body) }));

/** DELETE /api/sites/:id */
const remove = asyncHandler(async (req, res) => {
  await siteService.remove(req.params.id);
  ok(res, { message: 'Site removed.' });
});

/** POST /api/sites/:id/activities */
const logActivity = asyncHandler(async (req, res) =>
  ok(res, { activity: await siteService.logActivity(req.params.id, req.body, req.user?.id) }, 201)
);

module.exports = { detail, update, remove, logActivity };
