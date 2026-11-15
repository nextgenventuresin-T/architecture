import axiosClient from './axiosClient';

/**
 * Material receiving for Site Engineers and Project Managers:
 *   GET  /site-receiving/incoming              deliveries waiting at my sites
 *   POST /site-receiving/movements/:id/receive in-transit shipment (Central -> Site, Site Store)
 *   POST /site-receiving/orders/:id/receive    vendor order delivered to my site
 */
export const siteReceivingApi = {
  incoming: () => axiosClient.get('/site-receiving/incoming').then((r) => r.data.data),
  receiveShipment: (id, payload) => axiosClient.post(`/site-receiving/movements/${id}/receive`, payload).then((r) => r.data.data),
  receiveOrder: (id, payload) => axiosClient.post(`/site-receiving/orders/${id}/receive`, payload).then((r) => r.data.data),
};
