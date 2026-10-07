import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  ArrowRight,
  Filter,
  Search,
  Clock,
  ClipboardCheck,
  HardHat,
  Package,
  Wallet,
  Sparkles,
  Inbox,
  ExternalLink,
} from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import { notificationApi } from '../../../api/notificationApi';
import { formatDate } from '../../../utils/format';

const TYPE_ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  approval: ClipboardCheck,
  task: HardHat,
  material: Package,
  expense: Wallet,
  system: Sparkles,
};

const TYPE_TONES = {
  info: 'text-blue-600 bg-blue-50 border-blue-200',
  success: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  warning: 'text-amber-600 bg-amber-50 border-amber-200',
  error: 'text-rose-600 bg-rose-50 border-rose-200',
  approval: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  task: 'text-amber-700 bg-amber-50 border-amber-200',
  material: 'text-cyan-600 bg-cyan-50 border-cyan-200',
  expense: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  system: 'text-brand-600 bg-brand-50 border-brand-200',
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread' | 'approvals' | 'inventory' | 'system'
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let isReadParam = undefined;
      let categoryParam = undefined;

      if (activeTab === 'unread') {
        isReadParam = false;
      } else if (activeTab === 'approvals') {
        categoryParam = 'task'; // or approval
      } else if (activeTab === 'inventory') {
        categoryParam = 'material';
      } else if (activeTab === 'system') {
        categoryParam = 'system';
      }

      const data = await notificationApi.list({
        page,
        pageSize,
        isRead: isReadParam,
        category: categoryParam,
        search: search.trim() || undefined,
      });

      setNotifications(data.notifications || []);
      setTotal(data.total || 0);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setError(err.response?.data?.error?.message || err.message || 'Failed to load notifications.');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, search, page, pageSize]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Mark single as read
  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await notificationApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  // Delete single notification
  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await notificationApi.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  // Clear all read notifications
  const handleClearRead = async () => {
    try {
      await notificationApi.clearRead();
      loadNotifications();
    } catch (err) {
      console.error('Failed to clear read:', err);
    }
  };

  // Format relative time helper
  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
    return formatDate(dateStr);
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const unread = unreadCount;
    const taskCount = notifications.filter((n) => n.category === 'task' || n.category === 'approval').length;
    const sysCount = notifications.filter((n) => n.category === 'system').length;
    return { unread, taskCount, sysCount };
  }, [notifications, unreadCount]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications & System Alerts"
        subtitle="Stay updated on project milestones, task assignments, pending approvals, and operational changes."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="gap-1.5"
            >
              <CheckCheck className="h-4 w-4 text-emerald-600" />
              Mark All as Read
            </Button>
            <Button
              variant="secondary"
              onClick={handleClearRead}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4 text-rose-500" />
              Clear Read
            </Button>
            <Button
              variant="secondary"
              onClick={loadNotifications}
              className="gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {error && (
        <Alert tone="error">
          {error}
        </Alert>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="bg-canvas border-line">
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider">Unread Alerts</p>
                <p className="mt-1 text-2xl font-bold text-brand-600 tabular-nums">{unreadCount}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700">
                <Bell className="h-5 w-5" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-canvas border-line">
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider">Total Listed</p>
                <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{total}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                <Inbox className="h-5 w-5" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-canvas border-line">
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider">Tasks & Approvals</p>
                <p className="mt-1 text-2xl font-bold text-indigo-700 tabular-nums">{stats.taskCount}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                <ClipboardCheck className="h-5 w-5" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-canvas border-line">
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider">System Notices</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">{stats.sysCount}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Navigation Filter Tabs & Search */}
      <Card className="border-line bg-white shadow-sm">
        <CardBody className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line/60 pb-3">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {[
                { id: 'all', label: 'All Notifications', count: total },
                { id: 'unread', label: 'Unread Only', count: unreadCount },
                { id: 'approvals', label: 'Tasks & Approvals' },
                { id: 'inventory', label: 'Materials & Vendors' },
                { id: 'system', label: 'System Notices' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setPage(1);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-brand-50 text-brand-700 font-semibold border border-brand-200'
                      : 'text-ink-muted hover:bg-canvas hover:text-ink'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span
                      className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] ${
                        activeTab === tab.id
                          ? 'bg-brand-600 text-white'
                          : 'bg-canvas-subtle text-ink-subtle'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Live Search */}
            <div className="relative min-w-[200px] sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-subtle" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search alerts..."
                className="w-full rounded-lg border border-line pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Notification List */}
      <div className="space-y-3">
        {isLoading ? (
          <Card className="p-8 text-center">
            <Skeleton className="h-6 w-1/3 mx-auto mb-2" />
            <Skeleton className="h-4 w-1/2 mx-auto" />
          </Card>
        ) : notifications.length === 0 ? (
          <Card className="border-line bg-white p-12 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-canvas-subtle border border-line text-ink-subtle">
              <Inbox className="h-7 w-7 text-ink-muted" />
            </div>
            <h3 className="mt-4 text-base font-bold text-ink">You&apos;re all caught up!</h3>
            <p className="mt-1 text-xs text-ink-muted max-w-sm mx-auto">
              There are no {activeTab === 'unread' ? 'unread' : ''} notifications matching the current filter.
            </p>
          </Card>
        ) : (
          notifications.map((item) => {
            const Icon = TYPE_ICONS[item.type] || Info;
            const toneClasses = TYPE_TONES[item.type] || TYPE_TONES.info;

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (!item.isRead) handleMarkAsRead(item.id);
                  if (item.actionUrl) navigate(item.actionUrl);
                }}
                className={`group relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border p-4 transition-all duration-150 cursor-pointer ${
                  item.isRead
                    ? 'border-line bg-white hover:border-brand-200 hover:shadow-xs'
                    : 'border-brand-200 bg-brand-50/20 hover:bg-brand-50/40 shadow-xs'
                }`}
              >
                {/* Left side: Icon, Content, Unread Dot */}
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  {/* Category icon */}
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${toneClasses}`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className={`text-sm font-semibold text-ink flex items-center gap-1.5 ${!item.isRead ? 'font-bold' : ''}`}>
                        {item.title}
                        {!item.isRead && (
                          <span className="h-2 w-2 rounded-full bg-brand-600 animate-pulse" />
                        )}
                      </h4>

                      <Badge tone={item.type === 'error' ? 'danger' : item.type === 'warning' ? 'warning' : 'neutral'} size="sm">
                        {item.category.toUpperCase()}
                      </Badge>
                    </div>

                    <p className="text-xs text-ink-muted leading-relaxed line-clamp-2">
                      {item.message}
                    </p>

                    <div className="flex items-center gap-3 text-[11px] text-ink-subtle pt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimeAgo(item.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side: Actions */}
                <div
                  className="flex items-center gap-2 shrink-0 self-end sm:self-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.actionUrl && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (!item.isRead) handleMarkAsRead(item.id);
                        navigate(item.actionUrl);
                      }}
                      className="h-7 text-xs px-2.5 gap-1 text-brand-700 bg-white border-brand-200 hover:bg-brand-50"
                    >
                      <span>View</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {!item.isRead && (
                    <button
                      type="button"
                      title="Mark as read"
                      onClick={(e) => handleMarkAsRead(item.id, e)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-subtle hover:bg-canvas hover:text-ink transition-colors"
                    >
                      <CheckCheck className="h-4 w-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    title="Delete notification"
                    onClick={(e) => handleDelete(item.id, e)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-subtle hover:bg-rose-50 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {total > pageSize && (
        <div className="flex items-center justify-between border-t border-line pt-4 text-xs text-ink-muted">
          <span>
            Showing {notifications.length} of {total} alerts
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="font-semibold text-ink">Page {page}</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
