import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Pause,
  Download,
  Video,
  CheckCircle2,
  XCircle,
  Crown,
  Music4,
  Mic2,
  Piano,
  PenTool,
  Calendar,
  Gauge,
  Clock3,
  HardDrive,
  FileAudio,
  Image as ImageIcon,
  Film,
  User as UserIcon,
  Mail,
  Globe,
  Trash2,
  ShieldCheck,
  Copy,
  AlertTriangle,
  Disc3,
} from 'lucide-react';
import { mediaUrl } from '../../lib/apiBase';
import { monogramAvatar } from '../../components/avatar';
import { useApp } from '../../context/AppContext';
import DashboardLayout from '../../components/DashboardLayout';
import ArtistOfMonthBadge from '../../components/ArtistOfMonthBadge';
import {
  SectionCard,
  StatusBadge,
  Spinner,
  formatDate,
  formatNumber,
  formatBytes,
  formatDuration,
  primaryBtn,
  ghostBtn,
  labelClass,
  inputClass,
  EmptyState,
} from '../../components/Common';
import { readJson } from '../../lib/http';

function MetaRow({ icon: Icon, label, value, mono = false }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <Icon className="w-3.5 h-3.5 text-neutral-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400">{label}</p>
        <p className={`text-xs font-bold text-neutral-100 dark:text-neutral-200 break-words ${mono ? 'font-mono text-[11px]' : ''}`}>
          {value || '—'}
        </p>
      </div>
    </div>
  );
}

