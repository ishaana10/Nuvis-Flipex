import React, { lazy, Suspense, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import './styles.css';

// Auth pages are tiny and are the entry point for signed-out visitors.
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

// Route-level chunks: a public reader never downloads dashboard / admin / billing / DevOps code.
const PublicViewer = lazy(() => import('./pages/PublicViewer'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Preview = lazy(() => import('./pages/Preview'));
const HotspotEditor = lazy(() => import('./pages/HotspotEditor'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const IntegrationsHub = lazy(() => import('./pages/IntegrationsHub'));
const BillingPortal = lazy(() => import('./pages/BillingPortal'));
const DevOpsCenter = lazy(() => import('./pages/DevOpsCenter'));

/** One loading boundary per area so a slow chunk only blanks its own region. */
function Boundary({ area, children }: { area: string; children: ReactNode }) {
  return (
    <Suspense fallback={<p className="center" role="status" aria-label={`Loading ${area}`}>Loading {area}…</p>}>
      {children}
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Boundary area="sign in"><Login /></Boundary>} />
          <Route path="/register" element={<Boundary area="sign up"><Register /></Boundary>} />
          <Route path="/verify-email" element={<Boundary area="verification"><VerifyEmail /></Boundary>} />
          <Route path="/forgot-password" element={<Boundary area="password reset"><ForgotPassword /></Boundary>} />
          <Route path="/reset-password" element={<Boundary area="password reset"><ResetPassword /></Boundary>} />
          <Route path="/v/:slug" element={<Boundary area="reader"><PublicViewer /></Boundary>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Boundary area="dashboard"><Dashboard view="overview" /></Boundary>} />
            <Route path="/flipbooks" element={<Boundary area="dashboard"><Dashboard view="flipbooks" /></Boundary>} />
            <Route path="/integrations" element={<Boundary area="integrations"><IntegrationsHub /></Boundary>} />
            <Route path="/billing" element={<Boundary area="billing"><BillingPortal /></Boundary>} />
            <Route path="/devops" element={<Boundary area="DevOps"><DevOpsCenter /></Boundary>} />
            <Route path="/dashboard/preview/:id" element={<Boundary area="preview"><Preview /></Boundary>} />
            <Route path="/dashboard/editor/:id" element={<Boundary area="editor"><HotspotEditor /></Boundary>} />
            <Route path="/dashboard/analytics/:id" element={<Boundary area="analytics"><Analytics /></Boundary>} />
            <Route path="/admin" element={<Boundary area="admin console"><AdminPanel /></Boundary>} />
            <Route path="/settings" element={<Boundary area="settings"><Settings /></Boundary>} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
