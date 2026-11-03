import { Link, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <p className="center">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <header className="nav">
        <Link to="/dashboard" className="nuvis-brand-link">
          <img src="/logo.png" alt="Nuvis Flipex" className="nuvis-brand-logo" />
          <span className="nuvis-brand-text">Nuvis Flipex</span>
        </Link>
        <nav>
          {user.role === 'admin' && (
            <Link to="/admin" className="admin-nav-link">
              🛡️ Admin Panel
            </Link>
          )}
          <Link to="/dashboard">Publications</Link>
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
