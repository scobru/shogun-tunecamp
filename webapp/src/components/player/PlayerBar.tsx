import { useRef, useEffect, useCallback, useState } from "react";
import { usePlayerStore } from "../../stores/usePlayerStore";
import API from "../../services/api";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Mic2,
  ListMusic,
  Shuffle,
  Repeat,
} from "lucide-react";
import { Waveform } from "./Waveform";
import { LyricsPanel } from "./LyricsPanel";
import { QueuePanel } from "./QueuePanel";
import { ScrollingText } from "../ui/ScrollingText";
import { useColor } from "color-thief-react";

export const PlayerBar = () => {
  const {
    currentTrack,
    isPlaying,
    volume,
    togglePlay,
    next,
    prev,
    setIsPlaying,
    setProgress,
    setVolume,
    isShuffled,
    repeatMode,
    toggleShuffle,
    toggleRepeat,
    toggleLyrics,
    toggleQueue,
    progress,
    currentTime,
    duration,
    setDominantColor,
  } = usePlayerStore();

  const audioRef = useRef<HTMLAudioElement>(null);
  const [localWaveform, setLocalWaveform] = useState<string | number[] | null>(
    null,
  );
  
  // Track if the pause/play was triggered by our own code to avoid event loops
  const isInternalChange = useRef(false);
  const lastTrackId = useRef<string | number | null>(null);

  // ─── Unified Audio Source and Playback Effect ────────────────────────
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    const audio = audioRef.current;

    // 1. Determine Source URL
    const isLosslessFormat =
      currentTrack.format &&
      ["wav", "flac", "lossless"].includes(currentTrack.format.toLowerCase());
    const isLosslessExt =
      currentTrack.filename &&
      (currentTrack.filename.toLowerCase().endsWith(".wav") ||
        currentTrack.filename.toLowerCase().endsWith(".flac"));
    const forceMp3 =
      !currentTrack.streamUrl && (isLosslessFormat || isLosslessExt);

    let newSrc = API.getStreamUrl(currentTrack.id, forceMp3 ? 'mp3' : undefined);
    if (currentTrack.streamUrl) {
      try {
        const streamUrlObj = new URL(currentTrack.streamUrl);
        const isLocalOrigin = streamUrlObj.origin === window.location.origin;
        newSrc = isLocalOrigin 
          ? currentTrack.streamUrl 
          : `/api/proxy/stream?url=${encodeURIComponent(currentTrack.streamUrl)}`;
      } catch (e) {
        newSrc = `/api/proxy/stream?url=${encodeURIComponent(currentTrack.streamUrl)}`;
      }
    }

    // 2. Update Source if changed
    const srcChanged = audio.src !== newSrc && !audio.src.endsWith(newSrc) && audio.src !== newSrc + "/";
    if (srcChanged) {
      console.log("Player: Changing source to", newSrc);
      isInternalChange.current = true;
      audio.src = newSrc;
      // When source changes, browser automatically pauses.
      // We don't want the onPause event to toggle the store's isPlaying to false.
    }

    // 3. Sync Play/Pause State
    if (isPlaying && audio.paused) {
      isInternalChange.current = true;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name !== "AbortError") {
            console.error("[Player] Playback failed:", err);
            isInternalChange.current = true;
            setIsPlaying(false);
          }
        });
      }
    } else if (!isPlaying && !audio.paused) {
      isInternalChange.current = true;
      audio.pause();
    }

    isInternalChange.current = false;
  }, [currentTrack?.id, isPlaying, setIsPlaying]); // Sensitive to track changes and play/pause state

  // ─── Event Listeners and Metadata ──────────────────────────────────────
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    const audio = audioRef.current;

    const handlePlay = () => {
      if (!isInternalChange.current) {
        setIsPlaying(true);
      }
    };

    const handlePause = () => {
      // Only update store if the pause wasn't triggered by our own code (like track switching)
      if (!isInternalChange.current) {
        setIsPlaying(false);
      }
    };

    const updateTime = () => {
      const d = audio.duration && Number.isFinite(audio.duration) ? audio.duration : (currentTrack.duration || 0);
      setProgress(audio.currentTime, d);
    };

    const handleEnded = () => next();
    
    const syncDuration = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setProgress(audio.currentTime, audio.duration);
      }
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("durationchange", syncDuration);
    audio.addEventListener("loadedmetadata", syncDuration);

    // Reset progress on track change
    if (lastTrackId.current !== currentTrack.id) {
        setProgress(0, currentTrack.duration || 0);
        lastTrackId.current = currentTrack.id;
    }

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("durationchange", syncDuration);
      audio.removeEventListener("loadedmetadata", syncDuration);
    };
  }, [currentTrack?.id, setIsPlaying, setProgress, next]);

  // Waveform fetching
  useEffect(() => {
    if (!currentTrack) return;
    if (!currentTrack.waveform && currentTrack.id) {
      setLocalWaveform(null);
      fetch(`/api/waveform/${encodeURIComponent(String(currentTrack.id))}`)
        .then((res) => (res.ok ? res.text() : null))
        .then((svg) => {
          if (svg && svg.startsWith("<svg")) setLocalWaveform(svg);
        })
        .catch((err) => console.error("Error fetching waveform:", err));
    } else {
      setLocalWaveform(currentTrack.waveform || null);
    }
  }, [currentTrack?.id]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Handle manual seek from waveform/progress bar
  const handleSeek = useCallback(
    (percent: number) => {
      if (audioRef.current) {
        const d = Number.isFinite(duration) && duration > 0 ? duration : audioRef.current.duration;
        if (Number.isFinite(d) && d > 0) {
          audioRef.current.currentTime = percent * d;
        }
      }
    },
    [duration],
  );

  let coverUrl = currentTrack ? (
    currentTrack.coverImage ||
    currentTrack.coverUrl ||
    (currentTrack.albumId ? API.getAlbumCoverUrl(currentTrack.albumId) : "") ||
    (currentTrack.artistId ? API.getArtistCoverUrl(currentTrack.artistId) : "")
  ) : "";

  const { data: dominantColor } = useColor(coverUrl || "", "hex", {
    crossOrigin: "anonymous",
    quality: 10,
  });

  useEffect(() => {
    if (dominantColor) setDominantColor(dominantColor);
  }, [dominantColor, setDominantColor]);

  if (!currentTrack)
    return (
      <div className="fixed bottom-0 w-full h-24 bg-base-200 border-t border-white/5 flex items-center justify-center text-sm opacity-50 z-50">
        Select a track to play
      </div>
    );

  return (
    <>
      <div 
        className="fixed bottom-0 left-0 right-0 lg:h-24 backdrop-blur-xl border-t border-white/5 lg:px-6 flex flex-col lg:flex-row items-center gap-2 lg:gap-4 z-50 shadow-2xl pb-safe lg:pb-0 pt-2 lg:pt-0 transition-colors duration-1000"
        style={{ backgroundColor: dominantColor ? `${dominantColor}40` : "oklch(var(--b2) / 0.4)" }}
      >
        <audio
          ref={audioRef}
          className="hidden"
          onError={(e) => {
            console.error("[Player] Audio Element Error:", e.currentTarget.error);
          }}
        />

        {/* Track Info */}
        <div className="flex items-center gap-3 lg:gap-4 w-full lg:w-64 shrink-0 px-4 lg:px-0">
          <div className="relative group shrink-0">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Cover"
                className="w-10 h-10 lg:w-14 lg:h-14 rounded-lg bg-base-300 shadow-lg object-cover"
              />
            ) : (
              <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-lg bg-base-300 shadow-lg flex items-center justify-center">
                <span className="text-xs opacity-50">?</span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <ScrollingText className="font-bold text-sm lg:text-base">
              {currentTrack.title}
            </ScrollingText>
            <ScrollingText className="text-xs lg:text-sm opacity-60 text-primary">
              {currentTrack.artistName}
            </ScrollingText>
          </div>
        </div>

        {/* Controls & Waveform */}
        <div className="flex flex-col items-center flex-1 max-w-2xl mx-auto gap-1 w-full px-2 lg:px-0">
          <div className="flex items-center gap-4 lg:gap-6">
            <button
              aria-label="Toggle shuffle"
              className={`btn btn-ghost btn-circle btn-xs ${isShuffled ? "text-primary" : "opacity-50"}`}
              onClick={toggleShuffle}
            >
              <Shuffle size={16} />
            </button>

            <button
              aria-label="Previous track"
              className="btn btn-ghost btn-circle btn-sm"
              onClick={prev}
            >
              <SkipBack size={20} />
            </button>

            <button
              aria-label={isPlaying ? "Pause" : "Play"}
              className="btn btn-circle btn-primary text-primary-content shadow-lg shadow-primary/20 lg:scale-110 hover:scale-110 transition-transform"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause size={24} fill="currentColor" />
              ) : (
                <Play size={24} fill="currentColor" />
              )}
            </button>

            <button
              aria-label="Next track"
              className="btn btn-ghost btn-circle btn-sm"
              onClick={next}
            >
              <SkipForward size={20} />
            </button>

            <button
              aria-label={`Repeat mode: ${repeatMode}`}
              className={`btn btn-ghost btn-circle btn-xs ${repeatMode !== "none" ? "text-primary" : "opacity-50"}`}
              onClick={toggleRepeat}
            >
              <Repeat size={16} />
              {repeatMode === "one" && (
                <span className="absolute text-[8px] font-bold bottom-1 right-1">1</span>
              )}
            </button>
          </div>

          <div className="w-full flex items-center gap-3 text-xs font-mono h-8 relative group px-1">
            <span className="w-10 text-right opacity-50 z-10 tabular-nums">
              {Number.isFinite(currentTime) ? new Date(currentTime * 1000).toISOString().substr(14, 5) : "0:00"}
            </span>

            <div className="flex-1 relative h-full flex items-center">
              {(localWaveform || currentTrack.waveform) && (
                <div className="absolute inset-0 opacity-20 pointer-events-none flex items-center">
                  <Waveform
                    data={localWaveform || currentTrack.waveform}
                    progress={progress / 100}
                    height={32}
                    colorPlayed="oklch(var(--color-primary))"
                    colorRemaining="rgba(255, 255, 255, 0.1)"
                  />
                </div>
              )}

              <input
                aria-label="Seek track"
                type="range"
                className="range range-sm range-primary w-full relative z-20 cursor-pointer"
                min="0"
                max="100"
                step="0.1"
                value={progress || 0}
                onChange={(e) => handleSeek(parseFloat(e.target.value) / 100)}
              />
            </div>

            <span className="w-10 opacity-50 z-10 tabular-nums">
              {Number.isFinite(duration) && duration > 0 ? new Date(duration * 1000).toISOString().substr(14, 5) : "0:00"}
            </span>
          </div>
        </div>

        {/* Volume & Extras */}
        <div className="hidden lg:flex items-center gap-4 w-64 justify-end">
          <div className="flex items-center gap-2 group">
            <button
              aria-label={volume === 0 ? "Unmute" : "Mute"}
              onClick={() => setVolume(volume === 0 ? 1 : 0)}
              className="btn btn-ghost btn-circle btn-xs"
            >
              <Volume2
                size={18}
                className={`opacity-70 group-hover:text-primary transition-colors ${volume === 0 ? "text-error" : ""}`}
              />
            </button>
            <input
              aria-label="Volume"
              type="range"
              className="range range-xs w-24 range-secondary"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
            />
          </div>
          <div className="border-l border-white/10 pl-4 flex gap-2">
            <button
              aria-label="Toggle lyrics"
              className="btn btn-ghost btn-circle btn-sm"
              onClick={toggleLyrics}
            >
              <Mic2 size={18} />
            </button>
            <button
              aria-label="Toggle queue"
              className="btn btn-ghost btn-circle btn-sm"
              onClick={toggleQueue}
            >
              <ListMusic size={18} />
            </button>
          </div>
        </div>
      </div>

      <LyricsPanel />
      <QueuePanel />
    </>
  );
};
