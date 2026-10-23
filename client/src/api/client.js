import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

const tokens = {
  get access() { return localStorage.getItem('ss_access'); },
  get refresh() { return localStorage.getItem('ss_refresh'); },
  set({ accessToken, refreshToken }) {
    if (accessToken) localStorage.setItem('ss_access', accessToken);
    if (refreshToken) localStorage.setItem('ss_refresh', refreshToken);
  },
  clear() { localStorage.removeItem('ss_access'); localStorage.removeItem('ss_refresh'); },
};

api.interceptors.request.use((config) => {
  if (tokens.access) config.headers.Authorization = `Bearer ${tokens.access}`;
  return config;
});

let refreshing = null;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && tokens.refresh && !original._retry && !original.url.includes('/auth/')) {
      original._retry = true;
      try {
        refreshing = refreshing || axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken: tokens.refresh });
        const { data } = await refreshing;
        tokens.set(data);
        return api(original);
      } catch (e) {
        tokens.clear();
        window.dispatchEvent(new Event('ss:logout'));
      } finally { refreshing = null; }
    }
    return Promise.reject(error);
  },
);

export const errMsg = (e) => e?.response?.data?.message || e?.message || 'Something went wrong';
export { tokens };
export default api;
