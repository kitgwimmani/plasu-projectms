import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState({ features: {} });
  const [loading, setLoading] = useState(!!getToken());

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try {
      const d = await api.get('/auth/me');
      setUser(d.user); setSettings(d.settings || { features: {} });
    } catch { setUser(null); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const onExpire = () => setUser(null);
    window.addEventListener('auth:expired', onExpire);
    return () => window.removeEventListener('auth:expired', onExpire);
  }, []);

  const login = async (email, password) => {
    const d = await api.post('/auth/login', { email, password });
    setToken(d.token); setUser(d.user);
    await refresh();
  };
  const logout = () => { setToken(null); setUser(null); };
  const feature = (k) => settings.features?.[k] !== false;

  return <AuthCtx.Provider value={{ user, setUser, settings, loading, login, logout, refresh, feature }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export const ROLE_LABEL = {
  superadmin: 'Super Admin', sysadmin: 'System Admin', dean: 'Dean', hod: 'Head of Department', lecturer: 'Lecturer', student: 'Student',
};
export const isStaff = (u) => ['lecturer', 'hod', 'dean'].includes(u?.role);
export const isAdminRole = (u) => ['superadmin', 'sysadmin'].includes(u?.role);
