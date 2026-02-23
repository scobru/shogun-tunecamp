import { useRef, useEffect, useCallback, useState } from "react";
import ReactPlayer from "react-player";
const Player = ReactPlayer as any;
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
  const playerRef = useRef<any>(null); // Use any for now to avoid complex type issues with react-player
  const [localWaveform, setLocalWaveform] = useState<string | number[] | null>(
    null,
  );

  const isExternal = !!(
    currentTrack?.url &&
    (currentTrack?.service !== "local" ||
      (!(currentTrack as any).file_path && !currentTrack.path))
  );

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

  useEffect(() => {
    if (!currentTrack) return;

    if (!isExternal && audioRef.current) {
      const audio = audioRef.current;
      let newSrc = currentTrack.streamUrl || API.getStreamUrl(currentTrack.id);

      // Auto-transcode lossless/heavy formats to MP3 for streaming (matching legacy behavior)
      if (
        !currentTrack.streamUrl &&
        currentTrack.format &&
        ["wav", "flac"].includes(currentTrack.format.toLowerCase())
      ) {
        newSrc += "?format=mp3";
      }

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
              console.error("Playback failed:", error);
              setIsPlaying(false);
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
      const updateTime = () => setProgress(audio.currentTime, audio.duration);
      const handleEnded = () => next();
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleDurationChange = () => {
        if (audio.duration && Number.isFinite(audio.duration)) {
          setProgress(audio.currentTime, audio.duration);
        }
      };
      const handleLoadedMetadata = () => {
        if (audio.duration && Number.isFinite(audio.duration)) {
          setProgress(audio.currentTime, audio.duration);
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

  // Sync play/pause state
  useEffect(() => {
    if (isExternal) return;
    if (!audioRef.current) return;
    if (isPlaying && audioRef.current.paused) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    } else if (!isPlaying && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [isPlaying, setIsPlaying, isExternal]);

  // Sync volume
  useEffect(() => {
    if (!isExternal && audioRef.current) audioRef.current.volume = volume;
  }, [volume, isExternal]);

  // Handle manual seek from waveform/progress bar
  const handleSeek = useCallback(
    (percent: number) => {
      if (isExternal && playerRef.current) {
        playerRef.current.seekTo(percent, "fraction");
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
    [duration, isExternal],
  );

  if (!currentTrack)
    return (
      <div className="fixed bottom-0 w-full h-24 bg-base-200 border-t border-white/5 flex items-center justify-center text-sm opacity-50 z-50">
        Select a track to play
      </div>
    );

  // Resolve cover URL
  const coverUrl =
    currentTrack.externalArtwork ||
    currentTrack.coverUrl ||
    currentTrack.coverImage ||
    (currentTrack.albumId ? API.getAlbumCoverUrl(currentTrack.albumId) : "") ||
    (currentTrack.artistId ? API.getArtistCoverUrl(currentTrack.artistId) : "");

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 lg:h-24 bg-base-200/90 backdrop-blur-xl border-t border-white/5 lg:px-6 flex flex-col lg:flex-row items-center gap-2 lg:gap-4 z-50 shadow-2xl pb-safe lg:pb-0 pt-2 lg:pt-0">
        {!isExternal ? (
          <audio
            ref={audioRef}
            className="hidden"
            onError={(e) =>
              console.error(
                "Audio Element Error:",
                e.currentTarget.error,
                e.currentTarget.src,
              )
            }
          />
        ) : (
          <div
            className="absolute p-0 m-0 overflow-hidden pointer-events-none opacity-0"
            style={{ width: 1, height: 1, top: -10, left: -10 }}
          >
            <Player
              ref={playerRef}
              url={currentTrack.url}
              playing={isPlaying}
              volume={volume}
              onProgress={(state: any) =>
                setProgress(state.playedSeconds, duration || 0)
              }
              onDuration={(d: number) => setProgress(currentTime, d)}
              onEnded={() => next()}
              onError={(e: any) => console.error("ReactPlayer Error:", e)}
              config={
                {
                  youtube: { embedOptions: {} },
                  soundcloud: { options: { visual: true } },
                } as any
              }
            />
          </div>
        )}

        {/* Track Info */}
        <div className="flex items-center gap-3 lg:gap-4 w-full lg:w-64 shrink-0 px-4 lg:px-0">
          <div className="relative group">
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
            <button
              className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity rounded-lg lg:hidden"
              onClick={() =>
                document.querySelector(".drawer")?.classList.add("drawer-end")
              } // Placeholder for full player expansion if needed
            >
              <span className="text-white text-xs">View</span>
            </button>
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
          <div className="w-full flex items-center gap-3 text-xs font-mono h-6 lg:h-8 relative group">
            {/* Decorative waveform background */}
            {(localWaveform || currentTrack.waveform) && (
              <div className="absolute inset-0 opacity-20 group-hover:opacity-40 transition-opacity pointer-events-none">
                <Waveform
                  data={localWaveform || currentTrack.waveform}
                  progress={progress / 100}
                  height={40}
                  colorPlayed="oklch(var(--color-primary))"
                  colorRemaining="rgba(255, 255, 255, 0.1)"
                />
              </div>
            )}

            <span className="min-w-[40px] text-right opacity-50 z-10 tabular-nums">
              {Number.isFinite(currentTime)
                ? new Date(currentTime * 1000).toISOString().substr(14, 5)
                : "0:00"}
            </span>
            <input
              aria-label="Seek track"
              type="range"
              className="range range-xs range-primary flex-1 z-10 h-1.5 hover:h-2 transition-all"
              min="0"
              max="100"
              value={progress || 0}
              onChange={(e) => handleSeek(parseFloat(e.target.value) / 100)}
            />
            <span className="min-w-[40px] opacity-50 z-10 tabular-nums">
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
