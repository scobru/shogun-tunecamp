import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "../../stores/useAuthStore";
import { GunPlaylists } from "../../services/gun";
import API from "../../services/api";
import { Plus, Search, Youtube, Music, Check } from "lucide-react";
import type { Track, UserPlaylistTrack } from "../../types";

function isValidYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "www.youtube.com" ||
      u.hostname === "youtube.com" ||
      u.hostname === "youtu.be" ||
      u.hostname === "m.youtube.com"
    );
  } catch {
    return false;
  }
}

export const AddTrackToUserPlaylistModal = ({
  playlistId,
  onAdded,
}: {
  playlistId: string;
  onAdded?: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { isAuthenticated } = useAuthStore();

  // Tab state
  const [activeTab, setActiveTab] = useState<"youtube" | "tunecamp">("youtube");

  // YouTube form
  const [ytUrl, setYtUrl] = useState("");
  const [ytTitle, setYtTitle] = useState("");
  const [ytArtist, setYtArtist] = useState("");
  const [ytAlbum, setYtAlbum] = useState("");
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState("");
  const [ytSuccess, setYtSuccess] = useState(false);

  // TuneCamp search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [allTracks, setAllTracks] = useState<Track[]>([]);

  const [tcAddingId, setTcAddingId] = useState<string | null>(null);
  const [tcSuccess, setTcSuccess] = useState<string | null>(null);

  useEffect(() => {
    const handleOpen = () => {
      if (isAuthenticated) {
        resetState();
        dialogRef.current?.showModal();
        // Pre-load tracks for TuneCamp tab
        loadAllTracks();
      }
    };

    document.addEventListener(
      "open-add-track-to-user-playlist-modal",
      handleOpen as EventListener,
    );
    return () =>
      document.removeEventListener(
        "open-add-track-to-user-playlist-modal",
        handleOpen as EventListener,
      );
  }, [isAuthenticated, playlistId]);

  const resetState = () => {
    setYtUrl("");
    setYtTitle("");
    setYtArtist("");
    setYtAlbum("");
    setYtError("");
    setYtSuccess(false);
    setSearchQuery("");
    setSearchResults([]);
    setTcSuccess(null);
    setActiveTab("youtube");
  };

  const loadAllTracks = async () => {
    try {
      const tracks = await API.getTracks();
      setAllTracks(tracks);
      setSearchResults(tracks.slice(0, 20)); // Show first 20
    } catch (e) {
      console.error("Failed to load tracks:", e);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(allTracks.slice(0, 20));
      return;
    }
    const q = query.toLowerCase();
    const filtered = allTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.artistName && t.artistName.toLowerCase().includes(q)) ||
        (t.albumName && t.albumName.toLowerCase().includes(q)),
    );
    setSearchResults(filtered.slice(0, 30));
  };

  // Add YouTube track
  const handleAddYouTube = async (e: React.FormEvent) => {
    e.preventDefault();
    setYtError("");
    setYtSuccess(false);

    if (!ytUrl || !ytTitle || !ytArtist) {
      setYtError("URL, title, and artist are required");
      return;
    }

    if (!isValidYouTubeUrl(ytUrl)) {
      setYtError("Please enter a valid YouTube URL");
      return;
    }

    // Helper to extract YouTube video ID
    const match = ytUrl.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]*)/,
    );
    const videoId = match ? match[1] : null;
    const coverUrl = videoId
      ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      : undefined;

    setYtLoading(true);
    try {
      const track: UserPlaylistTrack = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: ytTitle,
        artistName: ytArtist,
        albumName: ytAlbum || undefined,
        source: "youtube",
        url: ytUrl,
        coverUrl, // Set the high-quality YouTube thumbnail
        addedAt: Date.now(),
      };

      await GunPlaylists.addTrackToPlaylist(playlistId, track);
      setYtSuccess(true);
      setYtUrl("");
      setYtTitle("");
      setYtArtist("");
      setYtAlbum("");
      onAdded?.();

      // Auto-close after success feedback
      setTimeout(() => setYtSuccess(false), 2000);
    } catch (e: any) {
      setYtError(e.message || "Failed to add track");
    } finally {
      setYtLoading(false);
    }
  };

  // Add TuneCamp track
  const handleAddTuneCampTrack = async (track: Track) => {
    setTcAddingId(track.id);
    setTcSuccess(null);
    try {
      const playlistTrack: UserPlaylistTrack = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: track.title,
        artistName: track.artistName || "Unknown",
        albumName: track.albumName,
        albumId: track.albumId,
        source: "tunecamp",
        streamUrl: API.getStreamUrl(track.id),
        coverUrl: track.albumId
          ? API.getAlbumCoverUrl(track.albumId)
          : undefined,
        duration: track.duration,
        tunecampTrackId: track.id,
        addedAt: Date.now(),
      };

      await GunPlaylists.addTrackToPlaylist(playlistId, playlistTrack);
      setTcSuccess(track.id);
      onAdded?.();
      setTimeout(() => setTcSuccess(null), 2000);
    } catch (e: any) {
      console.error("Failed to add track:", e);
    } finally {
      setTcAddingId(null);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <dialog
      id="add-track-to-user-playlist-modal"
      className="modal"
      ref={dialogRef}
    >
      <div className="modal-box bg-base-100 border border-white/5 max-w-2xl">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
            ✕
          </button>
        </form>

        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Plus size={24} className="text-primary" /> Add Track
        </h3>

        {/* Tabs */}
        <div className="tabs tabs-boxed bg-base-200 mb-6">
          <button
            className={`tab gap-2 flex-1 ${activeTab === "youtube" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("youtube")}
          >
            <Youtube size={16} /> YouTube Link
          </button>
          <button
            className={`tab gap-2 flex-1 ${activeTab === "tunecamp" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("tunecamp")}
          >
            <Music size={16} /> TuneCamp Tracks
          </button>
        </div>

        {/* YouTube Tab */}
        {activeTab === "youtube" && (
          <form onSubmit={handleAddYouTube} className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">YouTube URL *</span>
              </label>
              <input
                type="url"
                className="input input-bordered w-full"
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Track Title *</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={ytTitle}
                  onChange={(e) => setYtTitle(e.target.value)}
                  placeholder="Track name"
                  required
                />
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Artist *</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={ytArtist}
                  onChange={(e) => setYtArtist(e.target.value)}
                  placeholder="Artist name"
                  required
                />
              </div>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Album (optional)</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                value={ytAlbum}
                onChange={(e) => setYtAlbum(e.target.value)}
                placeholder="Album name"
              />
            </div>

            {ytError && (
              <div className="alert alert-error text-sm py-2">
                <span>{ytError}</span>
              </div>
            )}
            {ytSuccess && (
              <div className="alert alert-success text-sm py-2">
                <Check size={16} />
                <span>Track added successfully!</span>
              </div>
            )}

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => dialogRef.current?.close()}
              >
                Close
              </button>
              <button
                type="submit"
                className="btn btn-primary gap-2"
                disabled={ytLoading}
              >
                {ytLoading ? (
                  <span className="loading loading-spinner loading-sm"></span>
                ) : (
                  <Plus size={16} />
                )}
                Add Track
              </button>
            </div>
          </form>
        )}

        {/* TuneCamp Tab */}
        {activeTab === "tunecamp" && (
          <div className="space-y-4">
            <div className="form-control">
              <div className="input-group flex gap-2">
                <span className="flex items-center px-3 bg-base-200 rounded-l-lg border border-r-0 border-white/10">
                  <Search size={16} className="opacity-50" />
                </span>
                <input
                  type="text"
                  className="input input-bordered flex-1"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search tracks by title, artist, or album..."
                />
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-1 bg-base-200/30 rounded-xl border border-white/5 p-2">
              {searchResults.length === 0 ? (
                <div className="text-center py-8 opacity-50">
                  {allTracks.length === 0
                    ? "Loading tracks..."
                    : "No tracks found"}
                </div>
              ) : (
                searchResults.map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-300 transition-colors group"
                  >
                    <div className="w-10 h-10 rounded bg-base-300 flex-shrink-0 overflow-hidden">
                      {track.albumId ? (
                        <img
                          src={API.getAlbumCoverUrl(track.albumId)}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-30">
                          <Music size={16} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">
                        {track.title}
                      </div>
                      <div className="text-xs opacity-50 truncate">
                        {track.artistName}{" "}
                        {track.albumName ? `• ${track.albumName}` : ""}
                      </div>
                    </div>
                    <button
                      className={`btn btn-sm gap-1 transition-all ${
                        tcSuccess === track.id
                          ? "btn-success"
                          : "btn-ghost opacity-0 group-hover:opacity-100"
                      }`}
                      onClick={() => handleAddTuneCampTrack(track)}
                      disabled={tcAddingId === track.id}
                    >
                      {tcAddingId === track.id ? (
                        <span className="loading loading-spinner loading-xs"></span>
                      ) : tcSuccess === track.id ? (
                        <>
                          <Check size={14} /> Added
                        </>
                      ) : (
                        <>
                          <Plus size={14} /> Add
                        </>
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => dialogRef.current?.close()}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
};
