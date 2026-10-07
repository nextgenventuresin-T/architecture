'use strict';

const vendorModel = require('../models/vendorModel');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const noContent = (res) => res.status(204).end();

const list = asyncHandler(async (req, res) => {
  const result = await vendorModel.findAll({
    search: req.query.search,
    status: req.query.status,
    page: req.query.page,
    pageSize: req.query.pageSize,
  });
  ok(res, { vendors: result.rows, total: result.total });
});

const getById = asyncHandler(async (req, res) => {
  const vendor = await vendorModel.findById(req.params.id);
  if (!vendor) throw ApiError.notFound('Vendor not found');
  ok(res, { vendor });
});

const create = asyncHandler(async (req, res) => {
  if (!req.body.name || !req.body.name.trim()) {
    throw ApiError.badRequest('Vendor name is required');
  }
  const vendor = await vendorModel.create(req.body);
  ok(res, { vendor }, 201);
});

const update = asyncHandler(async (req, res) => {
  const existing = await vendorModel.findById(req.params.id);
  if (!existing) throw ApiError.notFound('Vendor not found');
  const updated = await vendorModel.update(req.params.id, req.body);
  ok(res, { vendor: updated });
});

const remove = asyncHandler(async (req, res) => {
  const existing = await vendorModel.findById(req.params.id);
  if (!existing) throw ApiError.notFound('Vendor not found');
  await vendorModel.remove(req.params.id);
  noContent(res);
});

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
