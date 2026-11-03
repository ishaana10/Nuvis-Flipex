import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AuthCard, Field, useForm } from '../components/Form';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const f = useForm(async () => { await login(email, password); nav('/dashboard'); });

  return (
    <AuthCard title="Sign in">
      <form onSubmit={f.submit}>
        <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
        {f.error && <p className="err">{f.error}</p>}
        <button disabled={f.busy}>{f.busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p><Link to="/forgot-password">Forgot password?</Link> · <Link to="/register">Create account</Link></p>
    </AuthCard>
  );
}
