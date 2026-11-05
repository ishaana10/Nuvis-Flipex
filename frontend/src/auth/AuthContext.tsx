import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, refreshSession, setAccessToken, setAuthLostHandler } from '../api/client';

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  tenantRole?: string;
  emailVerified: boolean;
  tenantId?: number | null;
  companyName?: string | null;
  twoFactorEnabled?: boolean;
  twoFactorMethod?: 'email' | 'totp';
}

export interface LoginResult {
  twoFactorRequired?: boolean;
  twoFactorToken?: string;
  email?: string;
  method?: 'email' | 'totp';
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login(email: string, password: string): Promise<LoginResult | void>;
  verify2fa(twoFactorToken: string, code: string): Promise<void>;
  resend2fa(twoFactorToken: string): Promise<void>;
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
      const d = await api<any>('/auth/login', 'POST', { email, password });
      if (d.twoFactorRequired) {
        return {
          twoFactorRequired: true,
          twoFactorToken: d.twoFactorToken,
          email: d.email,
          method: d.method,
        };
      }
      setAccessToken(d.accessToken);
      setUser(d.user);
    },
    async verify2fa(twoFactorToken, code) {
      const d = await api<any>('/auth/verify-2fa', 'POST', { twoFactorToken, code });
      setAccessToken(d.accessToken);
      setUser(d.user);
    },
    async resend2fa(twoFactorToken) {
      await api('/auth/resend-2fa', 'POST', { twoFactorToken });
    },
    async logout() {
      await api('/auth/logout', 'POST').catch(() => {});
      setAccessToken(null);
      setUser(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
