import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { AuthCard, Field, useForm } from '../components/Form';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const f = useForm(async () => { await api('/auth/register', 'POST', { name, email, password }); setDone(true); });

  if (done) {
    return (
      <AuthCard title="Check your email">
        <p>We sent a verification link to <b>{email}</b>.</p>
        <Link to="/login">Go to sign in</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Create your account">
      <form onSubmit={f.submit}>
        <Field label="Name" name="name" autoComplete="name" value={name} onChange={setName} error={f.fields.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} error={f.fields.email} />
        <Field label="Password (min 8 chars)" name="password" type="password" autoComplete="new-password" value={password} onChange={setPassword} error={f.fields.password} />
        {f.error && <p className="err">{f.error}</p>}
        <button disabled={f.busy}>{f.busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p>Already registered? <Link to="/login">Sign in</Link></p>
    </AuthCard>
  );
}
