import { Link, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <p className="center">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <header className="nav">
        <Link to="/dashboard"><b>📖 FlipBook</b></Link>
        <nav>
          <Link to="/settings">{user.name}</Link>
          <LogoutButton />
        </nav>
      </header>
      <main className="container"><Outlet /></main>
    </>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  return <button className="link" onClick={logout}>Log out</button>;
}
