import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, refreshSession, setAccessToken, setAuthLostHandler } from '../api/client';

export interface User { id: number; email: string; name: string; role: string; emailVerified: boolean }

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  setUser(u: User): void;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAuthLostHandler(() => { setAccessToken(null); setUser(null); });
    refreshSession().then((s: any) => { if (s) setUser(s.user); }).finally(() => setLoading(false));
  }, []);

  const value: AuthCtx = {
    user, loading, setUser,
    async login(email, password) {
      const d = await api('/auth/login', 'POST', { email, password });
      setAccessToken(d.accessToken);
      setUser(d.user);
    },
    async logout() {
      await api('/auth/logout', 'POST').catch(() => {});
      setAccessToken(null);
      setUser(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
