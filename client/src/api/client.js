import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

const tokens = {
  get access() { return localStorage.getItem('ss_access'); },
  get refresh() { return localStorage.getItem('ss_refresh'); },
  set({ accessToken, refreshToken }) {
    if (accessToken) {
      localStorage.setItem('ss_access', accessToken);
      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
    }
    if (refreshToken) localStorage.setItem('ss_refresh', refreshToken);
  },
  clear() {
    localStorage.removeItem('ss_access');
    localStorage.removeItem('ss_refresh');
    delete api.defaults.headers.common.Authorization;
  },
};

// Initialize authorization header on app start if token is already present
if (tokens.access) {
  api.defaults.headers.common.Authorization = `Bearer ${tokens.access}`;
}

api.interceptors.request.use((config) => {
  const token = tokens.access;
  if (token) {
    if (config.headers?.set) {
      config.headers.set('Authorization', `Bearer ${token}`);
    } else {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

let refreshing = null;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && tokens.refresh && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      try {
        if (!refreshing) {
          refreshing = axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken: tokens.refresh });
        }
        const { data } = await refreshing;
        tokens.set(data);
        if (original.headers?.set) {
          original.headers.set('Authorization', `Bearer ${data.accessToken}`);
        } else {
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${data.accessToken}`;
        }
        return api(original);
      } catch (e) {
        tokens.clear();
        window.dispatchEvent(new Event('ss:logout'));
      } finally {
        refreshing = null;
      }
    }
    return Promise.reject(error);
  },
);

export const errMsg = (e) => e?.response?.data?.message || e?.message || 'Something went wrong';
export { tokens };
export default api;

