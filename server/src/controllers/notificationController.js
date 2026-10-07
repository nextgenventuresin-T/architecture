'use strict';

const asyncHandler = require('../utils/asyncHandler');
const notificationService = require('../services/notificationService');

const list = asyncHandler(async (req, res) => {
  const result = await notificationService.list(req.query, req.user);
  res.json({ success: true, data: result });
});

const unreadCount = asyncHandler(async (req, res) => {
  const result = await notificationService.getUnreadCount(req.user);
  res.json({ success: true, data: result });
});

const markAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAsRead(req.params.id, req.user);
  res.json({ success: true, data: result });
});

const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user);
  res.json({ success: true, data: result });
});

const remove = asyncHandler(async (req, res) => {
  const result = await notificationService.remove(req.params.id, req.user);
  res.json({ success: true, data: result });
});

const clearRead = asyncHandler(async (req, res) => {
  const result = await notificationService.clearRead(req.user);
  res.json({ success: true, data: result });
});

const create = asyncHandler(async (req, res) => {
  const result = await notificationService.createNotification(req.body);
  res.status(201).json({ success: true, data: { notification: result } });
});

module.exports = {
  list,
  unreadCount,
  markAsRead,
  markAllAsRead,
  remove,
  clearRead,
  create,
};
