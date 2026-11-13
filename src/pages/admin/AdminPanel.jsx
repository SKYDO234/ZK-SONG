import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Music4,
  CheckCircle2,
  Clock3,
  XCircle,
  Users,
  KeyRound,
  Headphones,
  Download,
  Search,
  Eye,
  Play,
  Pause,
  Video,
  Trash2,
  ShieldCheck,
  Activity,
  RefreshCw,
  Filter,
  Disc3,
  TrendingUp,
  Ban,
  Crown,
  ExternalLink,
  UserCheck,
  Database,
  Sparkles,
} from 'lucide-react';
import { mediaUrl } from '../../lib/apiBase';
import { monogramAvatar } from '../../components/avatar';
import { useApp } from '../../context/AppContext';
import DashboardLayout from '../../components/DashboardLayout';
import ArtistOfMonthBadge from '../../components/ArtistOfMonthBadge';
import {
  StatCard,
  StatusBadge,
  SectionCard,
  Pagination,
  EmptyState,
  ConfirmDialog,
  Spinner,
  formatDate,
  formatNumber,
  formatDuration,
  inputClass,
  labelClass,
  primaryBtn,
  ghostBtn,
} from '../../components/Common';

/* ==========================================================================
   ADMIN DASHBOARD
   ========================================================================== */
