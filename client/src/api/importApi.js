import axiosClient from './axiosClient';

// Imports can touch hundreds of rows on a remote database, so allow longer than the default.
const LONG = { timeout: 120000 };

/** Bulk Excel/CSV import: entity is vendors | materials | tools | machines. */
export const importApi = {
  fields: (entity) => axiosClient.get(`/imports/${entity}/fields`).then((r) => r.data.data),
  run: (entity, payload) => axiosClient.post(`/imports/${entity}`, payload, LONG).then((r) => r.data.data),
};

export default importApi;
