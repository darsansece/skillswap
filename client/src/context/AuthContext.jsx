import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { tokens } from '../api/client';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    if (!tokens.access) { setUser(null); setLoading(false); return null; }
    try { const { data } = await api.get('/auth/me'); setUser(data.user); return data.user; }
    catch { setUser(null); return null; }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refreshMe();
    const onLogout = () => setUser(null);
    window.addEventListener('ss:logout', onLogout);
    return () => window.removeEventListener('ss:logout', onLogout);
  }, [refreshMe]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    tokens.set(data); setUser(data.user);
    return data;
  };
  const register = async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    tokens.set(data); setUser(data.user);
    return data;
  };
  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    tokens.clear(); setUser(null);
  };

  const isAdmin = Boolean(user && user.email && user.email.toLowerCase() === 'admin@skillswap.dev');
  const isStaff = Boolean(user && (isAdmin || ['admin', 'moderator'].includes(user.role)));
  return <AuthCtx.Provider value={{ user, setUser, loading, login, register, logout, refreshMe, isStaff, isAdmin }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