export function AdminDashboard() {
  const { authFetch, playSong, currentSong, isPlaying, notify, refreshBootstrap } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/admin/dashboard');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load admin dashboard');
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.stats || {};
  const aotm = data?.artist_of_the_month;

  const actionTone = (action = '') => {
    if (action.includes('APPROVED')) return 'text-emerald-500 bg-emerald-500/10';
    if (action.includes('REJECT') || action.includes('DELETED')) return 'text-rose-500 bg-rose-500/10';
    if (action.includes('BAN')) return 'text-amber-500 bg-amber-500/10';
    if (action.includes('API')) return 'text-cyan-500 bg-cyan-500/10';
    if (action.includes('SETTINGS')) return 'text-violet-500 bg-violet-500/10';
    return 'text-slate-400 bg-slate-400/10';
  };

  return (
    <DashboardLayout
      variant="admin"
      title="Admin Command Center"
      subtitle="Platform-wide moderation, artist, and API governance"
      actions={
        <button
          onClick={load}
          className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      {error && (
        <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger">
        <StatCard label="Total Songs" value={stats.total_songs ?? 0} hint={`${stats.total_lifetime_uploaded ?? 0} lifetime uploads`} icon={Music4} tone="violet" loading={loading} />
        <StatCard label="Approved" value={stats.approved_songs ?? 0} hint="Live in catalogue & API" icon={CheckCircle2} tone="emerald" loading={loading} />
        <StatCard label="Pending Review" value={stats.pending_songs ?? 0} hint="Awaiting moderation" icon={Clock3} tone="amber" loading={loading} />
        <StatCard label="Rejected / Removed" value={stats.rejected_songs ?? 0} hint="Permanently deleted" icon={XCircle} tone="rose" loading={loading} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-3 sm:mt-4 stagger">
        <StatCard label="Total Artists" value={stats.total_users ?? 0} hint={`${stats.banned_users ?? 0} banned`} icon={Users} tone="cyan" loading={loading} />
        <StatCard label="Active API Keys" value={stats.active_api_keys ?? 0} hint={`${formatNumber(stats.total_api_requests)} requests served`} icon={KeyRound} tone="violet" loading={loading} />
        <StatCard label="Total Plays" value={formatNumber(stats.total_plays)} hint={`${formatNumber(stats.total_downloads)} downloads`} icon={Headphones} tone="emerald" loading={loading} />
        <StatCard label="Video Releases" value={stats.video_songs ?? 0} hint={`${stats.cover_songs ?? 0} cover songs`} icon={Video} tone="amber" loading={loading} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Pending moderation queue */}
          <SectionCard
            title="Pending Moderation Queue"
            subtitle="Newest uploads awaiting A&R review"
            action={
              <Link to="/admin/songs?status=pending" className="text-xs font-extrabold text-violet-600 dark:text-violet-400 hover:underline">
                Open queue →
              </Link>
            }
          >
            {loading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl skeleton" />)}
              </div>
            ) : (data?.pending_songs || []).length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Queue is clear" description="Every submission has been moderated. Nice work!" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {data.pending_songs.map((song) => {
                  const active = currentSong?.id === song.id && isPlaying;
                  return (
                    <li key={song.id} className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <button
                        onClick={() => playSong(song, data.pending_songs)}
                        className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 group"
                        aria-label={`Preview ${song.title}`}
                      >
                        <img src={mediaUrl(song.thumbnail_url)} alt={song.title} className="w-full h-full object-cover" />
                        <span className="absolute inset-0 bg-black/50 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          {active ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white fill-white" />}
                        </span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold truncate">{song.title}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {song.artist} • {song.genre} • uploaded {formatDate(song.created_at)}
                        </p>
                      </div>
                      <Link to={`/admin/songs/${song.id}`} className="shrink-0 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-extrabold transition-colors">
                        Review
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          {/* Genre breakdown */}
          <SectionCard title="Genre Distribution" subtitle="Catalogue composition across all submissions">
            <div className="p-4 space-y-2.5">
              {loading && [1, 2, 3, 4].map((i) => <div key={i} className="h-6 rounded skeleton" />)}
              {!loading && (data?.genre_breakdown || []).length === 0 && (
                <p className="text-xs text-slate-500">No genre data available.</p>
              )}
              {!loading &&
                (data?.genre_breakdown || []).map((g) => {
                  const max = Math.max(...(data.genre_breakdown || []).map((x) => x.count), 1);
                  return (
                    <div key={g.genre}>
                      <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                        <span className="text-slate-600 dark:text-slate-300">{g.genre}</span>
                        <span className="text-slate-400">
                          {g.count} total • {g.approved_count ?? 0} approved
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all duration-700"
                          style={{ width: `${Math.max(6, (g.count / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          {/* Artist of the Month */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-amber-400/5 to-transparent p-5">
            <div className="pointer-events-none absolute -top-14 -right-10 w-52 h-52 rounded-full bg-amber-400/25 blur-3xl" />
            <div className="relative">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5" /> Artist of the Month
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {aotm?.month_label || 'November 2026'} • auto-calculated
              </p>
              {aotm?.winner ? (
                <>
                  <div className="flex items-center gap-3 mt-3">
                    <img
                      src={aotm.winner.avatar_url || monogramAvatar(aotm.winner.name, aotm.winner.user_id)}
                      alt={aotm.winner.name}
                      className="w-12 h-12 rounded-xl object-cover border-2 border-amber-400/60"
                    />
                    <div className="min-w-0">
                      <p className="font-black text-base truncate">{aotm.winner.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {aotm.winner.monthly_approved_count} approved songs this month
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <ArtistOfMonthBadge
                      size="md"
                      monthLabel={aotm.month_label}
                      approvedCount={aotm.winner.monthly_approved_count}
                    />
                  </div>
                  <div className="mt-4 space-y-1.5">
                    {(aotm.leaderboard || []).slice(0, 4).map((a, i) => (
                      <div key={a.user_id} className="flex items-center gap-2 text-[11px]">
                        <span className={`w-5 h-5 rounded-md grid place-items-center font-black shrink-0 ${i === 0 ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 dark:bg-white/10'}`}>
                          {i + 1}
                        </span>
                        <span className="flex-1 truncate font-bold">{a.name}</span>
                        <span className="text-slate-500 font-semibold">{a.monthly_approved_count}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500 mt-3">No approved songs this month yet.</p>
              )}
            </div>
          </div>

          <SectionCard title="Recent Activity" subtitle="Platform audit trail">
            <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
              {loading && [1, 2, 3].map((i) => <div key={i} className="m-3 h-12 rounded-lg skeleton" />)}
              {!loading && (data?.recent_activity || []).length === 0 && (
                <p className="p-6 text-center text-xs text-slate-500">No activity logged yet.</p>
              )}
              {!loading &&
                (data?.recent_activity || []).map((log) => (
                  <div key={log.id} className="px-4 py-2.5 flex items-start gap-2.5">
                    <span className={`mt-0.5 w-6 h-6 rounded-lg grid place-items-center shrink-0 ${actionTone(log.action)}`}>
                      <Activity className="w-3 h-3" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold truncate">{log.action.replace(/_/g, ' ')}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                        {log.details}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {log.actor_name} • {formatDate(log.created_at, true)}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </SectionCard>

          <div className="grid grid-cols-2 gap-2">
            <Link to="/admin/users" className={`${ghostBtn} justify-center`}><Users className="w-4 h-4" /> Users</Link>
            <Link to="/admin/api-keys" className={`${ghostBtn} justify-center`}><KeyRound className="w-4 h-4" /> API Keys</Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ==========================================================================
   SHARED SONG ROW / CARD for admin listings
   ========================================================================== */
function AdminSongCard({ song, onApprove, onReject, onDelete, busy, playSong, currentSong, isPlaying, compact = false }) {
  const active = currentSong?.id === song.id && isPlaying;
  return (
    <div className="p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 hover:shadow-lg transition-all">
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => playSong(song, [song])}
          className="relative w-full sm:w-20 h-40 sm:h-20 rounded-xl overflow-hidden shrink-0 group"
          aria-label={`Play ${song.title}`}
        >
          <img src={mediaUrl(song.thumbnail_url)} alt={song.title} className="w-full h-full object-cover" />
          <span className="absolute inset-0 bg-black/45 grid place-items-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            {active ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white fill-white" />}
          </span>
          {song.is_artist_of_the_month && (
            <span className="absolute top-1 left-1 p-1 rounded-md bg-amber-400 text-slate-950">
              <Crown className="w-3 h-3" />
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="font-extrabold text-sm truncate">{song.title}</h4>
            <StatusBadge status={song.status} size="xs" />
            {song.is_cover && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 text-[10px] font-extrabold border border-amber-500/30">COVER</span>
            )}
            {song.has_video && (
              <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-600 dark:text-violet-300 text-[10px] font-extrabold border border-violet-500/30 inline-flex items-center gap-1">
                <Video className="w-2.5 h-2.5" /> VIDEO
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {song.artist} • {song.genre} • {song.duration_formatted || formatDuration(song.duration)} • {formatNumber(song.plays_count)} plays
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            Uploaded by <span className="font-bold">{song.uploader?.name || 'Unknown'}</span> • {formatDate(song.created_at)}
          </p>
          {!compact && (
            <div className="hidden sm:flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[10px] text-slate-400">
              <span>Musician: <span className="font-semibold text-slate-500 dark:text-slate-300">{song.musician}</span></span>
              <span>Composer: <span className="font-semibold text-slate-500 dark:text-slate-300">{song.composer}</span></span>
            </div>
          )}
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <Link
              to={`/admin/songs/${song.id}`}
              className="p-2 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-violet-500/10 hover:text-violet-500 transition-colors"
              title="Open song details"
            >
              <Eye className="w-4 h-4" />
            </Link>
            {song.status !== 'approved' && (
              <button
                onClick={() => onApprove(song)}
                disabled={busy}
                className="p-2 rounded-lg border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                title="Approve song"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => onReject(song)}
              disabled={busy}
              className="p-2 rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
              title={song.status === 'approved' ? 'Revoke & permanently remove' : 'Reject & permanently remove'}
            >
              <XCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(song)}
              disabled={busy}
              className="p-2 rounded-lg border border-slate-300 dark:border-white/10 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors disabled:opacity-40"
              title="Delete from platform"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   SONGS MANAGEMENT
   ========================================================================== */
export function AdminSongs() {
  const { authFetch, notify, refreshBootstrap, playSong, currentSong, isPlaying } = useApp();
  const [songs, setSongs] = useState([]);
  const [genres, setGenres] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    is_cover: 'all',
    has_video: 'all',
    genre: 'all',
    sort: 'newest',
  });
  const [page, setPage] = useState(1);

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ ...filters, page: String(page), limit: '10' });
      const res = await authFetch(`/api/admin/songs?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load songs');
      setSongs(json.songs || []);
      setGenres(json.genres || []);
      setPagination(json.pagination);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [authFetch, filters, page, notify]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const approve = async (song) => {
    setBusyId(song.id);
    try {
      const res = await authFetch(`/api/admin/songs/${song.id}/approve`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Approval failed');
      notify(json.message, 'success');
      load();
      refreshBootstrap();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    setRejectLoading(true);
    try {
      const res = await authFetch(`/api/admin/songs/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({
          reason: rejectReason.trim() || 'Did not meet studio quality or copyright verification standards.',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Rejection failed');
      notify(json.message, 'success');
      setRejectTarget(null);
      setRejectReason('');
      load();
      refreshBootstrap();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setRejectLoading(false);
    }
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await authFetch(`/api/admin/songs/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      notify(json.message, 'success');
      setDeleteTarget(null);
      load();
      refreshBootstrap();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <DashboardLayout variant="admin" title="Songs Management" subtitle="Search, filter, moderate, and remove platform releases">
      <SectionCard
        title="Song Catalogue"
        subtitle={`${pagination?.total ?? 0} song(s) matching your filters`}
        action={
          <button onClick={load} className="p-2 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      >
        <div className="p-4 border-b border-slate-200 dark:border-white/10 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search title, artist, musician, composer, genre, or uploader…"
              className={`${inputClass} pl-10`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-xs font-bold">
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </select>
            <select value={filters.genre} onChange={(e) => setFilters({ ...filters, genre: e.target.value })} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-xs font-bold">
              <option value="all">All Genres</option>
              {genres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={filters.is_cover} onChange={(e) => setFilters({ ...filters, is_cover: e.target.value })} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-xs font-bold">
              <option value="all">Originals & Covers</option>
              <option value="no">Originals only</option>
              <option value="yes">Covers only</option>
            </select>
            <select value={filters.has_video} onChange={(e) => setFilters({ ...filters, has_video: e.target.value })} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-xs font-bold">
              <option value="all">Any Media</option>
              <option value="yes">With Music Video</option>
              <option value="no">Audio only</option>
            </select>
            <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-xs font-bold">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="plays">Most played</option>
              <option value="title">Title A–Z</option>
              <option value="approved_newest">Recently approved</option>
            </select>
            <button
              onClick={() => setFilters({ search: '', status: 'all', is_cover: 'all', has_video: 'all', genre: 'all', sort: 'newest' })}
              className={`${ghostBtn} !py-2 !text-xs`}
            >
              <Filter className="w-3.5 h-3.5" /> Reset
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-2xl skeleton" />)}
            </div>
          ) : songs.length === 0 ? (
            <EmptyState icon={Music4} title="No songs match these filters" description="Try clearing filters or searching for a different keyword." />
          ) : (
            <div className="space-y-2.5 stagger">
              {songs.map((song) => (
                <AdminSongCard
                  key={song.id}
                  song={song}
                  busy={busyId === song.id}
                  onApprove={approve}
                  onReject={(s) => { setRejectTarget(s); setRejectReason(''); }}
                  onDelete={setDeleteTarget}
                  playSong={playSong}
                  currentSong={currentSong}
                  isPlaying={isPlaying}
                />
              ))}
            </div>
          )}
        </div>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </SectionCard>

      {/* Reject reason dialog (separate, richer) */}
      {rejectTarget && (
        <RejectModal
          song={rejectTarget}
          reason={rejectReason}
          setReason={setRejectReason}
          onClose={() => setRejectTarget(null)}
          onSubmit={submitReject}
          loading={rejectLoading}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={submitDelete}
        loading={deleteLoading}
        title="Delete song from platform?"
        message={`"${deleteTarget?.title || ''}" and all its stored media will be permanently deleted. This does not record a rejection — use Reject for moderation workflows.`}
        confirmLabel="Delete Permanently"
      />
    </DashboardLayout>
  );
}

function RejectModal({ song, reason, setReason, onClose, onSubmit, loading }) {
  const presets = [
    'Audio quality does not meet studio mastering standards.',
    'Copyright / ownership verification failed.',
    'Cover song submitted without valid original credit.',
    'Metadata or artwork violates platform guidelines.',
  ];
  return (
    <div className="fixed inset-0 z-[97] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} role="presentation" />
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl animate-scale-in">
        <div className="p-5 border-b border-slate-200 dark:border-white/10">
          <h3 className="font-extrabold flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-500" /> Reject & Permanently Remove
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            “{song?.title}” by {song?.artist} will be deleted from the database and disk storage.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className={labelClass}>Rejection Reason (sent to artist)</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this submission is being rejected…"
              className={inputClass}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setReason(p)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 text-[10px] font-bold hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-left"
              >
                {p.length > 42 ? `${p.slice(0, 42)}…` : p}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end gap-2">
          <button onClick={onClose} className={ghostBtn}>Cancel</button>
          <button
            onClick={onSubmit}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-extrabold disabled:opacity-50"
          >
            {loading ? <Spinner label="Removing…" /> : <><Trash2 className="w-4 h-4" /> Reject & Delete</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   APPROVED SONGS LIBRARY
   ========================================================================== */
export function ApprovedSongs() {
  const { authFetch, notify, playSong, currentSong, isPlaying, openVideoModal, downloadMedia, refreshBootstrap } = useApp();
  const [songs, setSongs] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('all');
  const [sort, setSort] = useState('approved_newest');
  const [page, setPage] = useState(1);
  const [genres, setGenres] = useState([]);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        status: 'approved',
        search,
        genre,
        sort,
        page: String(page),
        limit: '12',
      });
      const res = await authFetch(`/api/admin/songs?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load approved songs');
      setSongs(json.songs || []);
      setGenres(json.genres || []);
      setPagination(json.pagination);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [authFetch, search, genre, sort, page, notify]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => setPage(1), [search, genre, sort]);

  const remove = async () => {
    setRemoving(true);
    try {
      const res = await authFetch(`/api/admin/songs/${removeTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      notify(json.message, 'success');
      setRemoveTarget(null);
      load();
      refreshBootstrap();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <DashboardLayout variant="admin" title="Approved Songs Library" subtitle="Every published release available in the catalogue and external REST API">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 stagger">
        <StatCard label="Approved Releases" value={pagination?.total ?? 0} icon={Disc3} tone="emerald" loading={loading} />
        <StatCard label="Library Plays" value={formatNumber(songs.reduce((a, s) => a + (s.plays_count || 0), 0))} hint="Visible page total" icon={Headphones} tone="violet" />
        <StatCard label="With Video" value={songs.filter((s) => s.has_video).length} hint="Visible page total" icon={Video} tone="amber" />
        <StatCard label="Cover Songs" value={songs.filter((s) => s.is_cover).length} hint="Visible page total" icon={Music4} tone="cyan" />
      </div>

      <SectionCard
        title="Published Catalogue"
        subtitle="Live in public catalogue, streaming player, and /api/v1/songs"
        action={
          <Link to="/admin/api-keys" className="text-xs font-extrabold text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-1">
            <ExternalLink className="w-3 h-3" /> API Keys
          </Link>
        }
      >
        <div className="p-4 border-b border-slate-200 dark:border-white/10 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search approved songs…"
              className={`${inputClass} pl-10`}
            />
          </div>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-xs font-bold">
            <option value="all">All Genres</option>
            {genres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-xs font-bold">
            <option value="approved_newest">Recently approved</option>
            <option value="plays">Most played</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>

        <div className="p-3 sm:p-4">
          {loading ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-56 rounded-2xl skeleton" />)}
            </div>
          ) : songs.length === 0 ? (
            <EmptyState icon={Disc3} title="No approved songs yet" description="Approve a pending submission to publish it into the library." />
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 stagger">
              {songs.map((song) => {
                const active = currentSong?.id === song.id && isPlaying;
                return (
                  <div key={song.id} className="group rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-slate-900/60 hover:shadow-xl transition-all">
                    <div className="relative aspect-square overflow-hidden">
                      <img src={mediaUrl(song.thumbnail_url)} alt={song.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                      <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                        {song.is_artist_of_the_month && (
                          <span className="px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[9px] font-black inline-flex items-center gap-0.5">
                            <Crown className="w-2.5 h-2.5" /> AOTM
                          </span>
                        )}
                        {song.is_cover && (
                          <span className="px-1.5 py-0.5 rounded-md bg-white/90 text-slate-900 text-[9px] font-black">COVER</span>
                        )}
                        {song.has_video && (
                          <span className="px-1.5 py-0.5 rounded-md bg-violet-600 text-white text-[9px] font-black">VIDEO</span>
                        )}
                      </div>
                      <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-white font-extrabold text-sm truncate drop-shadow">{song.title}</p>
                          <p className="text-white/70 text-[11px] truncate">{song.artist}</p>
                        </div>
                        <button
                          onClick={() => playSong(song, songs)}
                          className="w-9 h-9 rounded-full bg-white text-slate-900 grid place-items-center shrink-0 shadow-lg hover:scale-105 transition-transform"
                          aria-label={`Play ${song.title}`}
                        >
                          {active ? <Pause className="w-4 h-4 fill-slate-900" /> : <Play className="w-4 h-4 fill-slate-900" />}
                        </button>
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span className="font-semibold truncate">{song.genre}</span>
                        <span>{song.duration_formatted} • {formatNumber(song.plays_count)} plays</span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">
                        Approved {formatDate(song.approved_at)} by {song.uploader?.name || 'artist'}
                      </p>
                      <div className="flex items-center gap-1 pt-1 border-t border-slate-100 dark:border-white/5">
                        <Link to={`/admin/songs/${song.id}`} className="flex-1 text-center py-1.5 rounded-lg text-[10px] font-extrabold bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                          Details
                        </Link>
                        {song.has_video && (
                          <button onClick={() => openVideoModal(song)} className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-violet-500/10 hover:text-violet-500" title="Music video">
                            <Video className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => downloadMedia(song, 'audio')} className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-cyan-500/10 hover:text-cyan-500" title="Download audio">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setRemoveTarget(song)} className="p-1.5 rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/10" title="Remove from library">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </SectionCard>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={remove}
        loading={removing}
        title="Remove from Approved Songs?"
        message={`"${removeTarget?.title || ''}" will immediately disappear from the public catalogue, streaming player, and the external REST API. Files are permanently deleted from storage.`}
        confirmLabel="Remove Permanently"
      />
    </DashboardLayout>
  );
}
