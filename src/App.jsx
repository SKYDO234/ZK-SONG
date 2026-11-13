import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './context/AppContext';
import ToastContainer from './components/ToastContainer';
import GlobalPlayer from './components/GlobalPlayer';
import LandingPage from './pages/LandingPage';
import { LoginPage, RegisterPage, ForgotPasswordPage } from './pages/AuthPages';
import { UserDashboard, MySongs, UploadSong, AccountManagement } from './pages/user/UserPanel';
import { AdminDashboard, AdminSongs, ApprovedSongs } from './pages/admin/AdminPanel';
import AdminSongDetails from './pages/admin/SongDetails';
import UserManagement from './pages/admin/UserManagement';
import ApiKeyManagement from './pages/admin/ApiKeyManagement';
import PlatformSettings from './pages/admin/PlatformSettings';
import { Spinner } from './components/Common';

function FullScreenLoader({ label = 'Loading studio…' }) {
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 dark:bg-[#07070c]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-500 grid place-items-center shadow-xl shadow-violet-600/30 animate-pulse">
          <span className="text-white font-black">ZK</span>
        </div>
        <p className="text-sm font-bold text-slate-500 flex items-center gap-2">
          <Spinner className="w-4 h-4" /> {label}
        </p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loadingAuth } = useApp();
  const location = useLocation();

  if (loadingAuth) return <FullScreenLoader label="Verifying session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/user/dashboard" replace />;
  }
  return children;
}

function PublicOnlyRoute({ children }) {
  const { user, loadingAuth } = useApp();
  if (loadingAuth) return <FullScreenLoader label="Checking session…" />;
  if (user) {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard'} replace />;
  }
  return children;
}

export default function App() {
  return (
    <>
      <ToastContainer />
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* User Panel */}
        <Route
          path="/user/dashboard"
          element={
            <ProtectedRoute>
              <UserDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user/songs"
          element={
            <ProtectedRoute>
              <MySongs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user/upload"
          element={
            <ProtectedRoute>
              <UploadSong />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user/account"
          element={
            <ProtectedRoute>
              <AccountManagement />
            </ProtectedRoute>
          }
        />

        {/* Admin Panel */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute adminOnly>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/songs"
          element={
            <ProtectedRoute adminOnly>
              <AdminSongs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/songs/:id"
          element={
            <ProtectedRoute adminOnly>
              <AdminSongDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/approved"
          element={
            <ProtectedRoute adminOnly>
              <ApprovedSongs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute adminOnly>
              <UserManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/api-keys"
          element={
            <ProtectedRoute adminOnly>
              <ApiKeyManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <ProtectedRoute adminOnly>
              <PlatformSettings />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <GlobalPlayer />
    </>
  );
}
