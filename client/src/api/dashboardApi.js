import axiosClient from './axiosClient';
import { reportsApi } from './reportsApi';
import { approvalsApi } from './projectsApi';
import { notificationApi } from './notificationApi';

/**
 * The one place the Admin Dashboard gets its data. The existing dashboard
 * components consume this view model while each value comes from the owning
 * backend module.
 */
function projectView(project) {
  return {
    id: project.id,
    name: project.name,
    contractorId: project.contractor?.id ?? null,
    contractor: project.contractor?.name || 'Unassigned',
    location: project.location || '',
    progress: Number(project.progress || 0),
    status: project.status,
    startDate: project.startDate,
    expectedCompletion: project.expectedCompletion,
    todaysActivity: project.currentPhase || '',
  };
}

function contractorView(contractor, projects) {
  const stats = contractor.stats || {};
  return {
    id: contractor.id,
    name: contractor.name,
    projectIds: projects.filter((project) => project.contractorId === contractor.id).map((project) => project.id),
    site: stats.siteCount ? `${stats.siteCount} site${stats.siteCount === 1 ? '' : 's'}` : '',
    currentWork: '',
    progress: Number(stats.progress || 0),
    workers: Number(stats.labourCount || 0),
    pendingApprovals: Number(stats.pendingApprovals || 0),
    paymentStatus: stats.paymentStatus || 'cleared',
    outstanding: Number(stats.outstanding || 0),
  };
}

function approvalView(approval) {
  return {
    id: approval.id,
    type: approval.request_type || approval.title,
    category: approval.request_type,
    requestedBy: approval.requested_by,
    project: approval.project_name || '',
    amount: approval.amount === null || approval.amount === undefined ? null : Number(approval.amount),
    date: approval.requested_on,
    status: approval.status,
  };
}

function materialView(material) {
  return {
    id: material.id,
    name: material.name,
    unit: material.unit,
    inStock: Number(material.currentStock || 0),
    reorderLevel: Number(material.minStock || 0),
  };
}

export const dashboardApi = {
  async getOverview() {
    const [dashboard, projects, activeSites, contractors, activeContractors, materials, approvals, unreadNotifs] = await Promise.all([
      reportsApi.dashboard(),
      reportsApi.projects({ page: 1, pageSize: 50 }),
      reportsApi.sites({ status: 'active', page: 1, pageSize: 1 }),
      reportsApi.contractors({ page: 1, pageSize: 50 }),
      reportsApi.contractors({ status: 'active', page: 1, pageSize: 1 }),
      reportsApi.materials({ page: 1, pageSize: 50 }),
      approvalsApi.list({ status: 'all' }),
      notificationApi.unreadCount().catch(() => 0),
    ]);

    const projectRows = projects.projects.map(projectView);
    const contractorRows = contractors.contractors.map((contractor) => contractorView(contractor, projectRows));
    const kpis = dashboard.kpis || {};

    return {
      summary: {
        totalProjects: Number(kpis.totalProjects || 0),
        activeSites: Number(activeSites.pagination?.total || 0),
        activeContractors: Number(activeContractors.pagination?.total || 0),
        totalEmployees: Number(kpis.totalEmployees || 0),
        pendingApprovals: approvals.filter((approval) => approval.status === 'pending').length,
        materialRequests: Number(kpis.pendingProcurement || 0),
        outstandingPayments: Number(kpis.outstandingPayments || 0),
        unreadNotifications: Number(unreadNotifs || 0),
      },
      projects: projectRows,
      contractors: contractorRows,
      approvals: approvals.map(approvalView),
      materials: materials.materials.map(materialView),
      todaysActivity: [],
    };
  },

  /**
    * Approve or reject a pending request through the existing approval API.
   */
  async decideApproval(approvalId, decision) {
    const { data } = await axiosClient.patch(`/approvals/${approvalId}`, { decision });
    return data.data.approval;
  },
};

export default dashboardApi;
