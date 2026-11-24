import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type LoginResult } from '../auth/AuthContext';
import { AuthCard, Field, useForm } from '../components/Form';
import FlipexLoader from '../components/FlipexLoader';

export default function Login() {
  const { login, verify2fa, resend2fa } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // 2FA state
  const [twoFactorData, setTwoFactorData] = useState<LoginResult | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [resendStatus, setResendStatus] = useState('');

  const f = useForm(async () => {
    const res = await login(email, password);
    if (res && res.twoFactorRequired) {
      setTwoFactorData(res);
    } else {
      nav('/dashboard');
    }
  });

  const f2fa = useForm(async () => {
    if (!twoFactorData?.twoFactorToken) return;
    await verify2fa(twoFactorData.twoFactorToken, otpCode);
    nav('/dashboard');
  });

  const handleResend = async () => {
    if (!twoFactorData?.twoFactorToken) return;
    try {
      setResendStatus('Sending…');
      await resend2fa(twoFactorData.twoFactorToken);
      setResendStatus('New code sent to your email!');
      setTimeout(() => setResendStatus(''), 4000);
    } catch {
      setResendStatus('Failed to resend code');
    }
  };

  if (twoFactorData) {
    const isTotp = twoFactorData.method === 'totp';
    return (
      <AuthCard title={isTotp ? 'Authenticator 2FA' : 'Two-Factor Security'}>
        <p className="muted" style={{ margin: '0 0 16px 0', fontSize: '14px' }}>
          {isTotp
            ? 'Open your Authenticator app (Google Authenticator, Microsoft Authenticator, 1Password) and enter the 6-digit verification code.'
            : <>We sent a 6-digit verification code to <b>{twoFactorData.email || email}</b>. Enter it below to complete sign in.</>}
        </p>

        <form onSubmit={f2fa.submit}>
          <label className="field">
            <span>6-Digit Verification Code</span>
            <input
              type="text"
              maxLength={6}
              autoFocus
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="••••••"
              style={{
                fontSize: '24px',
                textAlign: 'center',
                letterSpacing: '8px',
                fontWeight: '700',
              }}
            />
          </label>

          {f2fa.error && <p className="err">{f2fa.error}</p>}
          {resendStatus && <p style={{ color: '#F5C542', fontSize: '13px' }}>{resendStatus}</p>}

          <button disabled={f2fa.busy || otpCode.length < 6} style={{ width: '100%', marginBottom: '12px' }}>
            {f2fa.busy ? 'Verifying Code…' : 'Verify & Continue ➔'}
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', fontSize: '13px' }}>
          {!isTotp && <button className="link" onClick={handleResend}>Resend Code</button>}
          <button className="link" onClick={() => { setTwoFactorData(null); setOtpCode(''); }} style={{ marginLeft: isTotp ? 'auto' : undefined }}>
            ← Back to Sign In
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to manage your publications, leads and analytics.">
      <form onSubmit={f.submit}>
        <Field label="Email or Username" name="email" type="text" autoComplete="username" value={email} onChange={setEmail} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
        {f.error && <p className="err">{f.error}</p>}
        <button disabled={f.busy} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          {f.busy ? (
            <>
              <FlipexLoader size="xs" centered={false} label={null} speedMs={420} />
              <span>Signing in…</span>
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>
      <div className="nx-auth-links">
        <Link to="/forgot-password">Forgot password?</Link>
        <Link to="/register">Create an account</Link>
      </div>
      <div className="nx-auth-secure">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        <span>Encrypted sign-in with optional two-factor protection</span>
      </div>
    </AuthCard>
  );
}
