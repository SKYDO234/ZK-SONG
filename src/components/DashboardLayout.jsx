import React, { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Music4,
  UploadCloud,
  Settings,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  Bell,
  ShieldCheck,
  KeyRound,
  Users,
  ListMusic,
  Disc3,
  ExternalLink,
  ChevronRight,
  CheckCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import ArtistOfMonthBadge from './ArtistOfMonthBadge';
import { formatDate } from './Common';

const USER_NAV = [
  { to: '/user/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/user/songs', label: 'My Songs', icon: Music4 },
  { to: '/user/upload', label: 'Upload Song', icon: UploadCloud },
  { to: '/user/account', label: 'Account Management', icon: Settings },
];

const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/songs', label: 'Songs Management', icon: ListMusic },
  { to: '/admin/approved', label: 'Approved Songs', icon: Disc3 },
  { to: '/admin/users', label: 'User Management', icon: Users },
  { to: '/admin/api-keys', label: 'API Key Management', icon: KeyRound },
  { to: '/admin/settings', label: 'Platform Settings', icon: Settings },
];

export function DashboardLayout({ variant = 'user', title, subtitle, actions, children }) {
  const { user, logout, theme, toggleTheme, settings, authFetch, unreadNotifications, setUnreadNotifications } =
    useApp();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const isAdmin = variant === 'admin';
  const nav = isAdmin ? ADMIN_NAV : USER_NAV;

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const loadNotifications = async () => {
    if (isAdmin) return;
    setLoadingNotifs(true);
    try {
      const res = await authFetch('/api/user/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      /* silent */
    } finally {
      setLoadingNotifs(false);
    }
  };

  const toggleNotifications = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) {
      await loadNotifications();
      if (unreadNotifications > 0) {
        await authFetch('/api/user/notifications/read', { method: 'POST' }).catch(() => {});
        setUnreadNotifications(0);
      }
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07070c] text-slate-900 dark:text-slate-100">
      {/* Ambient gradients */}
      <div className="pointer-events-none fixed top-0 left-1/4 w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-[140px]" />
      <div className="pointer-events-none fixed bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-cyan-500/10 blur-[140px]" />

      {/* Sidebar */}
      <aside
        className={`fixed z-[70] inset-y-0 left-0 w-[272px] bg-white dark:bg-[#0a0a12] border-r border-slate-200 dark:border-white/10 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-white/10 shrink-0">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <img
              src={settings.logo_url || '/uploads/branding/zk-logo.svg'}
              alt={settings.site_name}
              className="w-9 h-9 rounded-xl object-cover border border-violet-500/30 shrink-0"
            />
            <div className="min-w-0">
              <p className="font-black text-sm tracking-tight truncate">{settings.site_name}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500">
                {isAdmin ? 'Admin Console' : 'Artist Studio'}
              </p>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <img
              src={user?.avatar_url || '/uploads/avatars/avatar-aria.svg'}
              alt={user?.name}
              className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-white/15 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-extrabold truncate flex items-center gap-1">
                {user?.name || 'Artist'}
                {isAdmin && <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              </p>
              <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          {user?.is_artist_of_the_month && (
            <div className="mt-3">
              <ArtistOfMonthBadge
                size="xs"
                monthLabel={user.artist_of_month_badge?.month}
              />
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <p className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            {isAdmin ? 'Administration' : 'Studio'}
          </p>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-violet-600 to-violet-500 text-white shadow-lg shadow-violet-600/25'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
            </NavLink>
          ))}

          <div className="pt-4">
            <p className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Platform
            </p>
            <Link
              to="/"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Public Catalogue</span>
            </Link>
            {!isAdmin && user?.role === 'admin' && (
              <Link
                to="/admin/dashboard"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Open Admin Panel</span>
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/user/dashboard"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-colors"
              >
                <Music4 className="w-4 h-4" />
                <span>Open Artist Studio</span>
              </Link>
            )}
          </div>
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-white/10 space-y-1.5">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[65] bg-slate-950/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          role="presentation"
        />
      )}

      {/* Main */}
      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-[60] h-16 bg-white/85 dark:bg-[#07070c]/85 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 flex items-center gap-3 px-4 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-white/10"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-black tracking-tight truncate">{title}</h1>
            {subtitle && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {actions}
            {!isAdmin && (
              <div className="relative">
                <button
                  onClick={toggleNotifications}
                  className="relative p-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black grid place-items-center">
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-[68]"
                      onClick={() => setNotifOpen(false)}
                      role="presentation"
                    />
                    <div className="absolute right-0 mt-2 z-[69] w-[320px] sm:w-[360px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden animate-scale-in">
                      <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                        <p className="text-sm font-extrabold">Notifications</p>
                        <CheckCheck className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
                        {loadingNotifs && (
                          <div className="p-4 space-y-2">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="h-12 rounded-lg skeleton" />
                            ))}
                          </div>
                        )}
                        {!loadingNotifs && notifications.length === 0 && (
                          <p className="p-6 text-center text-xs text-slate-500">
                            No notifications yet.
                          </p>
                        )}
                        {notifications.map((n) => (
                          <div key={n.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5">
                            <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                              {n.title}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                              {n.message}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {formatDate(n.created_at, true)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-extrabold hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Site
            </Link>
          </div>
        </header>

        <main className="p-4 sm:p-6 pb-28 lg:pb-10 max-w-[1500px] mx-auto">{children}</main>
      </div>
    </div>
  );
}

export default DashboardLayout;