export default function AdminSongDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authFetch, notify, playSong, currentSong, isPlaying, downloadMedia, refreshBootstrap } = useApp();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch(`/api/admin/songs/${id}`);
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error || 'Failed to load song');
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch, id]);

  useEffect(() => {
    load();
  }, [load]);

  const song = data?.song;

  const approve = async () => {
    setBusy('approve');
    try {
      const res = await authFetch(`/api/admin/songs/${id}/approve`, { method: 'POST' });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error || 'Approval failed');
      notify(json.message, 'success');
      await load();
      refreshBootstrap();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const doReject = async () => {
    setRejectLoading(true);
    try {
      const res = await authFetch(`/api/admin/songs/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({
          reason: rejectReason.trim() || 'Did not meet studio quality or copyright verification standards.',
        }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error || 'Rejection failed');
      notify(json.message, 'success');
      refreshBootstrap();
      navigate('/admin/songs');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setRejectLoading(false);
    }
  };

  const doDelete = async () => {
    setDeleteLoading(true);
    try {
      const res = await authFetch(`/api/admin/songs/${id}`, { method: 'DELETE' });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      notify(json.message, 'success');
      refreshBootstrap();
      navigate('/admin/songs');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const copy = (text, label = 'Copied') => {
    navigator.clipboard?.writeText(text);
    notify(`${label} to clipboard.`, 'info');
  };

  if (loading) {
    return (
      <DashboardLayout variant="admin" title="Song Details" subtitle="Loading release metadata…">
        <div className="space-y-3">
          <div className="h-64 rounded-2xl skeleton" />
          <div className="h-40 rounded-2xl skeleton" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !song) {
    return (
      <DashboardLayout variant="admin" title="Song Not Found" subtitle="This release may have been rejected and removed">
        <div className="rounded-2xl border border-white/10 dark:border-white/10 bg-[#101013]/70">
          <EmptyState
            icon={AlertTriangle}
            title="Song unavailable"
            description={error || 'This song no longer exists — it may have been rejected and permanently deleted.'}
            action={<Link to="/admin/songs" className={primaryBtn}><ArrowLeft className="w-4 h-4" /> Back to Songs Management</Link>}
          />
        </div>
      </DashboardLayout>
    );
  }

  const active = currentSong?.id === song.id && isPlaying;

  return (
    <DashboardLayout
      variant="admin"
      title="Song Details"
      subtitle={`Release #${song.id} • ${song.title}`}
      actions={
        <Link to="/admin/songs" className={`${ghostBtn} hidden sm:inline-flex`}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      }
    >
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 dark:border-white/10 bg-[#101013]/70">
        <div className="absolute inset-0 opacity-25">
          <img src={mediaUrl(song.thumbnail_url)} alt="" className="w-full h-full object-cover blur-2xl scale-110" />
        </div>
        <div className="relative p-4 sm:p-6 flex flex-col sm:flex-row gap-5">
          <div className="relative w-full sm:w-48 shrink-0">
            <img
              src={mediaUrl(song.thumbnail_url)}
              alt={song.title}
              className="w-full aspect-square object-cover rounded-2xl border border-white/20 shadow-2xl"
            />
            {song.is_artist_of_the_month && (
              <div className="absolute -top-2 -left-2">
                <span className="px-2 py-1 rounded-lg aotm-gold-shimmer text-neutral-950 text-[10px] font-black inline-flex items-center gap-1 shadow-lg">
                  <Crown className="w-3 h-3 fill-slate-950" /> AOTM
                </span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={song.status} />
              {song.is_cover ? (
                <span className="px-2 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 text-[11px] font-extrabold">COVER SONG: YES</span>
              ) : (
                <span className="px-2 py-1 rounded-full bg-amber-400/15 text-amber-500 dark:text-amber-200 border border-amber-400/30 text-[11px] font-extrabold">COVER SONG: NO</span>
              )}
              {song.has_video && (
                <span className="px-2 py-1 rounded-full bg-amber-400/15 text-amber-500 dark:text-amber-200 border border-amber-400/30 text-[11px] font-extrabold inline-flex items-center gap-1">
                  <Video className="w-3 h-3" /> MUSIC VIDEO
                </span>
              )}
            </div>

            <h2 className="mt-2.5 text-2xl sm:text-3xl font-black tracking-tight">{song.title}</h2>
            <p className="text-sm font-bold text-neutral-400 dark:text-neutral-400 mt-0.5">
              {song.artist}
              {song.featured_artist ? ` feat. ${song.featured_artist}` : ''} • {song.genre} • {song.release_year}
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-neutral-400">
              <span className="inline-flex items-center gap-1"><Clock3 className="w-3 h-3" /> {song.duration_formatted || formatDuration(song.duration)}</span>
              <span className="inline-flex items-center gap-1"><Gauge className="w-3 h-3" /> {song.bpm} BPM</span>
              <span className="inline-flex items-center gap-1"><Play className="w-3 h-3" /> {formatNumber(song.plays_count)} plays</span>
              <span className="inline-flex items-center gap-1"><Download className="w-3 h-3" /> {formatNumber(song.downloads_count)} downloads</span>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={() => playSong(song, [song])} className={primaryBtn}>
                {active ? <><Pause className="w-4 h-4" /> Pause Preview</> : <><Play className="w-4 h-4" /> Play Audio</>}
              </button>
              {song.has_video && (
                <a href={mediaUrl(song.video_url)} target="_blank" rel="noreferrer" className={ghostBtn}>
                  <Video className="w-4 h-4" /> Open Video
                </a>
              )}
              <button onClick={() => downloadMedia(song, 'audio')} className={ghostBtn}>
                <Download className="w-4 h-4" /> Audio
              </button>
              {song.has_video && (
                <button onClick={() => downloadMedia(song, 'video')} className={ghostBtn}>
                  <Film className="w-4 h-4" /> Video
                </button>
              )}
              <button onClick={() => downloadMedia(song, 'thumbnail')} className={ghostBtn}>
                <ImageIcon className="w-4 h-4" /> Cover
              </button>
            </div>

            {song.status !== 'approved' && (
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={approve}
                  disabled={busy === 'approve'}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold disabled:opacity-50 transition-colors"
                >
                  {busy === 'approve' ? <Spinner label="Approving…" /> : <><CheckCircle2 className="w-4 h-4" /> Approve & Publish</>}
                </button>
                <button
                  onClick={() => setRejectOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-extrabold transition-colors"
                >
                  <XCircle className="w-4 h-4" /> Reject & Remove
                </button>
              </div>
            )}
            {song.status === 'approved' && (
              <div className="flex flex-wrap gap-2 mt-3">
                <button onClick={() => setRejectOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-extrabold transition-colors">
                  <XCircle className="w-4 h-4" /> Revoke & Remove
                </button>
                <button onClick={() => setDeleteOpen(true)} className={`${ghostBtn} !text-rose-500 !border-rose-500/30`}>
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Audio + Video players */}
          <SectionCard title="Media Playback" subtitle="Full-quality streaming preview and download controls">
            <div className="p-4 space-y-4">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-1.5">
                  <FileAudio className="w-3.5 h-3.5" /> Audio Track
                </p>
                <audio controls preload="metadata" src={mediaUrl(song.audio_url)} className="w-full h-11">
                  Your browser does not support audio playback.
                </audio>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-neutral-400">
                  <span className="font-mono truncate max-w-[240px]">{song.audio_filename}</span>
                  <span>{formatBytes(song.audio_size)}</span>
                  <span className="uppercase">{song.audio_mime}</span>
                  <button onClick={() => copy(song.audio_url, 'Audio URL')} className="text-amber-400 font-bold hover:underline inline-flex items-center gap-1">
                    <Copy className="w-3 h-3" /> Copy URL
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 dark:border-white/10">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5" /> Music Video
                </p>
                {song.has_video ? (
                  <>
                    <video controls preload="metadata" poster={mediaUrl(song.thumbnail_url)} src={mediaUrl(song.video_url)} className="w-full rounded-xl border border-white/10 dark:border-white/10 bg-black max-h-[300px]">
                      Your browser does not support video playback.
                    </video>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-neutral-400">
                      <span className="font-mono truncate max-w-[240px]">{song.video_filename}</span>
                      <span>{formatBytes(song.video_size)}</span>
                      <button onClick={() => copy(song.video_url, 'Video URL')} className="text-amber-400 font-bold hover:underline inline-flex items-center gap-1">
                        <Copy className="w-3 h-3" /> Copy URL
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/15 dark:border-white/15 p-6 text-center">
                    <Film className="w-6 h-6 mx-auto text-neutral-400" />
                    <p className="text-xs text-neutral-400 mt-1.5">No music video was attached to this release.</p>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Description / lyrics */}
          <SectionCard title="Release Notes & Lyrics">
            <div className="p-4 space-y-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 mb-1">Description</p>
                <p className="text-sm text-neutral-300 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
                  {song.description || 'No description provided.'}
                </p>
              </div>
              <div className="pt-3 border-t border-white/10 dark:border-white/10">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 mb-1">Lyrics</p>
                <p className="text-sm text-neutral-300 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">
                  {song.lyrics || 'Instrumental / no lyrics submitted.'}
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Full metadata table */}
          <SectionCard title="Complete Metadata" subtitle="Every field captured on upload">
            <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
              <MetaRow icon={Music4} label="Song ID" value={`#${song.id}`} />
              <MetaRow icon={Music4} label="Title" value={song.title} />
              <MetaRow icon={Mic2} label="Artist" value={song.artist} />
              <MetaRow icon={Mic2} label="Featured Artist" value={song.featured_artist || 'None'} />
              <MetaRow icon={Piano} label="Musician(s)" value={song.musician} />
              <MetaRow icon={PenTool} label="Composer(s)" value={song.composer} />
              <MetaRow icon={Disc3} label="Cover Song" value={song.is_cover ? 'Yes' : 'No'} />
              <MetaRow icon={PenTool} label="Original Credit" value={song.original_credit || '—'} />
              <MetaRow icon={Music4} label="Genre" value={song.genre} />
              <MetaRow icon={Calendar} label="Release Year" value={song.release_year} />
              <MetaRow icon={Gauge} label="Tempo" value={`${song.bpm} BPM`} />
              <MetaRow icon={Clock3} label="Duration" value={`${song.duration_formatted} (${song.duration}s)`} />
              <MetaRow icon={FileAudio} label="Audio Filename" value={song.audio_filename} mono />
              <MetaRow icon={HardDrive} label="Audio Size" value={formatBytes(song.audio_size)} />
              <MetaRow icon={FileAudio} label="Audio MIME" value={song.audio_mime} mono />
              <MetaRow icon={ImageIcon} label="Thumbnail Filename" value={song.thumbnail_filename} mono />
              <MetaRow icon={Film} label="Video Filename" value={song.video_filename || 'None'} mono />
              <MetaRow icon={HardDrive} label="Video Size" value={song.video_size ? formatBytes(song.video_size) : '—'} />
              <MetaRow icon={Calendar} label="Uploaded" value={formatDate(song.created_at, true)} />
              <MetaRow icon={CheckCircle2} label="Approved" value={song.approved_at ? formatDate(song.approved_at, true) : 'Not approved'} />
              <MetaRow icon={ShieldCheck} label="Approved By" value={data.approved_by_admin ? data.approved_by_admin.name : '—'} />
              <MetaRow icon={Calendar} label="Last Updated" value={formatDate(song.updated_at, true)} />
              <MetaRow icon={Play} label="Plays" value={formatNumber(song.plays_count)} />
              <MetaRow icon={Download} label="Downloads" value={formatNumber(song.downloads_count)} />
            </div>
          </SectionCard>
        </div>

        {/* Right rail: uploader */}
        <div className="space-y-4">
          <SectionCard title="Uploaded By" subtitle="Artist account that submitted this release">
            <div className="p-4">
              <div className="flex items-center gap-3">
                <img
                  src={data.uploader?.avatar_url || monogramAvatar(data.uploader?.name, data.uploader?.id)}
                  alt={data.uploader?.name}
                  className="w-12 h-12 rounded-xl object-cover border border-white/10 dark:border-white/15"
                />
                <div className="min-w-0">
                  <p className="font-extrabold text-sm truncate">{data.uploader?.name}</p>
                  <p className="text-[11px] text-neutral-400 truncate">{data.uploader?.email}</p>
                </div>
              </div>
              {data.uploader?.is_artist_of_the_month && (
                <div className="mt-3">
                  <ArtistOfMonthBadge size="xs" monthLabel={data.uploader.artist_of_month_badge?.month} />
                </div>
              )}
              <div className="mt-3 divide-y divide-white/[0.06] dark:divide-white/5">
                <MetaRow icon={Mail} label="Email" value={data.uploader?.email} />
                <MetaRow icon={Globe} label="Country" value={data.uploader?.country} />
                <MetaRow icon={Music4} label="Primary Genre" value={data.uploader?.primary_genre} />
                <MetaRow icon={Calendar} label="Joined" value={formatDate(data.uploader?.created_at)} />
                <MetaRow icon={UserIcon} label="Account Status" value={data.uploader?.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {[
                  { label: 'Uploaded', v: data.uploader?.stats?.uploaded },
                  { label: 'Approved', v: data.uploader?.stats?.approved },
                  { label: 'Pending', v: data.uploader?.stats?.pending },
                  { label: 'Rejected', v: data.uploader?.stats?.rejected },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-white/[0.04] dark:bg-white/[0.05] p-2.5 text-center">
                    <p className="text-lg font-black leading-none">{s.v ?? 0}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
              <Link to="/admin/users" className={`${ghostBtn} w-full mt-3`}>
                <ShieldCheck className="w-4 h-4" /> Manage User
              </Link>
            </div>
          </SectionCard>

          <SectionCard title="Artist of the Month" subtitle={data.artist_of_the_month?.month_label}>
            <div className="p-4">
              {data.artist_of_the_month?.winner ? (
                <>
                  <div className="flex items-center gap-3">
                    <img
                      src={data.artist_of_the_month.winner.avatar_url || monogramAvatar(data.artist_of_the_month.winner.name, data.artist_of_the_month.winner.user_id)}
                      alt={data.artist_of_the_month.winner.name}
                      className="w-10 h-10 rounded-xl object-cover border-2 border-amber-400/60"
                    />
                    <div className="min-w-0">
                      <p className="font-extrabold text-sm truncate">{data.artist_of_the_month.winner.name}</p>
                      <p className="text-[11px] text-neutral-400">
                        {data.artist_of_the_month.winner.monthly_approved_count} approved this month
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <ArtistOfMonthBadge size="md" monthLabel={data.artist_of_the_month.month_label} />
                  </div>
                </>
              ) : (
                <p className="text-xs text-neutral-400">No crowned artist yet this month.</p>
              )}
            </div>
          </SectionCard>

          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-rose-600 dark:text-rose-300">
              <AlertTriangle className="w-3.5 h-3.5" /> Danger Zone
            </p>
            <p className="text-[11px] text-neutral-300 dark:text-neutral-400 mt-1.5 leading-relaxed">
              Rejecting or deleting this release permanently erases the audio, cover art, and video
              from disk storage. This cannot be undone.
            </p>
            <button
              onClick={() => setRejectOpen(true)}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold"
            >
              <XCircle className="w-3.5 h-3.5" /> Reject & Permanently Remove
            </button>
          </div>
        </div>
      </div>

      {/* Reject modal */}
      {rejectOpen && (
        <div className="fixed inset-0 z-[97] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-[#070708]/70 backdrop-blur-sm" onClick={() => setRejectOpen(false)} role="presentation" />
          <div className="relative w-full max-w-lg rounded-2xl bg-[#101013] border border-white/10 dark:border-white/10 shadow-2xl animate-scale-in">
            <div className="p-5 border-b border-white/10 dark:border-white/10">
              <h3 className="font-extrabold flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-500" /> Reject & Permanently Remove
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                “{song.title}” will be erased from the database and storage, and the artist will be notified.
              </p>
            </div>
            <div className="p-5">
              <label className={labelClass}>Rejection Reason</label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this release is being rejected…"
                className={inputClass}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[
                  'Audio quality does not meet studio mastering standards.',
                  'Copyright / ownership verification failed.',
                  'Cover song missing valid original credit.',
                  'Artwork violates platform guidelines.',
                ].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setRejectReason(p)}
                    className="px-2 py-1 rounded-lg border border-white/10 dark:border-white/10 text-[10px] font-bold hover:bg-white/[0.06] dark:hover:bg-white/10"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-white/10 dark:border-white/10 flex justify-end gap-2">
              <button onClick={() => setRejectOpen(false)} className={ghostBtn}>Cancel</button>
              <button
                onClick={doReject}
                disabled={rejectLoading}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-extrabold disabled:opacity-50"
              >
                {rejectLoading ? <Spinner label="Removing…" /> : <><Trash2 className="w-4 h-4" /> Reject & Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-[97] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-[#070708]/70 backdrop-blur-sm" onClick={() => setDeleteOpen(false)} role="presentation" />
          <div className="relative w-full max-w-md rounded-2xl bg-[#101013] border border-white/10 dark:border-white/10 shadow-2xl animate-scale-in">
            <div className="p-5">
              <h3 className="font-extrabold">Delete permanently?</h3>
              <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                “{song.title}” and all associated media files will be erased. This does not count as a
                moderation rejection.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-white/10 dark:border-white/10 flex justify-end gap-2">
              <button onClick={() => setDeleteOpen(false)} className={ghostBtn}>Cancel</button>
              <button
                onClick={doDelete}
                disabled={deleteLoading}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-extrabold disabled:opacity-50"
              >
                {deleteLoading ? <Spinner label="Deleting…" /> : <><Trash2 className="w-4 h-4" /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
