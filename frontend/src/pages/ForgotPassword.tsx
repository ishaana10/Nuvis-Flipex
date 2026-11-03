import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { AuthCard, Field, useForm } from '../components/Form';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const f = useForm(async () => { await api('/auth/forgot-password', 'POST', { email }); setSent(true); });

  return (
    <AuthCard title="Reset password">
      {sent ? <p>If that email exists, a reset link is on its way.</p> : (
        <form onSubmit={f.submit}>
          <Field label="Email" name="email" type="email" value={email} onChange={setEmail} />
          {f.error && <p className="err">{f.error}</p>}
          <button disabled={f.busy}>Send reset link</button>
        </form>
      )}
      <p><Link to="/login">Back to sign in</Link></p>
    </AuthCard>
  );
}
