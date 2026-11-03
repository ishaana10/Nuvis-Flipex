import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { AuthCard, Field, useForm } from '../components/Form';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const f = useForm(async () => {
    await api('/auth/reset-password', 'POST', { token: params.get('token') ?? '', password });
    setDone(true);
  });

  return (
    <AuthCard title="Choose a new password">
      {done ? <p>Password updated. <Link to="/login">Sign in</Link></p> : (
        <form onSubmit={f.submit}>
          <Field label="New password" name="password" type="password" autoComplete="new-password" value={password} onChange={setPassword} error={f.fields.password} />
          {f.error && <p className="err">{f.error}</p>}
          <button disabled={f.busy}>Update password</button>
        </form>
      )}
    </AuthCard>
  );
}
