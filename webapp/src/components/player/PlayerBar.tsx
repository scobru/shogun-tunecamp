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

// ─── YouTube IFrame API (same technique as shogun-space) ───────────────────
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
    _ytApiLoading: boolean;
    _ytPlayer: any;
    _ytReady: boolean;
  }
}

function ensureYTApi() {
  if (window._ytApiLoading || (window.YT && window.YT.Player)) return;
  window._ytApiLoading = true;
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}

const YT_RE =
  /(?:https?:\/\/)?(?:(?:www|music)\.)?(?:youtube\.com\/(?:watch\?(?:[^&]*&)*v=|embed\/|shorts\/|v\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

const getYoutubeId = (url: string) => {
  if (!url) return null;
  const match = url.match(YT_RE);
  if (match) return match[1];
  // Fallback for 11-char IDs
  if (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  return null;
};

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
  } = usePlayerStore();

  const audioRef = useRef<HTMLAudioElement>(null);
  const externalDurationRef = useRef<number>(0);
  const ytTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [localWaveform, setLocalWaveform] = useState<string | number[] | null>(
    null,
  );

  const service = (currentTrack?.service || "").toLowerCase();
  const url = (currentTrack?.url || "").toLowerCase();

  const isYoutube = !!(
    currentTrack?.url &&
    (service === "youtube" ||
      url.includes("youtube.com") ||
      url.includes("youtu.be"))
  );

  const isExternal = !!(
    currentTrack?.url &&
    (service === "youtube" ||
      service === "soundcloud" ||
      service === "spotify" ||
      service === "external" ||
      url.includes("youtube.com") ||
      url.includes("youtu.be") ||
      url.includes("soundcloud.com") ||
      url.includes("spotify.com"))
  );

  // ─── Ensure YT IFrame API is loaded once ──────────────────────────────
  // The player div is created imperatively in document.body (outside React's
  // virtual DOM) because the YT IFrame API replaces the div with an <iframe>,
  // which would cause React removeChild errors during reconciliation.
  useEffect(() => {
    // Create host div in document.body if it doesn't exist
    let container = document.getElementById("tc-yt-host");
    if (!container) {
      container = document.createElement("div");
      container.id = "tc-yt-host";
      // Position far off-screen but with size so it doesn't look like an audio-only tracker
      container.style.cssText =
        "position:fixed;width:300px;height:200px;top:-9999px;left:-9999px;overflow:hidden;z-index:-1;opacity:0.01;pointer-events:none;";
      const playerDiv = document.createElement("div");
      playerDiv.id = "tc-yt-player-div";
      container.appendChild(playerDiv);
      document.body.appendChild(container);
    }

    if (!window._ytReady && !window._ytPlayer) {
      ensureYTApi();
      window.onYouTubeIframeAPIReady = () => {
        window._ytPlayer = new window.YT.Player("tc-yt-player-div", {
          height: "200",
          width: "300",
          playerVars: {
            autoplay: 0,
            controls: 0,
            rel: 0,
            fs: 0,
            modestbranding: 1,
            origin: window.location.origin, // Helps with some CORS/embed policies
          },
          events: {
            onReady: () => {
              window._ytReady = true;
            },
            onStateChange: (e: any) => {
              if (e.data === 0) {
                // ENDED
                usePlayerStore.getState().next();
              }
            },
          },
        });
      };
      // If API was already loaded (e.g. hot reload), fire manually
      if (window.YT && window.YT.Player && !window._ytPlayer) {
        window.onYouTubeIframeAPIReady();
      }
    }
  }, []);

  // ─── YouTube playback control (IFrame API) ────────────────────────────
  useEffect(() => {
    if (!isYoutube || !currentTrack?.url) return;

    const ytId = getYoutubeId(currentTrack.url);
    if (!ytId) return;

    // Stop local audio
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }

    const tryLoad = () => {
      if (!window._ytReady || !window._ytPlayer) {
        setTimeout(tryLoad, 300);
        return;
      }
      const currentId = window._ytPlayer.getVideoData?.()?.video_id;
      if (currentId === ytId) {
        // Same video: just play/pause
        if (isPlaying) window._ytPlayer.playVideo();
        else window._ytPlayer.pauseVideo();
      } else {
        // New video: load and play
        window._ytPlayer.loadVideoById(ytId);
        setIsPlaying(true);
      }
    };
    tryLoad();

    // Progress polling
    if (ytTimerRef.current) clearInterval(ytTimerRef.current);
    ytTimerRef.current = setInterval(() => {
      if (!window._ytPlayer || !window._ytReady) return;
      try {
        const ct = window._ytPlayer.getCurrentTime?.() || 0;
        const dur =
          window._ytPlayer.getDuration?.() || externalDurationRef.current || 0;
        if (dur > 0) externalDurationRef.current = dur;
        setProgress(ct, dur);
      } catch (_) {
        /* ignore */
      }
    }, 500);

    return () => {
      if (ytTimerRef.current) clearInterval(ytTimerRef.current);
    };
  }, [currentTrack?.url, isYoutube]);

  // ─── Play/pause toggle for YouTube ────────────────────────────────────
  useEffect(() => {
    if (!isYoutube || !window._ytReady || !window._ytPlayer) return;
    if (isPlaying) window._ytPlayer.playVideo();
    else window._ytPlayer.pauseVideo();
  }, [isPlaying, isYoutube]);

  // ─── Unified Playback Control (local audio) ────────────────────────────
  useEffect(() => {
    if (!audioRef.current) return;

    if (isExternal) {
      // Pause local audio when playing external
      if (!audioRef.current.paused) {
        audioRef.current.pause();
      }
    } else {
      // Stop YouTube player when switching to a local track
      if (window._ytReady && window._ytPlayer) {
        try {
          window._ytPlayer.stopVideo();
        } catch (_) {
          /* ignore */
        }
      }
      // Clear YT progress polling
      if (ytTimerRef.current) {
        clearInterval(ytTimerRef.current);
        ytTimerRef.current = null;
      }

      // Sync local audio state
      if (isPlaying && audioRef.current.paused) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            if (err.name !== "AbortError") {
              console.error("[Player] Local playback failed:", err);
              setIsPlaying(false);
            }
          });
        }
      } else if (!isPlaying && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, isExternal, currentTrack, setIsPlaying]);

  useEffect(() => {
    if (isExternal && currentTrack) {
      console.log("[Player] External track detected:", {
        id: currentTrack.id,
        title: currentTrack.title,
        url: currentTrack.url,
        service: currentTrack.service,
      });
    }
  }, [isExternal, currentTrack]);

  // Seed duration from track metadata so seeking works on transcoded streams
  // (where the browser can't determine duration from the chunked response)
  useEffect(() => {
    if (
      currentTrack?.duration &&
      Number.isFinite(currentTrack.duration) &&
      currentTrack.duration > 0
    ) {
      setProgress(0, currentTrack.duration);
    }
  }, [currentTrack?.id]); // Only when track changes

  useEffect(() => {
    if (!currentTrack) return;

    if (!isExternal && audioRef.current) {
      const audio = audioRef.current;

      const isLosslessFormat =
        currentTrack.format &&
        ["wav", "flac", "lossless"].includes(currentTrack.format.toLowerCase());
      const isLosslessExt =
        currentTrack.filename &&
        (currentTrack.filename.toLowerCase().endsWith(".wav") ||
          currentTrack.filename.toLowerCase().endsWith(".flac"));
      const forceMp3 =
        !currentTrack.streamUrl && (isLosslessFormat || isLosslessExt);

      let newSrc =
        currentTrack.streamUrl ||
        API.getStreamUrl(currentTrack.id, forceMp3 ? "mp3" : undefined);

      if (
        audio.src !== newSrc &&
        !audio.src.endsWith(newSrc) &&
        audio.src !== newSrc + "/"
      ) {
        console.log("Playing Local:", newSrc);
        audio.src = newSrc;
        if (isPlaying) {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch((error) => {
              if (error.name !== "AbortError") {
                console.error("Playback failed:", error);
                setIsPlaying(false);
              }
            });
          }
        }
      }
    }

    // Fetch Waveform SVG asynchronously if not already present
    if (!currentTrack.waveform && currentTrack.id && !isExternal) {
      fetch(`/api/waveform/${currentTrack.id}`)
        .then((res) => {
          if (res.ok) return res.text();
          return null;
        })
        .then((svg) => {
          if (svg && svg.startsWith("<svg")) {
            setLocalWaveform(svg);
          }
        })
        .catch((err) => console.error("Error fetching waveform:", err));
    } else {
      setLocalWaveform(currentTrack.waveform || null);
    }

    if (!isExternal && audioRef.current) {
      const audio = audioRef.current;
      const updateTime = () => {
        const d =
          audio.duration && Number.isFinite(audio.duration)
            ? audio.duration
            : currentTrack.duration &&
                Number.isFinite(currentTrack.duration) &&
                currentTrack.duration > 0
              ? currentTrack.duration
              : audio.duration;
        setProgress(audio.currentTime, d);
      };
      const handleEnded = () => next();
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleDurationChange = () => {
        if (audio.duration && Number.isFinite(audio.duration)) {
          setProgress(audio.currentTime, audio.duration);
        } else if (
          currentTrack.duration &&
          Number.isFinite(currentTrack.duration) &&
          currentTrack.duration > 0
        ) {
          setProgress(audio.currentTime, currentTrack.duration);
        }
      };
      const handleLoadedMetadata = () => {
        if (audio.duration && Number.isFinite(audio.duration)) {
          setProgress(audio.currentTime, audio.duration);
        } else if (
          currentTrack.duration &&
          Number.isFinite(currentTrack.duration) &&
          currentTrack.duration > 0
        ) {
          setProgress(audio.currentTime, currentTrack.duration);
        }
      };

      audio.addEventListener("timeupdate", updateTime);
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("play", handlePlay);
      audio.addEventListener("pause", handlePause);
      audio.addEventListener("durationchange", handleDurationChange);
      audio.addEventListener("loadedmetadata", handleLoadedMetadata);

      return () => {
        audio.removeEventListener("timeupdate", updateTime);
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("play", handlePlay);
        audio.removeEventListener("pause", handlePause);
        audio.removeEventListener("durationchange", handleDurationChange);
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      };
    }
  }, [currentTrack, setIsPlaying, setProgress, next, isExternal]);

  // Play/pause state is already synced in Unified Playback Control effect

  // Sync volume
  useEffect(() => {
    if (!isExternal && audioRef.current) audioRef.current.volume = volume;
    if (
      isYoutube &&
      window._ytReady &&
      window._ytPlayer &&
      window._ytPlayer.setVolume
    ) {
      window._ytPlayer.setVolume(volume * 100);
    }
  }, [volume, isExternal, isYoutube]);

  // Handle manual seek from waveform/progress bar
  const handleSeek = useCallback(
    (percent: number) => {
      if (isYoutube && window._ytReady && window._ytPlayer) {
        const dur = externalDurationRef.current || duration;
        if (dur > 0) {
          window._ytPlayer.seekTo(percent * dur, true);
        }
        return;
      }

      if (audioRef.current) {
        const d =
          Number.isFinite(duration) && duration > 0
            ? duration
            : audioRef.current.duration;
        if (Number.isFinite(d) && d > 0) {
          audioRef.current.currentTime = percent * d;
        } else {
          console.warn("Cannot seek: duration not available", {
            duration,
            audioDuration: audioRef.current.duration,
          });
        }
      }
    },
    [duration, isYoutube],
  );

  if (!currentTrack)
    return (
      <div className="fixed bottom-0 w-full h-24 bg-base-200 border-t border-white/5 flex items-center justify-center text-sm opacity-50 z-50">
        Select a track to play
      </div>
    );

  // Resolve cover URL (currentTrack is guaranteed non-null here)
  let coverUrl =
    currentTrack.externalArtwork ||
    currentTrack.coverUrl ||
    currentTrack.coverImage ||
    (currentTrack.albumId ? API.getAlbumCoverUrl(currentTrack.albumId) : "") ||
    (currentTrack.artistId ? API.getArtistCoverUrl(currentTrack.artistId) : "");

  // Auto-generate YouTube thumbnail if missing
  if (!coverUrl && currentTrack.service === "youtube" && currentTrack.url) {
    const ytId = getYoutubeId(currentTrack.url);
    if (ytId) coverUrl = `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 lg:h-24 bg-base-200/90 backdrop-blur-xl border-t border-white/5 lg:px-6 flex flex-col lg:flex-row items-center gap-2 lg:gap-4 z-50 shadow-2xl pb-safe lg:pb-0 pt-2 lg:pt-0">
        <audio
          ref={audioRef}
          className="hidden"
          onError={(e) => {
            if (!isExternal) {
              console.error(
                "[Player] Audio Element Error:",
                e.currentTarget.error,
              );
            }
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
          {/* Buttons */}
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="tooltip" data-tip="Shuffle">
              <button
                aria-label="Toggle shuffle"
                className={`btn btn-ghost btn-circle btn-xs ${isShuffled ? "text-primary" : "opacity-50"}`}
                onClick={toggleShuffle}
              >
                <Shuffle size={16} />
              </button>
            </div>

            <div className="tooltip" data-tip="Previous">
              <button
                aria-label="Previous track"
                className="btn btn-ghost btn-circle btn-sm"
                onClick={prev}
              >
                <SkipBack size={20} />
              </button>
            </div>

            <div className="tooltip" data-tip={isPlaying ? "Pause" : "Play"}>
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
            </div>

            <div className="tooltip" data-tip="Next">
              <button
                aria-label="Next track"
                className="btn btn-ghost btn-circle btn-sm"
                onClick={next}
              >
                <SkipForward size={20} />
              </button>
            </div>

            <div className="tooltip" data-tip={`Repeat: ${repeatMode}`}>
              <button
                aria-label={`Repeat mode: ${repeatMode}`}
                className={`btn btn-ghost btn-circle btn-xs ${repeatMode !== "none" ? "text-primary" : "opacity-50"}`}
                onClick={toggleRepeat}
              >
                <Repeat size={16} />
                {repeatMode === "one" && (
                  <span className="absolute text-[8px] font-bold bottom-1 right-1">
                    1
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Progress Bar + Decorative Waveform */}
          <div className="w-full flex items-center gap-3 text-xs font-mono h-8 relative group px-1">
            <span className="w-10 text-right opacity-50 z-10 tabular-nums">
              {Number.isFinite(currentTime)
                ? new Date(currentTime * 1000).toISOString().substr(14, 5)
                : "0:00"}
            </span>

            <div className="flex-1 relative h-full flex items-center">
              {/* Decorative waveform background */}
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
              {Number.isFinite(duration) && duration > 0
                ? new Date(duration * 1000).toISOString().substr(14, 5)
                : "0:00"}
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
            <div className="tooltip tooltip-left" data-tip="Lyrics">
              <button
                aria-label="Toggle lyrics"
                className="btn btn-ghost btn-circle btn-sm"
                onClick={toggleLyrics}
              >
                <Mic2 size={18} />
              </button>
            </div>
            <div className="tooltip tooltip-left" data-tip="Queue">
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
      </div>

      {/* Panels */}
      <LyricsPanel />
      <QueuePanel />
    </>
  );
};
