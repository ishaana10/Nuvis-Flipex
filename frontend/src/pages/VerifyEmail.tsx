import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { AuthCard } from '../components/Form';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'pending' | 'ok' | 'fail'>('pending');

  useEffect(() => {
    api('/auth/verify-email', 'POST', { token: params.get('token') ?? '' })
      .then(() => setState('ok'))
      .catch(() => setState('fail'));
  }, [params]);

  return (
    <AuthCard title="Email verification">
      {state === 'pending' && <p>Verifying…</p>}
      {state === 'ok' && <p>Your email is verified. <Link to="/login">Sign in</Link></p>}
      {state === 'fail' && <p className="err">This link is invalid or has expired.</p>}
    </AuthCard>
  );
}
