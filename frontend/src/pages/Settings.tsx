import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Field, useForm } from '../components/Form';

interface Session { id: number; userAgent: string; ip: string; createdAt: string; current: boolean }

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const nav = useNavigate();

  const [name, setName] = useState(user?.name ?? '');
  const [profileMsg, setProfileMsg] = useState('');
  const profile = useForm(async () => {
    const d = await api('/me', 'PATCH', { name });
    setUser({ ...user!, name: d.name });
    setProfileMsg('Saved');
  });

  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const pw = useForm(async () => {
    await api('/me/password', 'PUT', { currentPassword, newPassword });
    setCurrent(''); setNew(''); setPwMsg('Password changed');
  });

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user?.twoFactorEnabled ?? false);
  const [twoFactorMsg, setTwoFactorMsg] = useState('');
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);

  useEffect(() => {
    api<any>('/me').then((d) => {
      if (d) setTwoFactorEnabled(!!d.twoFactorEnabled);
    });
  }, []);

  const toggle2fa = async () => {
    const nextState = !twoFactorEnabled;
    const action = nextState ? 'enable' : 'disable';
    if (!confirm(`Are you sure you want to ${action} Two-Factor Authentication via email?`)) return;

    setTwoFactorBusy(true);
    setTwoFactorMsg('');
    try {
      const res = await api<{ twoFactorEnabled: boolean }>('/me/two-factor', 'POST', { enabled: nextState });
      setTwoFactorEnabled(res.twoFactorEnabled);
      setTwoFactorMsg(`Two-Factor Authentication is now ${res.twoFactorEnabled ? 'ENABLED' : 'DISABLED'}.`);
    } catch (err: any) {
      setTwoFactorMsg(`Failed: ${err.message}`);
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const [sessions, setSessions] = useState<Session[]>([]);
  const load = () => api<Session[]>('/me/sessions').then(setSessions);
  useEffect(() => { load(); }, []);

  const [delPassword, setDelPassword] = useState('');
  const del = useForm(async () => {
    if (!confirm('Delete your account? This cannot be undone.')) return;
    await api('/me', 'DELETE', { password: delPassword });
    await logout(); nav('/login');
  });

  return (
    <div className="stack">
      <h1>Account settings</h1>

      <form className="card" onSubmit={profile.submit}>
        <h2>Profile</h2>
        <p className="muted">{user?.email}</p>
        <Field label="Name" name="name" value={name} onChange={setName} error={profile.fields.name} />
        <button disabled={profile.busy}>Save</button> {profileMsg && <small>{profileMsg}</small>}
      </form>

      <form className="card" onSubmit={pw.submit}>
        <h2>Password</h2>
        <Field label="Current password" name="cur" type="password" value={currentPassword} onChange={setCurrent} error={pw.fields.currentPassword} />
        <Field label="New password" name="new" type="password" value={newPassword} onChange={setNew} error={pw.fields.newPassword} />
        <button disabled={pw.busy}>Change password</button> {pwMsg && <small>{pwMsg}</small>}
      </form>

      <div className="card">
        <h2>🛡️ Two-Factor Authentication (Email)</h2>
        <p className="muted" style={{ fontSize: '14px', lineHeight: 1.5, margin: '0 0 16px 0' }}>
          Enhance your account security. When 2FA is enabled, Nuvis Flipex will send a temporary 6-digit verification code to <b>{user?.email}</b> every time you sign in.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 600, marginRight: '10px' }}>Current Status:</span>
            <span className={`badge ${twoFactorEnabled ? 'badge-success' : 'badge-neutral'}`}>
              {twoFactorEnabled ? 'ENABLED' : 'DISABLED'}
            </span>
          </div>
          <button
            type="button"
            className={twoFactorEnabled ? 'btn-secondary' : 'btn-primary'}
            onClick={toggle2fa}
            disabled={twoFactorBusy}
          >
            {twoFactorBusy ? 'Updating…' : (twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA via Email')}
          </button>
        </div>
        {twoFactorMsg && <p style={{ marginTop: '12px', fontSize: '13px', color: '#166534' }}>{twoFactorMsg}</p>}
      </div>

      <div className="card">
        <h2>Active sessions</h2>
        {sessions.map((s) => (
          <div className="row" key={s.id}>
            <span>{s.userAgent || 'Unknown device'} · {s.ip} {s.current && <b>(this device)</b>}</span>
            {!s.current && <button className="link" onClick={() => api(`/me/sessions/${s.id}`, 'DELETE').then(load)}>Sign out</button>}
          </div>
        ))}
      </div>

      <form className="card danger" onSubmit={del.submit}>
        <h2>Delete account</h2>
        <Field label="Confirm with password" name="delpw" type="password" value={delPassword} onChange={setDelPassword} error={del.fields.password} />
        <button disabled={del.busy}>Delete my account</button>
      </form>
    </div>
  );
}
