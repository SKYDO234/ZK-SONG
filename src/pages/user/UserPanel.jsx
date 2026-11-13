import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Music4,
  CheckCircle2,
  Clock3,
  XCircle,
  UploadCloud,
  Play,
  Pause,
  Search,
  Pencil,
  Trash2,
  Video,
  Download,
  Calendar,
  Mic2,
  Piano,
  PenTool,
  Disc3,
  TrendingUp,
  Headphones,
  Save,
  User as UserIcon,
  Lock,
  Camera,
  Globe,
  Sparkles,
  RefreshCw,
  Crown,
  FileAudio,
  AlertTriangle,
} from 'lucide-react';
import { mediaUrl, withApiBase } from '../../lib/apiBase';
import { uploadAsset } from '../../lib/uploads';
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
  Modal,
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
import {
  synthesizeBrowserWavFile,
  generateBrowserCoverFile,
} from '../../components/browserMediaSynth';

const GENRES = [
  'Synthwave',
  'Electronic',
  'Progressive House',
  'Pop',
  'Hip-Hop',
  'Lo-Fi Beats',
  'Rock',
  'Cinematic',
  'Dream Pop',
  'Ambient Bass',
];

/* ==========================================================================
   USER DASHBOARD
   ========================================================================== */
export function UserDashboard() {
  const { user, authFetch, artistOfTheMonth, playSong, currentSong, isPlaying, openVideoModal } =
    useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/user/dashboard');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load dashboard');
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

  const stats = data?.stats || user?.stats || {};
  const aotm = data?.artist_of_the_month || artistOfTheMonth;
  const isWinner = Boolean(aotm?.winner && String(aotm.winner.user_id) === String(user?.id));
  const leaderboard = aotm?.leaderboard || [];
  const myRank = leaderboard.findIndex((a) => String(a.user_id) === String(user?.id)) + 1;

  return (
    <DashboardLayout
      variant="user"
      title={`Welcome back, ${user?.name?.split(' ')[0] || 'Artist'} 👋`}
      subtitle="Track your releases, approvals, and Artist of the Month ranking"
      actions={
        <button
          onClick={load}
          className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Refresh dashboard"
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

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger">
        <StatCard
          label="Total Uploaded"
          value={stats.uploaded ?? 0}
          hint="Lifetime submissions"
          icon={UploadCloud}
          tone="violet"
          loading={loading}
        />
        <StatCard
          label="Approved"
          value={stats.approved ?? 0}
          hint="Live in public catalogue"
          icon={CheckCircle2}
          tone="emerald"
          loading={loading}
        />
        <StatCard
          label="Pending Review"
          value={stats.pending ?? 0}
          hint="Awaiting A&R moderation"
          icon={Clock3}
          tone="amber"
          loading={loading}
        />
        <StatCard
          label="Rejected"
          value={stats.rejected ?? 0}
          hint="Removed by moderation"
          icon={XCircle}
          tone="rose"
          loading={loading}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        {/* Artist of the Month Status */}
        <div className="lg:col-span-2 space-y-4">
          <div
            className={`relative overflow-hidden rounded-2xl border p-5 sm:p-6 ${
              isWinner
                ? 'border-amber-400/50 bg-gradient-to-br from-amber-500/15 via-amber-400/5 to-transparent'
                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/70'
            }`}
          >
            <div className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full bg-amber-400/20 blur-3xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                  <Crown className="w-4 h-4" />
                  Artist of the Month — {aotm?.month_label || 'November 2026'}
                </div>
                <h3 className="mt-2 text-xl sm:text-2xl font-black tracking-tight">
                  {isWinner
                    ? 'You currently hold the crown 👑'
                    : aotm?.winner
                      ? `${aotm.winner.name} is leading the crown`
                      : 'No crowned artist yet'}
                </h3>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed">
                  The crown is awarded automatically to the artist with the highest number of
                  approved songs this month. Your approved tracks this month:{' '}
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {stats.monthly_approved ?? 0}
                  </span>
                  {myRank > 0 ? ` • Current rank #${myRank}` : ''}.
                </p>
              </div>
              {isWinner && (
                <ArtistOfMonthBadge
                  size="lg"
                  monthLabel={aotm?.month_label}
                  approvedCount={stats.monthly_approved}
                />
              )}
            </div>

            <div className="relative mt-5 space-y-2">
              {leaderboard.slice(0, 4).map((artist, idx) => {
                const isMe = String(artist.user_id) === String(user?.id);
                return (
                  <div
                    key={artist.user_id}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border ${
                      isMe
                        ? 'border-violet-500/40 bg-violet-500/10'
                        : 'border-transparent bg-slate-100/70 dark:bg-white/5'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-lg grid place-items-center text-[11px] font-black shrink-0 ${
                        idx === 0
                          ? 'bg-amber-400 text-slate-950'
                          : idx === 1
                            ? 'bg-slate-300 text-slate-900'
                            : idx === 2
                              ? 'bg-orange-400/80 text-slate-950'
                              : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <img
                      src={artist.avatar_url || monogramAvatar(artist.name, artist.user_id)}
                      alt={artist.name}
                      className="w-7 h-7 rounded-lg object-cover border border-white/20 shrink-0"
                    />
                    <span className="flex-1 min-w-0 text-xs font-extrabold truncate">
                      {artist.name} {isMe && <span className="text-violet-500">(You)</span>}
                    </span>
                    {idx === 0 && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                      {artist.monthly_approved_count} approved
                    </span>
                  </div>
                );
              })}
              {leaderboard.length === 0 && !loading && (
                <p className="text-xs text-slate-500">Leaderboard will appear once songs are approved.</p>
              )}
            </div>
          </div>

          {/* Recent Songs */}
          <SectionCard
            title="Recent Uploads"
            subtitle="Your latest tracks and their moderation status"
            action={
              <Link
                to="/user/songs"
                className="text-xs font-extrabold text-violet-600 dark:text-violet-400 hover:underline"
              >
                View all →
              </Link>
            }
          >
            {loading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-xl skeleton" />
                ))}
              </div>
            ) : (data?.recent_songs || []).length === 0 ? (
              <EmptyState
                icon={FileAudio}
                title="No tracks uploaded yet"
                description="Upload your first studio track to start building your catalogue and compete for the Artist of the Month crown."
                action={
                  <Link to="/user/upload" className={primaryBtn}>
                    <UploadCloud className="w-4 h-4" /> Upload Your First Song
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {data.recent_songs.map((song) => {
                  const active = currentSong?.id === song.id && isPlaying;
                  return (
                    <li
                      key={song.id}
                      className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <button
                        onClick={() => playSong(song, data.recent_songs)}
                        className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 group"
                        aria-label={`Play ${song.title}`}
                      >
                        <img
                          src={mediaUrl(song.thumbnail_url)}
                          alt={song.title}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute inset-0 bg-black/50 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          {active ? (
                            <Pause className="w-4 h-4 text-white" />
                          ) : (
                            <Play className="w-4 h-4 text-white fill-white" />
                          )}
                        </span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold truncate flex items-center gap-1.5">
                          {song.title}
                          {song.is_artist_of_the_month && (
                            <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {song.genre} • {song.duration_formatted || formatDuration(song.duration)}
                          {song.has_video ? ' • Music Video' : ''}
                        </p>
                      </div>
                      <StatusBadge status={song.status} size="xs" />
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <SectionCard title="Studio Snapshot">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-semibold">
                  <Headphones className="w-4 h-4" /> Total Plays
                </span>
                <span className="font-black">{formatNumber(stats.total_plays)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-semibold">
                  <Download className="w-4 h-4" /> Downloads
                </span>
                <span className="font-black">{formatNumber(stats.total_downloads)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-semibold">
                  <TrendingUp className="w-4 h-4" /> Approval Rate
                </span>
                <span className="font-black">
                  {stats.uploaded
                    ? `${Math.round(((stats.approved || 0) / stats.uploaded) * 100)}%`
                    : '—'}
                </span>
              </div>
              <div className="pt-3 border-t border-slate-200 dark:border-white/10">
                <Link to="/user/upload" className={`${primaryBtn} w-full`}>
                  <UploadCloud className="w-4 h-4" /> Upload New Song
                </Link>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Notifications" subtitle="Latest moderation updates">
            <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
              {loading &&
                [1, 2, 3].map((i) => <div key={i} className="m-3 h-14 rounded-lg skeleton" />)}
              {!loading && (data?.notifications || []).length === 0 && (
                <p className="p-6 text-center text-xs text-slate-500">No notifications yet.</p>
              )}
              {!loading &&
                (data?.notifications || []).map((n) => (
                  <div key={n.id} className="px-4 py-3">
                    <p className="text-xs font-extrabold">{n.title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      {n.message}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1.5">{formatDate(n.created_at, true)}</p>
                  </div>
                ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ==========================================================================
   MY SONGS
   ========================================================================== */
export function MySongs() {
  const { authFetch, playSong, currentSong, isPlaying, openVideoModal, downloadMedia, notify } =
    useApp();
  const [songs, setSongs] = useState([]);
  const [stats, setStats] = useState({});
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [coverFilter, setCoverFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        search,
        status: statusFilter,
        is_cover: coverFilter,
        page: String(page),
        limit: '8',
      });
      const res = await authFetch(`/api/user/songs?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load songs');
      setSongs(json.songs || []);
      setStats(json.stats || {});
      setPagination(json.pagination);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [authFetch, search, statusFilter, coverFilter, page, notify]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, coverFilter]);

  const openEdit = (song) => {
    setEditing(song);
    setEditForm({
      title: song.title,
      artist: song.artist,
      featured_artist: song.featured_artist || '',
      musician: song.musician,
      composer: song.composer,
      is_cover: song.is_cover ? 'yes' : 'no',
      original_credit: song.original_credit || '',
      genre: song.genre,
      release_year: song.release_year,
      bpm: song.bpm,
      description: song.description || '',
      lyrics: song.lyrics || '',
    });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authFetch(`/api/user/songs/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      notify(json.message, 'success');
      setEditing(null);
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDeleteLoading(true);
    try {
      const res = await authFetch(`/api/user/songs/${deleting.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      notify(json.message, 'success');
      setDeleting(null);
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filterTabs = [
    { key: 'all', label: 'All', count: stats.uploaded },
    { key: 'approved', label: 'Approved', count: stats.approved },
    { key: 'pending', label: 'Pending', count: stats.pending },
    { key: 'rejected', label: 'Rejected', count: stats.rejected },
  ];

  return (
    <DashboardLayout
      variant="user"
      title="My Songs"
      subtitle="Track moderation status of every track you've submitted"
      actions={
        <Link to="/user/upload" className={`${primaryBtn} hidden sm:inline-flex`}>
          <UploadCloud className="w-4 h-4" /> Upload
        </Link>
      }
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {filterTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all ${
              statusFilter === t.key
                ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/25'
                : 'border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            {t.label}
            <span
              className={`ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] ${
                statusFilter === t.key ? 'bg-white/20' : 'bg-slate-200 dark:bg-white/10'
              }`}
            >
              {t.count ?? 0}
            </span>
          </button>
        ))}
      </div>

      <SectionCard
        bodyClassName=""
        title="Song Library"
        subtitle={`${pagination?.total ?? 0} track(s) matching filters`}
        action={
          <div className="flex items-center gap-2">
            <select
              value={coverFilter}
              onChange={(e) => setCoverFilter(e.target.value)}
              className="px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-xs font-bold"
            >
              <option value="all">All Types</option>
              <option value="no">Originals</option>
              <option value="yes">Cover Songs</option>
            </select>
          </div>
        }
      >
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, artist, musician, composer, or genre…"
              className={`${inputClass} pl-10`}
            />
          </div>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl skeleton" />
            ))}
          </div>
        ) : songs.length === 0 ? (
          <EmptyState
            icon={Music4}
            title="No songs found"
            description="Try adjusting your filters, or upload a brand new track to your catalogue."
            action={
              <Link to="/user/upload" className={primaryBtn}>
                <UploadCloud className="w-4 h-4" /> Upload Song
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {songs.map((song) => {
              const active = currentSong?.id === song.id && isPlaying;
              return (
                <li key={song.id} className="p-3 sm:p-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <button
                      onClick={() => playSong(song, songs)}
                      className="relative w-full sm:w-16 h-40 sm:h-16 rounded-xl overflow-hidden shrink-0 group"
                      aria-label={`Play ${song.title}`}
                    >
                      <img src={mediaUrl(song.thumbnail_url)} alt={song.title} className="w-full h-full object-cover" />
                      <span className="absolute inset-0 bg-black/45 grid place-items-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        {active ? (
                          <Pause className="w-5 h-5 text-white" />
                        ) : (
                          <Play className="w-5 h-5 text-white fill-white" />
                        )}
                      </span>
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-extrabold text-sm truncate">{song.title}</h4>
                        <StatusBadge status={song.status} size="xs" />
                        {song.is_cover ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 text-[10px] font-extrabold">
                            COVER
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30 text-[10px] font-extrabold">
                            ORIGINAL
                          </span>
                        )}
                        {song.has_video && (
                          <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300 border border-violet-500/30 text-[10px] font-extrabold inline-flex items-center gap-1">
                            <Video className="w-2.5 h-2.5" /> VIDEO
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 truncate">
                        {song.artist} • {song.genre} • {song.duration_formatted} •{' '}
                        {formatNumber(song.plays_count)} plays
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Uploaded {formatDate(song.created_at)}
                        {song.status === 'approved' && song.approved_at
                          ? ` • Approved ${formatDate(song.approved_at)}`
                          : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {song.has_video && (
                        <button
                          onClick={() => openVideoModal(song)}
                          className="p-2 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-violet-500/10 hover:text-violet-500 transition-colors"
                          title="Play music video"
                        >
                          <Video className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => downloadMedia(song, 'audio')}
                        className="p-2 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-cyan-500/10 hover:text-cyan-500 transition-colors"
                        title="Download audio"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(song)}
                        className="p-2 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
                        title="Edit details"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleting(song)}
                        className="p-2 rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 transition-colors"
                        title="Delete song"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination pagination={pagination} onPageChange={setPage} />
      </SectionCard>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit Song Metadata"
        subtitle="Update track information — audio files cannot be replaced after upload"
        size="lg"
        footer={
          <>
            <button onClick={() => setEditing(null)} className={ghostBtn}>
              Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              className={primaryBtn}
              type="button"
            >
              {saving ? <Spinner label="Saving…" /> : <><Save className="w-4 h-4" /> Save Changes</>}
            </button>
          </>
        }
      >
        <form onSubmit={saveEdit} className="grid sm:grid-cols-2 gap-3.5">
          <div className="sm:col-span-2">
            <label className={labelClass}>Song Title *</label>
            <input
              required
              value={editForm.title || ''}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Artist *</label>
            <input
              required
              value={editForm.artist || ''}
              onChange={(e) => setEditForm({ ...editForm, artist: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Featured Artist</label>
            <input
              value={editForm.featured_artist || ''}
              onChange={(e) => setEditForm({ ...editForm, featured_artist: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Musician *</label>
            <input
              required
              value={editForm.musician || ''}
              onChange={(e) => setEditForm({ ...editForm, musician: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Composer *</label>
            <input
              required
              value={editForm.composer || ''}
              onChange={(e) => setEditForm({ ...editForm, composer: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Genre</label>
            <select
              value={editForm.genre || 'Electronic'}
              onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
              className={inputClass}
            >
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Year</label>
              <input
                type="number"
                min="1900"
                max="2100"
                value={editForm.release_year || 2026}
                onChange={(e) => setEditForm({ ...editForm, release_year: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>BPM</label>
              <input
                type="number"
                min="40"
                max="300"
                value={editForm.bpm || 120}
                onChange={(e) => setEditForm({ ...editForm, bpm: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Cover Song?</label>
            <div className="flex gap-2">
              {['yes', 'no'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, is_cover: v })}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold border transition-all ${
                    editForm.is_cover === v
                      ? v === 'yes'
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-cyan-500 text-slate-950 border-cyan-500'
                      : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  {v === 'yes' ? 'Yes — Cover Song' : 'No — Original'}
                </button>
              ))}
            </div>
          </div>
          {editForm.is_cover === 'yes' && (
            <div className="sm:col-span-2">
              <label className={labelClass}>Original Song Credit</label>
              <input
                value={editForm.original_credit || ''}
                onChange={(e) => setEditForm({ ...editForm, original_credit: e.target.value })}
                placeholder="Original artist / songwriter credit"
                className={inputClass}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className={labelClass}>Description</label>
            <textarea
              rows={2}
              value={editForm.description || ''}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Lyrics</label>
            <textarea
              rows={3}
              value={editForm.lyrics || ''}
              onChange={(e) => setEditForm({ ...editForm, lyrics: e.target.value })}
              className={inputClass}
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteLoading}
        title="Delete this song?"
        message={`"${deleting?.title || ''}" and its audio, cover art, and music video will be permanently deleted from the platform. This cannot be undone.`}
        confirmLabel="Delete Permanently"
      />
    </DashboardLayout>
  );
}

/* ==========================================================================
   UPLOAD SONG
   ========================================================================== */
export function UploadSong() {
  const { authFetch, notify, user, refreshBootstrap } = useApp();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    artist: user?.name || '',
    featured_artist: '',
    musician: user?.name || '',
    composer: user?.name || '',
    is_cover: 'no',
    original_credit: '',
    genre: user?.primary_genre || 'Synthwave',
    release_year: 2026,
    bpm: 122,
    description: '',
    lyrics: '',
  });
  const [audioFile, setAudioFile] = useState(null);
  const [thumbFile, setThumbFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [thumbPreview, setThumbPreview] = useState('');
  const [audioPreview, setAudioPreview] = useState('');
  const [durationSec, setDurationSec] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = 'Song title is required.';
    if (!form.artist.trim()) e.artist = 'Artist name is required.';
    if (!form.musician.trim()) e.musician = 'Musician details are required.';
    if (!form.composer.trim()) e.composer = 'Composer details are required.';
    if (!audioFile) e.audio = 'Please select or generate an audio file.';
    if (!thumbFile) e.thumb = 'Please select or generate a cover image.';
    if (form.is_cover === 'yes' && !form.original_credit.trim())
      e.original_credit = 'Original song credit is required for cover songs.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onAudioChange = (file) => {
    if (!file) return;
    const maxMb = 120;
    if (file.size > maxMb * 1024 * 1024) {
      notify(`Audio file is too large. Max ${maxMb}MB.`, 'error');
      return;
    }
    if (!/^audio\//.test(file.type) && !/\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.name)) {
      notify('Invalid audio format. Use MP3, WAV, OGG, FLAC, M4A, or AAC.', 'error');
      return;
    }
    setAudioFile(file);
    setErrors((p) => ({ ...p, audio: undefined }));
    if (audioPreview) URL.revokeObjectURL(audioPreview);
    const url = URL.createObjectURL(file);
    setAudioPreview(url);
    const probe = new Audio(url);
    probe.addEventListener('loadedmetadata', () => {
      if (isFinite(probe.duration)) setDurationSec(Math.round(probe.duration));
    });
  };

  const onThumbChange = (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|svg|gif)$/i.test(file.name)) {
      notify('Invalid image format. Use PNG, JPG, WEBP, SVG, or GIF.', 'error');
      return;
    }
    setThumbFile(file);
    setErrors((p) => ({ ...p, thumb: undefined }));
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setThumbPreview(URL.createObjectURL(file));
  };

  const onVideoChange = (file) => {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|webm|mov|mkv)$/i.test(file.name)) {
      notify('Invalid video format. Use MP4, WEBM, or MOV.', 'error');
      return;
    }
    setVideoFile(file);
  };

  const generateAudio = () => {
    notify('Synthesizing a stereo studio WAV in your browser…', 'info');
    const file = synthesizeBrowserWavFile({
      title: form.title || 'Studio Track',
      durationSec: 14,
      bpm: Number(form.bpm) || 122,
    });
    setDurationSec(14);
    onAudioChange(file);
    if (!form.title) setForm((f) => ({ ...f, title: 'Browser Studio Track' }));
  };

  const generateCover = () => {
    const file = generateBrowserCoverFile({
      title: form.title || 'Untitled Track',
      artist: form.artist || 'Independent Artist',
      genre: form.genre,
      isCover: form.is_cover === 'yes',
    });
    onThumbChange(file);
    notify('Generated a fresh 600×600 SVG cover artwork.', 'success');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      notify('Please fix the highlighted fields before submitting.', 'error');
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const mins = Math.floor((durationSec || 14) / 60);
      const secs = String((durationSec || 14) % 60).padStart(2, '0');
      const meta = {
        ...form,
        duration: String(durationSec || 14),
        duration_formatted: `${mins}:${secs}`,
      };

      // Serverless deployments cannot receive large request bodies, so audio is
      // uploaded straight to object storage first and only the key is posted.
      const sent = {};
      const files = { audio: audioFile, thumbnail: thumbFile, video: videoFile };
      const weights = { audio: 80, thumbnail: 12, video: 8 };
      const totalWeight = Object.entries(files).reduce(
        (sum, [key, file]) => sum + (file ? weights[key] : 0),
        0
      );
      let doneWeight = 0;
      const bump = (key, pct) => {
        if (!weights[key]) return;
        const overall = totalWeight
          ? Math.round(((doneWeight + (pct / 100) * weights[key]) / totalWeight) * 100)
          : 0;
        setProgress(Math.min(99, overall));
      };

      for (const [key, file] of Object.entries(files)) {
        if (!file) continue;
        const result = await uploadAsset({
          authFetch,
          file,
          field: key,
          onProgress: (pct) => bump(key, pct),
        });
        if (result.direct && result.key) {
          sent[`${key}_key`] = result.key;
        } else {
          sent[`__file_${key}`] = file;
        }
        doneWeight += weights[key];
      }

      const directMode = Object.keys(sent).some((k) => k.endsWith('_key'));
      setProgress(96);

      const token = localStorage.getItem('zksong_token');
      const res = await new Promise((resolve, reject) => {
        if (directMode) {
          // Metadata only — a few KB, safe for the 4.5 MB function limit.
          fetch(withApiBase('/api/user/songs'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ ...meta, ...sent }),
          })
            .then(async (r) => resolve({ ok: r.ok, json: await r.json().catch(() => ({})) }))
            .catch(reject);
          return;
        }

        const fd = new FormData();
        Object.entries(meta).forEach(([k, v]) => fd.append(k, v ?? ''));
        Object.entries(sent).forEach(([k, file]) => fd.append(k, file));

        const xhr = new XMLHttpRequest();
        xhr.open('POST', withApiBase('/api/user/songs'));
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) setProgress(Math.round((evt.loaded / evt.total) * 100));
        };
        xhr.onload = () => {
          try {
            resolve({
              ok: xhr.status >= 200 && xhr.status < 300,
              json: JSON.parse(xhr.responseText || '{}'),
            });
          } catch (err) {
            reject(new Error('Invalid server response'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(fd);
      });

      if (!res.ok) throw new Error(res.json.error || 'Upload failed');
      setProgress(100);
      notify(res.json.message, 'success');
      await refreshBootstrap();
      navigate('/user/songs');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <DashboardLayout
      variant="user"
      title="Upload Song"
      subtitle="Publish a new release to the ZK-SONG catalogue for A&R review"
    >
      <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Song Information" subtitle="Required metadata for the release">
            <div className="p-4 grid sm:grid-cols-2 gap-3.5">
              <div className="sm:col-span-2">
                <label className={labelClass}>Song Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Neon Odyssey"
                  className={`${inputClass} ${errors.title ? 'border-rose-500' : ''}`}
                />
                {errors.title && <p className="text-[11px] text-rose-500 mt-1">{errors.title}</p>}
              </div>

              <div>
                <label className={labelClass}>
                  <span className="inline-flex items-center gap-1"><Mic2 className="w-3 h-3" /> Artist *</span>
                </label>
                <input
                  value={form.artist}
                  onChange={(e) => setForm({ ...form, artist: e.target.value })}
                  className={`${inputClass} ${errors.artist ? 'border-rose-500' : ''}`}
                />
                {errors.artist && <p className="text-[11px] text-rose-500 mt-1">{errors.artist}</p>}
              </div>

              <div>
                <label className={labelClass}>Featured Artist</label>
                <input
                  value={form.featured_artist}
                  onChange={(e) => setForm({ ...form, featured_artist: e.target.value })}
                  placeholder="Optional collaboration"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <span className="inline-flex items-center gap-1"><Piano className="w-3 h-3" /> Musician(s) *</span>
                </label>
                <input
                  value={form.musician}
                  onChange={(e) => setForm({ ...form, musician: e.target.value })}
                  placeholder="e.g. Aria Vance (synths), Kai Mercer (drums)"
                  className={`${inputClass} ${errors.musician ? 'border-rose-500' : ''}`}
                />
                {errors.musician && <p className="text-[11px] text-rose-500 mt-1">{errors.musician}</p>}
              </div>

              <div>
                <label className={labelClass}>
                  <span className="inline-flex items-center gap-1"><PenTool className="w-3 h-3" /> Composer(s) *</span>
                </label>
                <input
                  value={form.composer}
                  onChange={(e) => setForm({ ...form, composer: e.target.value })}
                  placeholder="e.g. Aria Vance, N. Ostrowski"
                  className={`${inputClass} ${errors.composer ? 'border-rose-500' : ''}`}
                />
                {errors.composer && <p className="text-[11px] text-rose-500 mt-1">{errors.composer}</p>}
              </div>

              <div>
                <label className={labelClass}>Genre</label>
                <select
                  value={form.genre}
                  onChange={(e) => setForm({ ...form, genre: e.target.value })}
                  className={inputClass}
                >
                  {GENRES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Release Year</label>
                  <input
                    type="number"
                    min="1900"
                    max="2100"
                    value={form.release_year}
                    onChange={(e) => setForm({ ...form, release_year: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>BPM</label>
                  <input
                    type="number"
                    min="40"
                    max="300"
                    value={form.bpm}
                    onChange={(e) => setForm({ ...form, bpm: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>Is this a Cover Song? *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, is_cover: 'no' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      form.is_cover === 'no'
                        ? 'border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/40'
                        : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-xs font-extrabold">
                      <Disc3 className="w-4 h-4 text-cyan-500" /> Original Song
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-1">
                      Fully original composition
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, is_cover: 'yes' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      form.is_cover === 'yes'
                        ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/40'
                        : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-xs font-extrabold">
                      <Music4 className="w-4 h-4 text-amber-500" /> Cover Song — Yes
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-1">
                      Reinterpretation of an existing work
                    </span>
                  </button>
                </div>
              </div>

              {form.is_cover === 'yes' && (
                <div className="sm:col-span-2">
                  <label className={labelClass}>Original Song Credit *</label>
                  <input
                    value={form.original_credit}
                    onChange={(e) => setForm({ ...form, original_credit: e.target.value })}
                    placeholder="Original artist / songwriter / label credit"
                    className={`${inputClass} ${errors.original_credit ? 'border-rose-500' : ''}`}
                  />
                  {errors.original_credit && (
                    <p className="text-[11px] text-rose-500 mt-1">{errors.original_credit}</p>
                  )}
                </div>
              )}

              <div className="sm:col-span-2">
                <label className={labelClass}>Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Production notes, story behind the track…"
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>Lyrics</label>
                <textarea
                  rows={3}
                  value={form.lyrics}
                  onChange={(e) => setForm({ ...form, lyrics: e.target.value })}
                  placeholder="Optional — displayed on song detail pages"
                  className={inputClass}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Audio File *"
            subtitle="MP3, WAV, OGG, FLAC, M4A or AAC — up to 120MB"
            action={
              <button type="button" onClick={generateAudio} className="text-[11px] font-extrabold text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Generate test WAV
              </button>
            }
          >
            <div className="p-4">
              <label className="block cursor-pointer">
                <div
                  className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
                    errors.audio
                      ? 'border-rose-500/60 bg-rose-500/5'
                      : audioFile
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : 'border-slate-300 dark:border-white/15 hover:border-violet-500/60'
                  }`}
                >
                  <UploadCloud className="w-8 h-8 mx-auto text-slate-400" />
                  <p className="mt-2 text-sm font-extrabold">
                    {audioFile ? audioFile.name : 'Click to select audio file'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {audioFile
                      ? `${(audioFile.size / (1024 * 1024)).toFixed(2)} MB • ${durationSec || '—'}s`
                      : 'Drag & drop or browser generated WAV'}
                  </p>
                </div>
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac"
                  className="hidden"
                  onChange={(e) => onAudioChange(e.target.files?.[0])}
                />
              </label>
              {errors.audio && <p className="text-[11px] text-rose-500 mt-1.5">{errors.audio}</p>}
              {audioPreview && (
                <audio controls src={audioPreview} className="w-full mt-3 h-10" />
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Thumbnail / Cover Image *"
            subtitle="Square artwork recommended (600×600)"
            action={
              <button type="button" onClick={generateCover} className="text-[11px] font-extrabold text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Generate cover
              </button>
            }
          >
            <div className="p-4 flex flex-col sm:flex-row gap-4">
              <label className="cursor-pointer shrink-0 mx-auto sm:mx-0">
                <div
                  className={`w-32 h-32 rounded-xl overflow-hidden border-2 border-dashed grid place-items-center ${
                    errors.thumb
                      ? 'border-rose-500/60 bg-rose-500/5'
                      : thumbPreview
                        ? 'border-emerald-500/50'
                        : 'border-slate-300 dark:border-white/15'
                  }`}
                >
                  {thumbPreview ? (
                    <img src={thumbPreview} alt="Cover preview" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-7 h-7 text-slate-400" />
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*,.svg"
                  className="hidden"
                  onChange={(e) => onThumbChange(e.target.files?.[0])}
                />
              </label>
              <div className="flex-1 space-y-2">
                <p className="text-sm font-extrabold">
                  {thumbFile ? thumbFile.name : 'No cover selected'}
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  PNG, JPG, WEBP, SVG or GIF. This artwork appears across the public catalogue,
                  the streaming player, and the external REST API responses.
                </p>
                {errors.thumb && <p className="text-[11px] text-rose-500">{errors.thumb}</p>}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Music Video (Optional)"
            subtitle="MP4, WEBM or MOV — adds a visualizer to your release"
          >
            <div className="p-4">
              <label className="block cursor-pointer">
                <div
                  className={`rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
                    videoFile
                      ? 'border-emerald-500/50 bg-emerald-500/5'
                      : 'border-slate-300 dark:border-white/15 hover:border-violet-500/60'
                  }`}
                >
                  <Video className="w-7 h-7 mx-auto text-slate-400" />
                  <p className="mt-2 text-sm font-extrabold">
                    {videoFile ? videoFile.name : 'Click to attach a music video'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {videoFile ? `${(videoFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Optional'}
                  </p>
                </div>
                <input
                  type="file"
                  accept="video/*,.mp4,.webm,.mov"
                  className="hidden"
                  onChange={(e) => onVideoChange(e.target.files?.[0])}
                />
              </label>
              {videoFile && (
                <button
                  type="button"
                  onClick={() => setVideoFile(null)}
                  className="mt-2 text-[11px] font-bold text-rose-500 hover:underline"
                >
                  Remove attached video
                </button>
              )}
            </div>
          </SectionCard>
        </div>

        {/* Sidebar summary */}
        <div className="space-y-4">
          <SectionCard title="Upload Summary">
            <div className="p-4 space-y-3 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 font-semibold">Title</span>
                <span className="font-extrabold text-right truncate">{form.title || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 font-semibold">Artist</span>
                <span className="font-extrabold text-right truncate">{form.artist || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 font-semibold">Type</span>
                <span className="font-extrabold">{form.is_cover === 'yes' ? 'Cover Song' : 'Original'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 font-semibold">Genre</span>
                <span className="font-extrabold">{form.genre}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 font-semibold">Audio</span>
                <span className="font-extrabold truncate">
                  {audioFile ? 'Ready' : 'Missing'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 font-semibold">Cover</span>
                <span className="font-extrabold">{thumbFile ? 'Ready' : 'Missing'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 font-semibold">Music Video</span>
                <span className="font-extrabold">{videoFile ? 'Attached' : 'None'}</span>
              </div>

              {uploading && (
                <div className="pt-2">
                  <div className="flex justify-between text-[11px] font-bold mb-1">
                    <span>Uploading…</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              <button type="submit" disabled={uploading} className={`${primaryBtn} w-full mt-2`}>
                {uploading ? <Spinner label="Uploading…" /> : <><UploadCloud className="w-4 h-4" /> Submit Song</>}
              </button>
            </div>
          </SectionCard>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" /> Moderation Notice
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              Every submission is reviewed by the A&R admin team. Approved tracks appear instantly
              in the public catalogue and external REST API. Rejected tracks are permanently removed
              from the platform and storage.
            </p>
          </div>
        </div>
      </form>
    </DashboardLayout>
  );
}

/* ==========================================================================
   ACCOUNT MANAGEMENT
   ========================================================================== */
export function AccountManagement() {
  const { authFetch, user, setUser, notify, refreshUser } = useApp();
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    bio: '',
    primary_genre: 'Electronic',
    country: '',
    website: '',
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile({
        name: user.name || '',
        email: user.email || '',
        bio: user.bio || '',
        primary_genre: user.primary_genre || 'Electronic',
        country: user.country || '',
        website: user.website || '',
      });
      setAvatarPreview(user.avatar_url || '');
    }
  }, [user]);

  const handleProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      let avatarKey = null;
      if (avatarFile) {
        const uploaded = await uploadAsset({ authFetch, file: avatarFile, field: 'avatar' });
        if (uploaded.direct) avatarKey = uploaded.key;
        else {
          const fd = new FormData();
          Object.entries(profile).forEach(([k, v]) => fd.append(k, v ?? ''));
          fd.append('avatar', avatarFile);
          const res = await authFetch('/api/user/account', { method: 'PUT', body: fd });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Update failed');
          setUser(json.user);
          setAvatarFile(null);
          notify(json.message, 'success');
          refreshUser();
          return;
        }
      }
      const res = await authFetch('/api/user/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profile, ...(avatarKey ? { avatar_key: avatarKey } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      setUser(json.user);
      setAvatarFile(null);
      notify(json.message, 'success');
      refreshUser();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (passwords.new_password !== passwords.confirm) {
      notify('New password confirmation does not match.', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await authFetch('/api/user/password', {
        method: 'PUT',
        body: JSON.stringify({
          current_password: passwords.current_password,
          new_password: passwords.new_password,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Password change failed');
      notify(json.message, 'success');
      setPasswords({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const stats = user?.stats || {};

  return (
    <DashboardLayout
      variant="user"
      title="Account Management"
      subtitle="Manage your artist profile, artwork, and security credentials"
    >
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Artist Profile" subtitle="Public information shown across the platform">
            <form onSubmit={handleProfile} className="p-4 space-y-4">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                <label className="cursor-pointer group relative shrink-0">
                  <img
                    src={avatarPreview || monogramAvatar(user?.name, user?.id)}
                    alt="Avatar"
                    className="w-20 h-20 rounded-2xl object-cover border border-slate-200 dark:border-white/15"
                  />
                  <span className="absolute inset-0 rounded-2xl bg-black/50 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-5 h-5 text-white" />
                  </span>
                  <input
                    type="file"
                    accept="image/*,.svg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (!/^image\//.test(f.type) && !/\.(png|jpe?g|webp|svg)$/i.test(f.name)) {
                        notify('Use PNG, JPG, WEBP, or SVG for avatars.', 'error');
                        return;
                      }
                      setAvatarFile(f);
                      setAvatarPreview(URL.createObjectURL(f));
                    }}
                  />
                </label>
                <div className="text-center sm:text-left">
                  <p className="font-extrabold text-sm">{user?.name}</p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300 border border-violet-500/30 text-[10px] font-extrabold uppercase">
                      {user?.role}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full border text-[10px] font-extrabold uppercase ${
                        user?.status === 'active'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-600 border-rose-500/30'
                      }`}
                    >
                      {user?.status}
                    </span>
                    {user?.is_artist_of_the_month && (
                      <ArtistOfMonthBadge size="xs" monthLabel={user.artist_of_month_badge?.month} />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Member since {formatDate(user?.created_at)}
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3.5">
                <div>
                  <label className={labelClass}>
                    <span className="inline-flex items-center gap-1"><UserIcon className="w-3 h-3" /> Display Name *</span>
                  </label>
                  <input
                    required
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Email Address *</label>
                  <input
                    required
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Primary Genre</label>
                  <select
                    value={profile.primary_genre}
                    onChange={(e) => setProfile({ ...profile, primary_genre: e.target.value })}
                    className={inputClass}
                  >
                    {GENRES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Country</label>
                  <input
                    value={profile.country}
                    onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    <span className="inline-flex items-center gap-1"><Globe className="w-3 h-3" /> Website</span>
                  </label>
                  <input
                    value={profile.website}
                    onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                    placeholder="https://yourartist.site"
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Artist Bio</label>
                  <textarea
                    rows={3}
                    value={profile.bio}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    placeholder="Describe your sound, influences and production style…"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={savingProfile} className={primaryBtn}>
                  {savingProfile ? <Spinner label="Saving…" /> : <><Save className="w-4 h-4" /> Save Profile</>}
                </button>
                {avatarFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarFile(null);
                      setAvatarPreview(user?.avatar_url || '');
                    }}
                    className={ghostBtn}
                  >
                    Cancel new avatar
                  </button>
                )}
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Change Password" subtitle="Secure your studio account">
            <form onSubmit={handlePassword} className="p-4 grid sm:grid-cols-3 gap-3.5">
              <div className="sm:col-span-3">
                <label className={labelClass}>
                  <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Current Password *</span>
                </label>
                <input
                  required
                  type={showPass ? 'text' : 'password'}
                  value={passwords.current_password}
                  onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>New Password *</label>
                <input
                  required
                  minLength={6}
                  type={showPass ? 'text' : 'password'}
                  value={passwords.new_password}
                  onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Confirm New Password *</label>
                <input
                  required
                  minLength={6}
                  type={showPass ? 'text' : 'password'}
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className={`${ghostBtn} w-full`}
                >
                  {showPass ? 'Hide' : 'Show'} passwords
                </button>
              </div>
              <div className="sm:col-span-3">
                <button type="submit" disabled={savingPassword} className={primaryBtn}>
                  {savingPassword ? <Spinner label="Updating…" /> : <><Lock className="w-4 h-4" /> Update Password</>}
                </button>
              </div>
            </form>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Account Statistics">
            <div className="p-4 space-y-3">
              {[
                { label: 'Total Uploaded', value: stats.uploaded ?? 0 },
                { label: 'Approved Songs', value: stats.approved ?? 0 },
                { label: 'Pending Review', value: stats.pending ?? 0 },
                { label: 'Rejected', value: stats.rejected ?? 0 },
                { label: 'Approved This Month', value: stats.monthly_approved ?? 0 },
                { label: 'Total Plays', value: formatNumber(stats.total_plays) },
                { label: 'Downloads', value: formatNumber(stats.total_downloads) },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">{row.label}</span>
                  <span className="font-black">{row.value}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/70 p-4">
            <p className="flex items-center gap-1.5 text-xs font-extrabold">
              <Calendar className="w-3.5 h-3.5 text-violet-500" /> Monthly Crown Race
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              Approved songs are counted automatically per calendar month. The artist with the most
              approved releases receives the Artist of the Month badge across the entire platform.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
