'use strict';

const fs = require('fs');
const asyncHandler = require('../utils/asyncHandler');
const dailyWorkService = require('../services/dailyWorkService');
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const list = asyncHandler(async (req, res) => {
  ok(res, await dailyWorkService.list(req.query, req.hrScope));
});

const detail = asyncHandler(async (req, res) => {
  ok(res, { update: await dailyWorkService.getById(req.params.id, req.hrScope) });
});

const create = asyncHandler(async (req, res) => {
  const files = req.files || (req.file ? [req.file] : []);
  const created = await dailyWorkService.create(req.body, files, req.hrScope, req.user?.id);
  ok(res, { update: created }, 201);
});

const getPhoto = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM daily_work_photos WHERE id = ? LIMIT 1', [req.params.photoId]);
  if (!rows.length) throw ApiError.notFound('Photo not found.');

  const photo = rows[0];
  if (!fs.existsSync(photo.file_path)) {
    throw ApiError.notFound('Photo file missing on disk.');
  }

  res.setHeader('Content-Type', photo.file_type || 'image/jpeg');
  res.sendFile(photo.file_path);
});

module.exports = { list, detail, create, getPhoto };
