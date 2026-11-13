import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Play,
  Pause,
  Video,
  Download,
  Search,
  Crown,
  Sparkles,
  UploadCloud,
  ShieldCheck,
  KeyRound,
  Terminal,
  Sun,
  Moon,
  Music,
  Headphones,
  CheckCircle2,
  ArrowRight,
  Copy,
  RefreshCw,
  Radio,
  Disc3,
  UserCheck,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { mediaUrl } from '../lib/apiBase';
import { monogramAvatar } from '../components/avatar';
import { useApp } from '../context/AppContext';
import ArtistOfMonthBadge from '../components/ArtistOfMonthBadge';
import { readJson } from '../lib/http';

export default function LandingPage() {
  const {
    theme,
    toggleTheme,
    settings,
    artistOfTheMonth,
    publicSongs,
    publicStats,
    user,
    loginWithCredentials,
    currentSong,
    isPlaying,
    playSong,
    openVideoModal,
    downloadMedia,
    notify,
  } = useApp();

  const navigate = useNavigate();

  // Catalog Filters
  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [coverFilter, setCoverFilter] = useState('all'); // 'all' | 'original' | 'cover'

  // External REST API Simulator state
  const [simApiKey, setSimApiKey] = useState('');
  const [simSearch, setSimSearch] = useState('');
  const [simTab, setSimTab] = useState('client_ui'); // 'client_ui' | 'raw_json' | 'code_docs'
  const [simLoading, setSimLoading] = useState(false);
  const [simResponse, setSimResponse] = useState(null);
  const [simError, setSimError] = useState(null);

  const genres = useMemo(() => {
    const set = new Set(['All']);
    publicSongs.forEach((s) => {
      if (s.genre) set.add(s.genre);
    });
    return Array.from(set);
  }, [publicSongs]);

  const filteredSongs = useMemo(() => {
    return publicSongs.filter((s) => {
      if (selectedGenre !== 'All' && s.genre !== selectedGenre) return false;
      if (coverFilter === 'cover' && !s.is_cover) return false;
      if (coverFilter === 'original' && s.is_cover) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.musician.toLowerCase().includes(q) ||
          s.composer.toLowerCase().includes(q) ||
          s.genre.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [publicSongs, selectedGenre, coverFilter, search]);

  const fetchExternalApi = async (overrideKey = null, querySearch = simSearch) => {
    const keyToUse = overrideKey !== null ? overrideKey : simApiKey;
    if (!keyToUse) return;
    setSimLoading(true);
    setSimError(null);
    try {
      const url = `/api/v1/songs${querySearch ? `?search=${encodeURIComponent(querySearch)}` : ''}`;
      const res = await fetch(url, {
        headers: {
          'X-API-Key': keyToUse,
        },
      });
      const data = await readJson(res);
      if (!res.ok) {
        setSimError(data);
        setSimResponse(null);
      } else {
        setSimResponse(data);
      }
    } catch (err) {
      setSimError({ status: 'error', message: err.message });
    } finally {
      setSimLoading(false);
    }
  };

  const winner = artistOfTheMonth?.winner;
  const leaderboard = artistOfTheMonth?.leaderboard || [];

  return (
    <div className="relative min-h-screen pb-28 bg-[#08080a] text-white">
      {/* Ambient light: one warm pool behind the hero, one cool pool at the base */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[46rem] overflow-hidden">
        <div className="absolute left-1/2 top-[-18rem] h-[38rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(230,194,92,0.13),transparent_66%)] blur-[10px]" />
        <div className="absolute inset-0 grid-dots opacity-[0.35] [mask-image:radial-gradient(ellipse_at_50%_0%,black,transparent_72%)]" />
      </div>
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#08080a]/75 backdrop-blur-2xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src={mediaUrl(settings.logo_url) || '/zk-logo.svg'}
              alt={settings.site_name}
              className="w-11 h-11 rounded-2xl object-cover border border-amber-400/30 group-hover:scale-105 transition-transform"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-[1.05rem] font-semibold tracking-tight text-white">
                  {settings.site_name}
                </span>
                <span className="chip hidden px-2 py-0.5 sm:inline-flex">
                  {settings.accent_badge_text || 'STUDIO v2.6'}
                </span>
              </div>
              <p className="hidden max-w-xs truncate text-[11px] text-neutral-500 sm:block">
                {settings.site_tagline}
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 text-[13px] font-medium text-neutral-400 lg:flex">
            <a href="#artist-of-month" className="transition-colors hover:text-white">
              Artist of the Month
            </a>
            <a href="#catalog" className="transition-colors hover:text-white">
              Catalogue
            </a>
            <a href="#external-api" className="transition-colors hover:text-white">
              API
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleTheme}
              className="btn-ink h-10 w-10 p-0"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {user ? (
              <div className="flex items-center gap-2">
                {user.role === 'admin' && (
                  <Link
                    to="/admin/dashboard"
                    className="btn-ink px-4 py-2.5 text-xs sm:text-[13px]"
                  >
                    Admin Panel
                  </Link>
                )}
                <Link
                  to="/user/dashboard"
                  className="btn-ink px-4 py-2.5 text-xs sm:text-[13px]"
                >
                  User Panel
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="btn-ghost px-3 text-xs sm:text-[13px]"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="btn-gold px-4 py-2.5 text-xs sm:text-[13px]"
                >
                  Start Uploading
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 sm:pt-16 sm:pb-20 border-b border-white/10/70 dark:border-white/10">
        {/* Ambient Glows */}
        <div className="pointer-events-none absolute -top-40 left-1/4 w-96 h-96 rounded-full bg-amber-500/20 blur-[120px]" />
        <div className="pointer-events-none absolute top-20 right-1/4 w-96 h-96 rounded-full bg-amber-400/15 blur-[120px]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <p className="eyebrow flex items-center gap-2">
                <span className="inline-block h-1 w-1 rounded-full bg-gold-300" />
                Independent music infrastructure
              </p>

              <h1 className="mt-6 font-display text-[2.6rem] font-semibold leading-[1.02] tracking-tightest text-white text-balance sm:text-6xl lg:text-[4.15rem]">
                Publish the record.
                <br />
                <span className="accent-serif text-gold">Own the catalogue.</span>
              </h1>

              <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-neutral-400 text-pretty sm:text-base">
                {settings.site_description}
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  to={user ? '/user/upload' : '/register'}
                  className="btn-gold px-6 py-3.5 text-sm"
                >
                  <UploadCloud className="h-4 w-4" />
                  {user ? 'Upload a new song' : 'Create artist account'}
                </Link>

                <a href="#catalog" className="btn-ink px-5 py-3.5 text-sm">
                  <Headphones className="h-4 w-4 text-neutral-400" />
                  Hear the catalogue
                </a>

                <a href="#external-api" className="btn-ghost px-2 py-3.5 text-sm">
                  <Terminal className="h-4 w-4" />
                  Read the API
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>

              {/* Facts, not badges: quieter and more credible than three pills. */}
              <dl className="mt-12 grid max-w-lg grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                {[
                  ['Artists', publicStats?.artists_count ?? '—'],
                  ['Approved', publicStats?.approved_songs ?? publicSongs.length],
                  ['Plays', publicStats?.total_plays ?? '—'],
                ].map(([label, value]) => (
                  <div key={label} className="px-4 py-4">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      {label}
                    </dt>
                    <dd className="mono-data mt-1.5 text-lg text-white">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Hero Right Featured Player Card */}
            <div className="lg:col-span-5">
              <div className="surface-lift relative rounded-[1.75rem] p-5 text-white">
                <div className="flex items-center justify-between mb-4">
                  <span className="eyebrow flex items-center gap-1.5">
                    <Radio className="h-3 w-3 animate-pulse text-gold-300" />
                    Featured master
                  </span>
                  {winner && (
                    <ArtistOfMonthBadge
                      size="sm"
                      monthLabel={artistOfTheMonth.month_label}
                    />
                  )}
                </div>

                {publicSongs[0] ? (
                  <div className="space-y-4">
                    <div className="relative rounded-2xl overflow-hidden aspect-square max-h-64 mx-auto border border-white/15 group">
                      <img
                        src={mediaUrl(publicSongs[0].thumbnail_url)}
                        alt={publicSongs[0].title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent flex items-end justify-between p-4">
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-400/80 text-white">
                            {publicSongs[0].genre}
                          </span>
                          <h3 className="text-xl font-semibold mt-1.5">{publicSongs[0].title}</h3>
                          <p className="text-xs text-neutral-300">{publicSongs[0].artist}</p>
                        </div>
                        <button
                          onClick={() => playSong(publicSongs[0], publicSongs)}
                          className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 text-white flex items-center justify-center transition-transform hover:scale-105"
                        >
                          {currentSong?.id === publicSongs[0].id && isPlaying ? (
                            <Pause className="w-5 h-5 fill-current" />
                          ) : (
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-white/5 rounded-2xl p-3.5 border border-white/10">
                      <div>
                        <span className="text-neutral-400 block">Musician</span>
                        <span className="font-semibold text-neutral-100 truncate block">
                          {publicSongs[0].musician}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block">Composer</span>
                        <span className="font-semibold text-neutral-100 truncate block">
                          {publicSongs[0].composer}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block">Cover Song</span>
                        <span className="font-bold text-emerald-300">
                          {publicSongs[0].is_cover ? 'Yes (Cover)' : 'No (Original)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block">Music Video</span>
                        <span className="font-bold text-amber-200">
                          {publicSongs[0].video_url ? 'Available (HD MP4)' : 'Audio Only'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => playSong(publicSongs[0], publicSongs)}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 font-bold text-xs flex items-center justify-center gap-2"
                      >
                        {currentSong?.id === publicSongs[0].id && isPlaying ? (
                          <>
                            <Pause className="w-4 h-4 fill-current" /> Pause Master
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 fill-current" /> Stream Audio
                          </>
                        )}
                      </button>
                      {publicSongs[0].video_url && (
                        <button
                          onClick={() => openVideoModal(publicSongs[0])}
                          className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 font-bold text-xs flex items-center gap-1.5"
                        >
                          <Video className="w-4 h-4 text-amber-200" />
                          Watch Video
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Platform Live Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12">
            {[
              {
                label: 'Approved Songs in API',
                value: publicStats.approved_songs_count,
                sub: '100% Moderated & Streamable',
              },
              {
                label: 'Verified Artists',
                value: publicStats.artists_count,
                sub: 'Competing for Artist of the Month',
              },
              {
                label: 'Total Audio Streams',
                value: publicStats.total_plays.toLocaleString(),
                sub: 'HTTP 206 Range Streaming',
              },
              {
                label: 'External API Clients',
                value: publicStats.active_api_integrations,
                sub: 'External Apps Connected',
              },
            ].map((item, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl bg-[#101013]/70 border border-white/10/80 dark:border-white/10 shadow-sm"
              >
                <div className="font-display text-2xl font-semibold sm:text-3xl bg-gradient-to-r from-amber-500 to-amber-400 dark:from-amber-200 dark:to-amber-200 bg-clip-text text-transparent">
                  {item.value}
                </div>
                <div className="text-sm font-bold text-neutral-100 dark:text-neutral-100 mt-1">
                  {item.label}
                </div>
                <div className="text-xs text-neutral-400 dark:text-neutral-400 mt-0.5">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====================================================================
          ARTIST OF THE MONTH SPOTLIGHT SECTION (AUTOMATICALLY CALCULATED)
         ==================================================================== */}
      {winner && (
        <section id="artist-of-month" className="relative border-t border-white/[0.06] py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="surface-gold relative overflow-hidden rounded-[1.75rem] p-6 text-white sm:p-10">
              <div className="pointer-events-none absolute -right-20 -top-20 w-80 h-80 rounded-full bg-amber-500/15 blur-[100px]" />

              <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                <div>
                  <ArtistOfMonthBadge
                    size="lg"
                    monthLabel={artistOfTheMonth.month_label}
                    approvedCount={winner.monthly_approved_count}
                  />
                  <h2 className="text-2xl sm:text-4xl font-semibold mt-3">
                    {winner.name} — {artistOfTheMonth.month_label} Spotlight
                  </h2>
                  <p className="text-sm text-neutral-300 mt-1">
                    Automatically calculated in real time based on the highest number of approved songs in{' '}
                    <span className="text-amber-300 font-bold">{artistOfTheMonth.month_label}</span>.
                  </p>
                </div>

                <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-amber-300">
                      {winner.monthly_approved_count}
                    </div>
                    <div className="text-[11px] text-neutral-400 uppercase font-bold">
                      Approved This Month
                    </div>
                  </div>
                  <div className="h-8 w-px bg-white/15" />
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-amber-200">
                      {(winner.monthly_plays || 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-neutral-400 uppercase font-bold">
                      Monthly Streams
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-12 gap-8 items-start">
                {/* Winner Bio & Top Tracks */}
                <div className="lg:col-span-8 space-y-5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <img
                      src={winner.avatar_url || monogramAvatar(winner.name, winner.user_id)}
                      alt={winner.name}
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-400 shadow-lg"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xl font-semibold">{winner.name}</h3>
                        <ArtistOfMonthBadge size="sm" />
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-neutral-200 font-semibold">
                          {winner.primary_genre} • {winner.country}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-neutral-300 mt-1.5 leading-relaxed">
                        {winner.bio}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-300 mb-3">
                      Approved Tracks by {winner.name} ({winner.approved_songs?.length || 0})
                    </h4>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {(winner.approved_songs || []).slice(0, 4).map((song) => {
                        const active = currentSong?.id === song.id && isPlaying;
                        return (
                          <div
                            key={song.id}
                            className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                          >
                            <img
                              src={mediaUrl(song.thumbnail_url)}
                              alt={song.title}
                              className="w-12 h-12 rounded-xl object-cover shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-sm text-white truncate">{song.title}</p>
                              <p className="text-xs text-neutral-400 truncate">
                                {song.genre} • {song.is_cover ? 'Cover Song: Yes' : 'Original'}
                              </p>
                            </div>
                            <button
                              onClick={() => playSong(song, winner.approved_songs)}
                              className="w-9 h-9 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 flex items-center justify-center shrink-0 font-bold shadow"
                              title={active ? 'Pause' : 'Play'}
                            >
                              {active ? (
                                <Pause className="w-4 h-4 fill-current" />
                              ) : (
                                <Play className="w-4 h-4 fill-current ml-0.5" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Monthly Artist Leaderboard */}
                <div className="lg:col-span-4 rounded-2xl p-5 bg-black/40 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                      <Crown className="w-4 h-4 text-amber-400" />
                      {artistOfTheMonth.month_label} Standings
                    </h4>
                    <span className="text-[11px] text-emerald-400 font-semibold">Auto-Ranked</span>
                  </div>
                  <div className="space-y-2.5">
                    {leaderboard.map((entry) => (
                      <div
                        key={entry.user_id}
                        className={`flex items-center justify-between p-3 rounded-xl border ${
                          entry.rank === 1
                            ? 'bg-amber-500/15 border-amber-400/50'
                            : 'bg-white/5 border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center shrink-0 ${
                              entry.rank === 1
                                ? 'bg-amber-400 text-neutral-950'
                                : 'bg-white/10 text-neutral-300'
                            }`}
                          >
                            #{entry.rank}
                          </span>
                          <img
                            src={entry.avatar_url || monogramAvatar(entry.name, entry.user_id)}
                            alt={entry.name}
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-white truncate flex items-center gap-1">
                              <span>{entry.name}</span>
                              {entry.rank === 1 && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                            </div>
                            <div className="text-[11px] text-neutral-400">{entry.primary_genre}</div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold text-amber-300">
                            {entry.monthly_approved_count} Approved
                          </div>
                          <div className="text-[10px] text-neutral-400">
                            {entry.monthly_plays} streams
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ====================================================================
          APPROVED SONGS CATALOG SECTION
         ==================================================================== */}
      <section id="catalog" className="border-t border-white/[0.06] py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-amber-500 dark:text-amber-300">
                Curated & Verified Library
              </span>
              <h2 className="text-3xl font-semibold mt-1">Approved Songs Catalog</h2>
              <p className="text-sm text-neutral-300 dark:text-neutral-400 mt-1">
                Every track below has passed Admin moderation and is simultaneously available via our External REST API.
              </p>
            </div>

            {/* Search & Cover Filter */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search songs, artists, musicians..."
                  className="pl-10 pr-4 py-2.5 rounded-xl bg-[#101013] border border-white/10 dark:border-white/10 text-sm focus:outline-none focus:border-amber-400 w-64 sm:w-72"
                />
              </div>

              <select
                value={coverFilter}
                onChange={(e) => setCoverFilter(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl bg-[#101013] border border-white/10 dark:border-white/10 text-sm font-semibold focus:outline-none focus:border-amber-400"
              >
                <option value="all">All Songs (Original + Cover)</option>
                <option value="original">Cover Song: No (Originals)</option>
                <option value="cover">Cover Song: Yes (Covers)</option>
              </select>
            </div>
          </div>

          {/* Genre Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGenre(g)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  selectedGenre === g
                    ? 'bg-amber-500 text-white'
                    : 'bg-[#101013] text-neutral-300 dark:text-neutral-300 border border-white/10 dark:border-white/10 hover:border-amber-400/40'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Songs Grid */}
          {filteredSongs.length === 0 ? (
            <div className="text-center py-14 rounded-3xl bg-[#101013]/50 border border-white/10 dark:border-white/10">
              <Music className="w-12 h-12 mx-auto text-neutral-400 mb-3" />
              <h3 className="text-lg font-bold">No matching approved songs</h3>
              <p className="text-sm text-neutral-400 mt-1">
                Try clearing your search filter or upload a new song from the User Panel.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSongs.map((song) => {
                const active = currentSong?.id === song.id && isPlaying;
                return (
                  <div
                    key={song.id}
                    className="group rounded-3xl bg-[#101013]/80 border border-white/10/90 dark:border-white/10 overflow-hidden shadow-sm hover:shadow-xl hover:border-amber-400/40 transition-all flex flex-col"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-[#070708]">
                      <img
                        src={mediaUrl(song.thumbnail_url)}
                        alt={song.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                        <span className="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md text-white text-[11px] font-bold">
                          {song.genre}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur-md ${
                            song.is_cover
                              ? 'bg-amber-500/90 text-neutral-950'
                              : 'bg-emerald-500/85 text-neutral-950'
                          }`}
                        >
                          Cover: {song.is_cover ? 'Yes' : 'No'}
                        </span>
                      </div>

                      {song.video_url && (
                        <button
                          onClick={() => openVideoModal(song)}
                          className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-amber-500/90 hover:bg-amber-400 text-white text-[11px] font-bold flex items-center gap-1 shadow-lg"
                        >
                          <Video className="w-3 h-3" />
                          <span>Music Video</span>
                        </button>
                      )}

                      <div className="absolute bottom-3 inset-x-3 flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-white font-semibold text-lg leading-tight truncate">
                            {song.title}
                          </h3>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            <span className="text-xs font-semibold text-neutral-200">
                              {song.artist}
                            </span>
                            {song.is_artist_of_the_month && <ArtistOfMonthBadge size="sm" />}
                          </div>
                        </div>

                        <button
                          onClick={() => playSong(song, filteredSongs)}
                          className="w-11 h-11 rounded-2xl btn-gold flex items-center justify-center shrink-0 transition-transform active:scale-95"
                          title={active ? 'Pause' : 'Play'}
                        >
                          {active ? (
                            <Pause className="w-5 h-5 fill-current" />
                          ) : (
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-1.5 text-xs text-neutral-300 dark:text-neutral-400">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-neutral-400 dark:text-neutral-400">
                            Musician:
                          </span>
                          <span className="font-semibold text-neutral-100 dark:text-neutral-200 truncate text-right">
                            {song.musician}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-neutral-400 dark:text-neutral-400">
                            Composer:
                          </span>
                          <span className="font-semibold text-neutral-100 dark:text-neutral-200 truncate text-right">
                            {song.composer}
                          </span>
                        </div>
                        {song.is_cover && song.original_credit && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-lg truncate">
                            Credit: {song.original_credit}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-white/10/70 dark:border-white/10 flex items-center justify-between text-xs">
                        <span className="text-neutral-400 font-mono">
                          {song.duration_formatted} • {(song.plays_count || 0).toLocaleString()} plays
                        </span>
                        <div className="flex items-center gap-1.5">
                          {song.video_url && (
                            <button
                              onClick={() => openVideoModal(song)}
                              className="p-2 rounded-xl bg-amber-400/10 hover:bg-amber-400/20 text-amber-500 dark:text-amber-200 transition-colors"
                              title="Watch Music Video"
                            >
                              <Video className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => downloadMedia(song, 'audio')}
                            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/10 dark:bg-white/[0.05] dark:hover:bg-white/15 text-neutral-200 dark:text-neutral-200 transition-colors"
                            title="Download Audio"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ====================================================================
          EXTERNAL REST API SECTION
         ==================================================================== */}
      <section id="external-api" className="border-t border-white/[0.06] py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-500 dark:text-amber-200 text-xs font-semibold">
                <KeyRound className="w-3.5 h-3.5" />
                <span>External Music Application REST API (v1)</span>
              </div>
              <h2 className="text-3xl font-semibold mt-2">
                Connect External Music Apps via API Key
              </h2>
              <p className="text-sm text-neutral-300 dark:text-neutral-400 mt-1 max-w-2xl">
                External streaming clients authenticate with <code className="px-1.5 py-0.5 rounded bg-white/10 dark:bg-white/10 font-mono text-xs">X-API-Key</code> or{' '}
                <code className="px-1.5 py-0.5 rounded bg-white/10 dark:bg-white/10 font-mono text-xs">Authorization: Bearer</code> to fetch all approved songs, metadata, cover art, Artist of the Month badges, and direct HTTP Range audio streams.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {[
                { id: 'client_ui', label: '🎵 Live Client Preview' },
                { id: 'raw_json', label: '{ } Live JSON Response' },
                { id: 'code_docs', label: '⚡ Integration Code' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSimTab(t.id)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    simTab === t.id
                      ? 'btn-gold shadow-lg'
                      : 'bg-[#101013] border border-white/10 dark:border-white/10 text-neutral-300 dark:text-neutral-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key Tester Bar */}
          <div className="p-5 rounded-3xl bg-[#101013]/90 border border-white/10 dark:border-white/10 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.04] dark:bg-[#070708] border border-white/10 dark:border-white/10 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                <span>GET</span>
                <span className="text-neutral-200 dark:text-neutral-300">/api/v1/songs</span>
              </div>

              <div className="flex-1 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.04] dark:bg-[#070708] border border-white/10 dark:border-white/10">
                <KeyRound className="w-4 h-4 text-amber-300 shrink-0" />
                <span className="text-xs font-bold text-neutral-400 shrink-0">X-API-Key:</span>
                <input
                  type="text"
                  value={simApiKey}
                  onChange={(e) => setSimApiKey(e.target.value)}
                  placeholder="Enter API Key (zks_live_...)"
                  className="w-full bg-transparent text-xs font-mono focus:outline-none text-white dark:text-white"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(simApiKey);
                    notify('API Key copied to clipboard!', 'info');
                  }}
                  className="p-1 text-neutral-400 hover:text-white"
                  title="Copy API Key"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              <input
                type="text"
                value={simSearch}
                onChange={(e) => setSimSearch(e.target.value)}
                placeholder="Optional ?search= query"
                className="px-3.5 py-2.5 rounded-xl bg-white/[0.04] dark:bg-[#070708] border border-white/10 dark:border-white/10 text-xs focus:outline-none md:w-48"
              />

              <button
                onClick={() => fetchExternalApi(simApiKey, simSearch)}
                disabled={simLoading}
                className="px-5 py-2.5 rounded-xl btn-gold font-semibold text-xs flex items-center justify-center gap-2 shrink-0 shadow-md"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${simLoading ? 'animate-spin' : ''}`} />
                <span>Fetch via API Key</span>
              </button>
            </div>

            {/* Tab Content */}
            {simError ? (
              <div className="p-6 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-200 font-mono text-xs space-y-2">
                <div className="font-bold text-rose-400">
                  HTTP 401/403 API Authentication Rejected:
                </div>
                <pre className="overflow-x-auto">{JSON.stringify(simError, null, 2)}</pre>
                <p className="font-sans text-[11px] text-rose-300/80">
                  Create a key from Admin Panel → API Key Management, then paste it above.
                </p>
              </div>
            ) : simTab === 'client_ui' && simResponse ? (
              /* Example external music client consuming /api/v1/songs */
              <div className="rounded-2xl bg-[#090d16] text-white border border-emerald-500/30 overflow-hidden shadow-2xl">
                <div className="px-6 py-4 bg-gradient-to-r from-emerald-950/90 via-slate-900 to-slate-950 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center font-semibold">
                      <Disc3 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base tracking-tight text-emerald-400">
                          Pulseify External Web Player
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Connected via {simResponse.platform?.authenticated_client}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400">
                        Powered by {simResponse.platform?.name} REST API • Showing{' '}
                        {simResponse.count} Approved Tracks
                      </p>
                    </div>
                  </div>

                  {simResponse.artist_of_the_month && (
                    <div className="flex items-center gap-2 bg-black/40 px-3.5 py-1.5 rounded-full border border-amber-400/30 text-xs">
                      <Crown className="w-4 h-4 text-amber-400" />
                      <span className="text-neutral-300">API Artist of the Month:</span>
                      <span className="font-bold text-amber-300">
                        {simResponse.artist_of_the_month.artist_name} (
                        {simResponse.artist_of_the_month.monthly_approved_songs} approved)
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-4 sm:p-6 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-neutral-400">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Title & Cover</th>
                        <th className="py-2.5 px-3">Artist & Badge</th>
                        <th className="py-2.5 px-3 hidden md:table-cell">Musician & Composer</th>
                        <th className="py-2.5 px-3">Cover</th>
                        <th className="py-2.5 px-3 text-right">Stream via API</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(simResponse.songs || []).map((s, idx) => {
                        const playingThis = currentSong?.id === s.id && isPlaying;
                        return (
                          <tr key={s.id} className="hover:bg-white/5 transition-colors">
                            <td className="py-3 px-3 font-mono text-neutral-400">{idx + 1}</td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-3">
                                <img
                                  src={mediaUrl(s.thumbnail_path || s.thumbnail_url)}
                                  alt={s.title}
                                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                                />
                                <div>
                                  <div className="font-bold text-white">{s.title}</div>
                                  <div className="text-xs text-neutral-400">
                                    {s.genre} • {s.duration_formatted}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-neutral-200">{s.artist}</span>
                                {s.is_artist_of_the_month && <ArtistOfMonthBadge size="sm" />}
                              </div>
                            </td>
                            <td className="py-3 px-3 hidden md:table-cell text-xs text-neutral-400">
                              <div>Musician: {s.musician}</div>
                              <div>Composer: {s.composer}</div>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                  s.is_cover_song
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-emerald-500/20 text-emerald-300'
                                }`}
                              >
                                {s.cover_song}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <button
                                onClick={() =>
                                  playSong(
                                    {
                                      ...s,
                                      audio_url: s.audio_path || s.audio_url,
                                      thumbnail_url: s.thumbnail_path || s.thumbnail_url,
                                      video_url: s.video_path || s.video_url,
                                    },
                                    publicSongs
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-xs transition-all"
                              >
                                {playingThis ? (
                                  <>
                                    <Pause className="w-3.5 h-3.5 fill-current" /> Playing
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-3.5 h-3.5 fill-current" /> Play API Stream
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : simTab === 'raw_json' ? (
              <div className="rounded-2xl bg-[#070708] p-4 border border-white/10 font-mono text-xs text-emerald-300 max-h-96 overflow-auto">
                <pre>{JSON.stringify(simResponse, null, 2)}</pre>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#070708] p-5 border border-white/10 font-mono text-xs text-amber-200 space-y-3 overflow-x-auto">
                <div className="text-neutral-400 font-sans font-bold">
                  Example JavaScript Fetch for External Music Clients (Mobile / Web):
                </div>
                <pre className="text-emerald-300">{`const response = await fetch('${window.location.origin}/api/v1/songs', {
  method: 'GET',
  headers: {
    'X-API-Key': '${simApiKey || 'zks_live_your_api_key'}',
    'Accept': 'application/json'
  }
});
const { songs, artist_of_the_month } = await readJson(response);
// Each song includes: title, artist, musician, composer, cover_song ("Yes"/"No"),
// thumbnail_url, audio_url, stream_url, video_url, and is_artist_of_the_month badge!`}</pre>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 dark:border-white/10 py-10 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-400 dark:text-neutral-400">
            <div className="flex items-center gap-3">
              <img
                src={mediaUrl(settings.logo_url) || '/zk-logo.svg'}
                alt={settings.site_name}
                className="w-7 h-7 rounded-lg"
              />
              <span className="font-bold text-neutral-100 dark:text-neutral-200">
                {settings.site_name}
              </span>
              <span>— {settings.footer_text}</span>
            </div>
            <div className="flex items-center gap-4">
              <span>Contact: {settings.contact_email}</span>
              <Link to="/login" className="hover:text-amber-300 font-semibold">
                Login
              </Link>
              <Link to="/register" className="hover:text-amber-300 font-semibold">
                Register
              </Link>
            </div>
          </div>

          {/* Studio credit */}
          <div className="pt-5 border-t border-white/10/70 dark:border-white/5 text-center sm:text-left">
            <p className="text-[11px] sm:text-xs font-semibold tracking-[0.18em] uppercase text-neutral-200 dark:text-neutral-200">
              Website by ZK Studio
            </p>
            <p className="mt-1.5 text-[11px] sm:text-xs font-semibold text-neutral-400 dark:text-neutral-400">
              CEO &amp; MD — Ziyan Hossain
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
