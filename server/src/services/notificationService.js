'use strict';

const notificationModel = require('../models/notificationModel');
const ApiError = require('../utils/ApiError');

async function list(query = {}, user = null) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

  return notificationModel.findAll({
    userId: user?.id,
    role: user?.role,
    isRead: query.isRead ?? (query.unreadOnly === 'true' ? false : undefined),
    category: query.category,
    type: query.type,
    search: query.search,
    page,
    pageSize,
  });
}

async function getUnreadCount(user = null) {
  const count = await notificationModel.countUnread({
    userId: user?.id,
    role: user?.role,
  });
  return { unreadCount: count };
}

async function markAsRead(id, user = null) {
  const existing = await notificationModel.findById(id);
  if (!existing) {
    throw ApiError.notFound('Notification not found.');
  }

  const updated = await notificationModel.markAsRead(id);
  return { notification: updated };
}

async function markAllAsRead(user = null) {
  const result = await notificationModel.markAllAsRead({
    userId: user?.id,
    role: user?.role,
  });
  return { message: 'All notifications marked as read.', ...result };
}

async function remove(id, user = null) {
  const existing = await notificationModel.findById(id);
  if (!existing) {
    throw ApiError.notFound('Notification not found.');
  }

  await notificationModel.deleteById(id);
  return { message: 'Notification removed.' };
}

async function clearRead(user = null) {
  const result = await notificationModel.clearAllRead({
    userId: user?.id,
    role: user?.role,
  });
  return { message: 'Read notifications cleared.', ...result };
}

async function createNotification(payload) {
  return notificationModel.create(payload);
}

module.exports = {
  list,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  remove,
  clearRead,
  createNotification,
};
