import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { withApiBase, mediaUrl } from '../lib/apiBase';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Theme state (Dark / Light)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('zksong_theme') || 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('zksong_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Toast Notifications
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Platform Settings, Approved Songs, Artist of the Month
  const [settings, setSettings] = useState({
    site_name: 'ZK-SONG',
    site_tagline: 'Next-Gen Music Publishing, Cloud Mastering & Global Streaming API',
    site_description:
      'The professional music-uploading & distribution ecosystem for artists, musicians, and composers.',
    logo_url: '/uploads/branding/zk-logo.svg',
    primary_color: '#8b5cf6',
    secondary_color: '#06b6d4',
    accent_badge_text: 'STUDIO CLOUD v2.6',
    contact_email: 'support@zksong.io',
    footer_text: '© 2026 ZK-SONG Music Publishing & API Ecosystem.',
    allow_registration: 'true',
    require_moderation: 'true',
    max_upload_mb: '100',
  });
  const [artistOfTheMonth, setArtistOfTheMonth] = useState(null);
  const [publicSongs, setPublicSongs] = useState([]);
  const [publicStats, setPublicStats] = useState({
    approved_songs_count: 0,
    artists_count: 0,
    total_plays: 0,
    active_api_integrations: 0,
  });
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);

  // Auth State
  const [token, setToken] = useState(() => localStorage.getItem('zksong_token') || '');
  const [user, setUser] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const refreshBootstrap = useCallback(async () => {
    try {
      const res = await fetch('/api/public/bootstrap');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setSettings(data.settings);
          document.title = `${data.settings.site_name} — ${data.settings.site_tagline || 'Music Platform'}`;
          document.documentElement.style.setProperty(
            '--brand-primary',
            data.settings.primary_color || '#8b5cf6'
          );
          document.documentElement.style.setProperty(
            '--brand-secondary',
            data.settings.secondary_color || '#06b6d4'
          );
        }
        if (data.artist_of_the_month) setArtistOfTheMonth(data.artist_of_the_month);
        if (data.approved_songs) setPublicSongs(data.approved_songs);
        if (data.stats) setPublicStats(data.stats);
      }
    } catch (err) {
      console.error('Bootstrap fetch error:', err);
    } finally {
      setLoadingBootstrap(false);
    }
  }, []);

  const refreshUser = useCallback(
    async (overrideToken = null) => {
      const activeToken = overrideToken !== null ? overrideToken : token;
      if (!activeToken) {
        setUser(null);
        setLoadingAuth(false);
        return null;
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${activeToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setUnreadNotifications(data.unread_notifications || 0);
          setIsPlatformOwner(Boolean(data.is_platform_owner));
          if (data.artist_of_the_month) {
            setArtistOfTheMonth(data.artist_of_the_month);
          }
          return data.user;
        } else {
          localStorage.removeItem('zksong_token');
          setToken('');
          setUser(null);
          return null;
        }
      } catch (err) {
        console.error('Auth verify error:', err);
        return null;
      } finally {
        setLoadingAuth(false);
      }
    },
    [token]
  );

  useEffect(() => {
    refreshBootstrap();
  }, [refreshBootstrap]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const loginWithCredentials = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }
    localStorage.setItem('zksong_token', data.token);
    setToken(data.token);
    setUser(data.user);
    notify(data.message || 'Signed in successfully!', 'success');
    refreshUser(data.token);
    return data.user;
  };

  const registerAccount = async (payload) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    localStorage.setItem('zksong_token', data.token);
    setToken(data.token);
    setUser(data.user);
    notify(data.message || 'Account created!', 'success');
    return data.user;
  };

  const logout = useCallback(() => {
    localStorage.removeItem('zksong_token');
    setToken('');
    setUser(null);
    notify('You have been signed out.', 'info');
  }, [notify]);

  const authFetch = useCallback(
    async (url, options = {}) => {
      const headers = { ...(options.headers || {}) };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (!(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401) {
        localStorage.removeItem('zksong_token');
        setToken('');
        setUser(null);
      }
      return res;
    },
    [token]
  );

  // ============================================================================
  // GLOBAL STUDIO AUDIO & VIDEO PLAYER
  // ============================================================================
  const audioRef = useRef(null);
  const [currentSong, setCurrentSong] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoModalSong, setVideoModalSong] = useState(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'metadata';
    }
    const audio = audioRef.current;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      // Auto advance if playlist has more songs
      if (playlist.length > 1 && currentSong) {
        const idx = playlist.findIndex((s) => s.id === currentSong.id);
        if (idx !== -1 && idx + 1 < playlist.length) {
          playSong(playlist[idx + 1], playlist);
        }
      }
    };
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
    };
  }, [playlist, currentSong]);

  const playSong = useCallback(
    async (song, list = null) => {
      if (!song || !song.audio_url) return;
      const audio = audioRef.current;
      if (!audio) return;

      if (list && Array.isArray(list)) {
        setPlaylist(list);
      } else if (playlist.length === 0) {
        setPlaylist(publicSongs);
      }

      if (currentSong && currentSong.id === song.id) {
        if (audio.paused) {
          try {
            await audio.play();
            setIsPlaying(true);
          } catch (e) {
            console.error('Playback error:', e);
          }
        } else {
          audio.pause();
          setIsPlaying(false);
        }
        return;
      }

      setCurrentSong(song);
      setCurrentTime(0);
      setDuration(song.duration || 18);
      audio.src = mediaUrl(song.audio_url);
      audio.volume = isMuted ? 0 : volume;
      audio.playbackRate = playbackRate;

      try {
        await audio.play();
        setIsPlaying(true);
        // Record play count asynchronously
        fetch(`/api/public/songs/${song.id}/play`, { method: 'POST' }).catch(() => {});
      } catch (e) {
        console.warn('Autoplay prevented or interrupted:', e.message);
        setIsPlaying(false);
      }
    },
    [currentSong, playlist, publicSongs, isMuted, volume, playbackRate]
  );

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !currentSong) {
      if (publicSongs.length > 0) {
        playSong(publicSongs[0], publicSongs);
      }
      return;
    }
    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (e) {
        console.error(e);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [currentSong, publicSongs, playSong]);

  const seek = useCallback((newTime) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  const changeVolume = useCallback((val) => {
    const v = Math.max(0, Math.min(1, Number(val)));
    setVolume(v);
    setIsMuted(v === 0);
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted) {
      audio.volume = volume || 0.8;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const changePlaybackRate = useCallback((rate) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  const nextTrack = useCallback(() => {
    const activeList = playlist.length > 0 ? playlist : publicSongs;
    if (!activeList.length) return;
    if (!currentSong) {
      playSong(activeList[0], activeList);
      return;
    }
    const idx = activeList.findIndex((s) => s.id === currentSong.id);
    const nextIdx = idx === -1 || idx + 1 >= activeList.length ? 0 : idx + 1;
    playSong(activeList[nextIdx], activeList);
  }, [playlist, publicSongs, currentSong, playSong]);

  const prevTrack = useCallback(() => {
    const activeList = playlist.length > 0 ? playlist : publicSongs;
    if (!activeList.length) return;
    if (!currentSong) {
      playSong(activeList[0], activeList);
      return;
    }
    const idx = activeList.findIndex((s) => s.id === currentSong.id);
    const prevIdx = idx <= 0 ? activeList.length - 1 : idx - 1;
    playSong(activeList[prevIdx], activeList);
  }, [playlist, publicSongs, currentSong, playSong]);

  const openVideoModal = useCallback((song) => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
    setVideoModalSong(song);
  }, []);

  const closeVideoModal = useCallback(() => {
    setVideoModalSong(null);
  }, []);

  const downloadMedia = useCallback(
    (song, type = 'audio') => {
      if (!song) return;
      const url = withApiBase(
        `/api/public/songs/${song.id}/download?type=${encodeURIComponent(type)}`
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      notify(`Downloading ${type} for "${song.title}"...`, 'info');
    },
    [notify]
  );

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        toasts,
        notify,
        dismissToast,
        settings,
        setSettings,
        mediaUrl,
        withApiBase,
        artistOfTheMonth,
        setArtistOfTheMonth,
        publicSongs,
        publicStats,
        loadingBootstrap,
        refreshBootstrap,
        token,
        user,
        setUser,
        unreadNotifications,
        setUnreadNotifications,
        loadingAuth,
        isPlatformOwner,
        loginWithCredentials,
        registerAccount,
        logout,
        refreshUser,
        authFetch,
        // Player
        currentSong,
        playlist,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        playbackRate,
        playSong,
        togglePlay,
        seek,
        changeVolume,
        toggleMute,
        changePlaybackRate,
        nextTrack,
        prevTrack,
        videoModalSong,
        openVideoModal,
        closeVideoModal,
        downloadMedia,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
