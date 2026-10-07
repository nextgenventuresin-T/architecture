import { useCallback, useEffect, useState } from 'react';
import dashboardApi from '../api/dashboardApi';
import { toApiError } from '../api/axiosClient';

/**
 * Loads the admin dashboard payload and holds the approval decisions made
 * during the session. Components stay presentational.
 */
export function useDashboardData() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await dashboardApi.getOverview());
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Optimistically records a decision, rolling back if the request fails. */
  const decideApproval = useCallback(async (approvalId, decision) => {
    setData((current) => applyDecision(current, approvalId, decision));
    try {
      await dashboardApi.decideApproval(approvalId, decision);
    } catch {
      setData((current) => applyDecision(current, approvalId, 'pending'));
    }
  }, []);

  return { data, isLoading, error, reload: load, decideApproval };
}

function applyDecision(current, approvalId, decision) {
  if (!current) return current;
  const approvals = current.approvals.map((item) =>
    item.id === approvalId ? { ...item, status: decision } : item
  );
  return {
    ...current,
    approvals,
    summary: {
      ...current.summary,
      pendingApprovals: approvals.filter((item) => item.status === 'pending').length,
    },
  };
}

export default useDashboardData;
