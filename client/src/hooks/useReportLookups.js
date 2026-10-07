import { useEffect, useState } from 'react';
import reportsApi from '../api/reportsApi';

/**
 * Dropdown data for the project/site/contractor filters, sourced from the
 * Reports API itself so every role only ever gets back what it already has
 * `reports:view` (plus the underlying module's own view permission) to see —
 * no separate lookup endpoint, no extra permission surface. The contractor
 * list is fetched best-effort: several roles (HR, Procurement, Warehouse)
 * hold `reports:view` without `contractors:view`, so a 403 there just means
 * the contractor filter quietly doesn't render rather than breaking the page.
 */
export default function useReportLookups() {
  const [lookups, setLookups] = useState({ projects: [], sites: [], contractors: null });

  useEffect(() => {
    let active = true;

    reportsApi
      .projects({ pageSize: 50 })
      .then((data) => active && setLookups((l) => ({ ...l, projects: data.projects ?? [] })))
      .catch(() => active && setLookups((l) => ({ ...l, projects: [] })));

    reportsApi
      .sites({ pageSize: 50 })
      .then((data) => active && setLookups((l) => ({ ...l, sites: data.sites ?? [] })))
      .catch(() => active && setLookups((l) => ({ ...l, sites: [] })));

    reportsApi
      .contractors({ pageSize: 50 })
      .then((data) => active && setLookups((l) => ({ ...l, contractors: data.contractors ?? [] })))
      .catch(() => active && setLookups((l) => ({ ...l, contractors: null })));

    return () => {
      active = false;
    };
  }, []);

  return lookups;
}
