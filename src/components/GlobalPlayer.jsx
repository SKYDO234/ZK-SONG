import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Download,
  Video,
  X,
  Disc3,
  Music2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import ArtistOfMonthBadge from './ArtistOfMonthBadge';

function formatTime(sec) {
  if (!sec || !isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

export default function GlobalPlayer() {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
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
  } = useApp();

  const cycleSpeed = () => {
    const rates = [1, 1.25, 1.5, 2, 0.75];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    changePlaybackRate(next);
  };

  return (
    <>
      {/* Music Video Modal Player */}
      {videoModalSong && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-4xl rounded-3xl bg-slate-900 border border-white/15 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/60">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-400 shrink-0">
                  <Video className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-white truncate">{videoModalSong.title}</h3>
                    {videoModalSong.is_artist_of_the_month && <ArtistOfMonthBadge size="sm" />}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        videoModalSong.is_cover
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      Cover Song: {videoModalSong.is_cover ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    Artist: {videoModalSong.artist} • Musician: {videoModalSong.musician} • Composer:{' '}
                    {videoModalSong.composer}
                  </p>
                </div>
              </div>
              <button
                onClick={closeVideoModal}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-colors"
                aria-label="Close video player"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-black aspect-video w-full flex items-center justify-center">
              {videoModalSong.video_url ? (
                <video
                  key={videoModalSong.video_url}
                  src={videoModalSong.video_url}
                  poster={videoModalSong.thumbnail_url}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-8 text-slate-400">
                  <Music2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No music video uploaded for this track.</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-950/80 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                Genre: <span className="text-slate-200 font-semibold">{videoModalSong.genre}</span> •
                Duration:{' '}
                <span className="text-slate-200 font-semibold">
                  {videoModalSong.duration_formatted}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                {videoModalSong.video_url && (
                  <button
                    onClick={() => downloadMedia(videoModalSong, 'video')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Video
                  </button>
                )}
                <button
                  onClick={() => downloadMedia(videoModalSong, 'audio')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Audio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Bottom Audio Player Bar */}
      {currentSong && (
        <div className="fixed bottom-0 inset-x-0 z-[80] border-t border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-[#0b0b14]/95 backdrop-blur-2xl shadow-2xl">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
            {/* Track Info */}
            <div className="flex items-center gap-3 w-full sm:w-72 min-w-0">
              <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-slate-200 dark:border-white/15 shadow-md">
                <img
                  src={currentSong.thumbnail_url}
                  alt={currentSong.title}
                  className={`w-full h-full object-cover ${isPlaying ? 'scale-105 transition-transform duration-700' : ''}`}
                />
                {isPlaying && (
                  <div className="absolute inset-0 bg-black/35 flex items-end justify-center gap-0.5 pb-1.5">
                    <span className="w-1 bg-violet-400 rounded-full eq-bar-1" />
                    <span className="w-1 bg-cyan-400 rounded-full eq-bar-2" />
                    <span className="w-1 bg-pink-400 rounded-full eq-bar-3" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                    {currentSong.title}
                  </p>
                  {currentSong.is_cover && (
                    <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-300">
                      COVER
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {currentSong.artist}
                  </p>
                  {currentSong.is_artist_of_the_month && <ArtistOfMonthBadge size="sm" />}
                </div>
              </div>
            </div>

            {/* Playback & Progress Controls */}
            <div className="flex-1 w-full flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-4">
                <button
                  onClick={prevTrack}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                  title="Previous track"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={togglePlay}
                  className="w-10 h-10 rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white flex items-center justify-center shadow-lg shadow-violet-500/30 transition-transform active:scale-95"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </button>
                <button
                  onClick={nextTrack}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                  title="Next track"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              <div className="w-full flex items-center gap-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                <span className="w-9 text-right">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 18}
                  step={0.1}
                  value={Math.min(currentTime, duration || 18)}
                  onChange={(e) => seek( parseFloat(e.target.value) )}
                  className="flex-1 h-1.5 rounded-lg accent-violet-500 cursor-pointer bg-slate-200 dark:bg-white/15"
                />
                <span className="w-9">{formatTime(duration || currentSong.duration)}</span>
              </div>
            </div>

            {/* Extra Controls: Video, Speed, Volume, Download */}
            <div className="hidden md:flex items-center gap-2.5 shrink-0">
              {currentSong.video_url && (
                <button
                  onClick={() => openVideoModal(currentSong)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-600 dark:text-violet-300 border border-violet-500/30 text-xs font-bold transition-colors"
                  title="Watch Music Video"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Video</span>
                </button>
              )}

              <button
                onClick={cycleSpeed}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-mono font-bold hover:bg-slate-200 dark:hover:bg-white/15 transition-colors"
                title="Playback Speed"
              >
                {playbackRate}x
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={toggleMute}
                  className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => changeVolume(e.target.value)}
                  className="w-20 h-1.5 accent-cyan-500 cursor-pointer"
                />
              </div>

              <button
                onClick={() => downloadMedia(currentSong, 'audio')}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 transition-colors"
                title="Download Audio"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
