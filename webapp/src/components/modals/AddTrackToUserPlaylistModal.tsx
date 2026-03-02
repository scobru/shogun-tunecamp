import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "../../stores/useAuthStore";
import { GunPlaylists } from "../../services/gun";
import API from "../../services/api";
import { Plus, Search, Music, Check } from "lucide-react";
import type { Track, UserPlaylistTrack } from "../../types";

export const AddTrackToUserPlaylistModal = ({
  playlistId,
  onAdded,
}: {
  playlistId: string;
  onAdded?: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { isAuthenticated } = useAuthStore();

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
    setSearchQuery("");
    setSearchResults([]);
    setTcSuccess(null);
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
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
};
