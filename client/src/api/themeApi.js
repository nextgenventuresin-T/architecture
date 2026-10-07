import axiosClient from './axiosClient';

const themeApi = {
  getActiveTheme: async (companyId = null) => {
    const params = companyId ? { companyId } : {};
    const res = await axiosClient.get('/settings/theme', { params });
    return res.data?.data;
  },

  listAllThemes: async () => {
    const res = await axiosClient.get('/settings/themes');
    return res.data?.data;
  },

  getThemeForCompany: async (companyId) => {
    const res = await axiosClient.get(`/settings/themes/${companyId}`);
    return res.data?.data;
  },

  saveCompanyTheme: async (companyId, { themeId, themeName, isCustom, colors }) => {
    const target = companyId || 'global';
    const res = await axiosClient.put(`/settings/themes/${target}`, {
      themeId,
      themeName,
      isCustom,
      colors,
    });
    return res.data?.data;
  },

  resetCompanyTheme: async (companyId) => {
    const target = companyId || 'global';
    const res = await axiosClient.delete(`/settings/themes/${target}`);
    return res.data?.data;
  },
};

export default themeApi;
