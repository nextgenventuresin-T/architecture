'use strict';

const ApiError = require('../utils/ApiError');
const toolModel = require('../models/toolModel');

async function list(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 50));
  const { rows, total } = await toolModel.findAll({
    search: query.search?.trim(),
    type: query.type,
    status: query.status,
    page,
    pageSize,
  });

  return {
    tools: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id) {
  const tool = await toolModel.findById(id);
  if (!tool) throw ApiError.notFound('Tool not found.');
  return tool;
}

async function create(payload) {
  const existing = await toolModel.findByName(payload.name.trim());
  if (existing) throw ApiError.badRequest('A tool with this name already exists.');

  const id = await toolModel.create({
    code: payload.code?.trim(),
    name: payload.name.trim(),
    type: payload.type?.trim() || 'Equipment',
    description: payload.description?.trim(),
    status: payload.status || 'active',
  });
  return getById(id);
}

async function update(id, payload) {
  await getById(id);
  if (payload.name) {
    const existing = await toolModel.findByName(payload.name.trim());
    if (existing && existing.id !== Number(id)) {
      throw ApiError.badRequest('A tool with this name already exists.');
    }
  }
  await toolModel.update(id, {
    name: payload.name?.trim(),
    type: payload.type?.trim(),
    description: payload.description !== undefined ? payload.description?.trim() || null : undefined,
    status: payload.status,
  });
  return getById(id);
}

async function remove(id) {
  await getById(id);
  await toolModel.remove(id);
  return { success: true };
}

module.exports = { list, getById, create, update, remove };
