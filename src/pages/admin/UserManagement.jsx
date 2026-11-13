import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Users,
  ShieldCheck,
  Ban,
  UserCheck,
  Trash2,
  Mail,
  Globe,
  Music4,
  Crown,
  RefreshCw,
  CheckCircle2,
  Clock3,
} from 'lucide-react';
import { monogramAvatar } from '../../components/avatar';
import { useApp } from '../../context/AppContext';
import DashboardLayout from '../../components/DashboardLayout';
import ArtistOfMonthBadge from '../../components/ArtistOfMonthBadge';
import {
  StatCard,
  SectionCard,
  Pagination,
  EmptyState,
  ConfirmDialog,
  Spinner,
  formatDate,
  formatNumber,
  inputClass,
  ghostBtn,
} from '../../components/Common';
import { readJson } from '../../lib/http';

export default function UserManagement() {
  const { authFetch, notify, user: me, refreshBootstrap } = useApp();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ search, status, role, page: String(page), limit: '12' });
      const res = await authFetch(`/api/admin/users?${qs.toString()}`);
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error || 'Failed to load users');
      setUsers(json.users || []);
      setPagination(json.pagination);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [authFetch, search, status, role, page, notify]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => setPage(1), [search, status, role]);

  const toggleBan = async (u) => {
    setBusyId(u.id);
    try {
      const res = await authFetch(`/api/admin/users/${u.id}/ban`, { method: 'POST' });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error || 'Action failed');
      notify(json.message, 'success');
      load();
      refreshBootstrap();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await authFetch(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      notify(json.message, 'success');
      setDeleteTarget(null);
      load();
      refreshBootstrap();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const activeCount = users.filter((u) => u.status === 'active').length;
  const bannedCount = users.filter((u) => u.status === 'banned').length;

  return (
    <DashboardLayout
      variant="admin"
      title="User Management"
      subtitle="Ban, restore, promote, and remove artist accounts"
      actions={
        <button onClick={load} className="p-2.5 rounded-xl border border-white/10 dark:border-white/10 hover:bg-white/[0.06] dark:hover:bg-white/10" aria-label="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 stagger">
        <StatCard label="Total Accounts" value={pagination?.total ?? 0} icon={Users} tone="violet" loading={loading} />
        <StatCard label="Active (page)" value={activeCount} icon={UserCheck} tone="emerald" />
        <StatCard label="Banned (page)" value={bannedCount} icon={Ban} tone="rose" />
        <StatCard
          label="Administrators"
          value={1}
          hint="Single owner account"
          icon={ShieldCheck}
          tone="amber"
        />
      </div>

      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
        <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-extrabold text-amber-700 dark:text-amber-300">
            Single-administrator platform
          </p>
          <p className="text-[11px] text-neutral-300 dark:text-neutral-400 mt-1 leading-relaxed">
            Admin access belongs exclusively to the platform owner account and cannot be granted,
            revoked, banned or deleted from this panel. Artists can still be banned, restored or
            permanently removed.
          </p>
        </div>
      </div>

      <SectionCard title="Platform Accounts" subtitle="Complete user directory with moderation controls">
        <div className="p-4 border-b border-white/10 dark:border-white/10 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, genre, or country…"
              className={`${inputClass} pl-10`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded-lg bg-[#0a0a0b] dark:bg-[#070708] border border-white/10 dark:border-white/10 text-xs font-bold">
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="banned">Banned</option>
            </select>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="px-3 py-2 rounded-lg bg-[#0a0a0b] dark:bg-[#070708] border border-white/10 dark:border-white/10 text-xs font-bold">
              <option value="all">All Roles</option>
              <option value="user">Artists</option>
              <option value="admin">Administrators</option>
            </select>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}
            </div>
          ) : users.length === 0 ? (
            <EmptyState icon={Users} title="No users found" description="Try adjusting search terms or filters." />
          ) : (
            <div className="space-y-2.5 stagger">
              {users.map((u) => {
                const isMe = String(u.id) === String(me?.id);
                const isOpen = expanded === u.id;
                return (
                  <div
                    key={u.id}
                    className={`rounded-2xl border p-3 sm:p-4 transition-all ${
                      u.status === 'banned'
                        ? 'border-rose-500/30 bg-rose-500/5'
                        : 'border-white/10 dark:border-white/10 bg-[#101013]/60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <img
                        src={u.avatar_url || monogramAvatar(u.name, u.id)}
                        alt={u.name}
                        className="w-12 h-12 rounded-xl object-cover border border-white/10 dark:border-white/15 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-extrabold text-sm truncate">{u.name}</p>
                          {isMe && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-500 dark:text-amber-200 text-[9px] font-black">YOU</span>
                          )}
                          {u.role === 'admin' && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 text-[9px] font-black inline-flex items-center gap-0.5">
                              <ShieldCheck className="w-2.5 h-2.5" /> ADMINISTRATOR
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[9px] font-black uppercase ${
                              u.status === 'banned'
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30'
                                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
                            }`}
                          >
                            {u.status}
                          </span>
                          {u.is_artist_of_the_month && (
                            <ArtistOfMonthBadge size="xs" monthLabel={u.artist_of_month_badge?.month} />
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-400 truncate mt-0.5 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {u.email}
                          {u.country && <><span className="opacity-40">•</span><Globe className="w-3 h-3" /> {u.country}</>}
                        </p>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          {u.stats?.uploaded ?? 0} uploaded • {u.stats?.approved ?? 0} approved • joined {formatDate(u.created_at)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setExpanded(isOpen ? null : u.id)}
                          className="px-2.5 py-1.5 rounded-lg border border-white/10 dark:border-white/10 text-[10px] font-extrabold hover:bg-white/[0.06] dark:hover:bg-white/10"
                        >
                          {isOpen ? 'Less' : 'Details'}
                        </button>
                        <button
                          onClick={() => toggleBan(u)}
                          disabled={isMe || u.role === 'admin' || busyId === u.id}
                          className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-extrabold inline-flex items-center gap-1 disabled:opacity-40 ${
                            u.status === 'banned'
                              ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/10'
                              : 'border-amber-500/40 text-amber-600 dark:text-amber-300 hover:bg-amber-500/10'
                          }`}
                          title={u.status === 'banned' ? 'Unban user' : 'Ban user'}
                        >
                          {u.status === 'banned' ? <><UserCheck className="w-3 h-3" /> Unban</> : <><Ban className="w-3 h-3" /> Ban</>}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(u)}
                          disabled={isMe || u.role === 'admin'}
                          className="p-1.5 rounded-lg border border-rose-500/40 text-rose-500 hover:bg-rose-500/10 disabled:opacity-40"
                          title="Delete account"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="mt-3 pt-3 border-t border-white/10 dark:border-white/10 grid sm:grid-cols-2 lg:grid-cols-4 gap-2 animate-fade-in">
                        {[
                          { label: 'Uploaded', value: u.stats?.uploaded, icon: Music4 },
                          { label: 'Approved', value: u.stats?.approved, icon: CheckCircle2 },
                          { label: 'Pending', value: u.stats?.pending, icon: Clock3 },
                          { label: 'Rejected', value: u.stats?.rejected, icon: Crown },
                          { label: 'Approved This Month', value: u.stats?.monthly_approved, icon: Crown },
                          { label: 'Total Plays', value: formatNumber(u.stats?.total_plays), icon: Music4 },
                          { label: 'Downloads', value: formatNumber(u.stats?.total_downloads), icon: Music4 },
                          { label: 'Primary Genre', value: u.primary_genre, icon: Music4 },
                        ].map((s) => (
                          <div key={s.label} className="rounded-xl bg-white/[0.04] dark:bg-white/[0.05] p-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{s.label}</p>
                            <p className="text-sm font-black mt-0.5">{s.value ?? '—'}</p>
                          </div>
                        ))}
                        {u.bio && (
                          <div className="sm:col-span-2 lg:col-span-4 text-[11px] text-neutral-400 dark:text-neutral-400 leading-relaxed">
                            <span className="font-bold text-neutral-200 dark:text-neutral-300">Bio: </span>
                            {u.bio}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </SectionCard>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete user account?"
        message={`"${deleteTarget?.name || ''}" (${deleteTarget?.email || ''}) and every track they uploaded will be permanently deleted from the database and disk storage. This cannot be undone.`}
        confirmLabel="Delete User & Songs"
      />
    </DashboardLayout>
  );
}
