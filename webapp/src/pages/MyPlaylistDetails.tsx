import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import { usePlayerStore } from "../stores/usePlayerStore";
import { GunPlaylists } from "../services/gun";
import {
  Music,
  Play,
  Trash2,
  Clock,
  Plus,
  Heart,
  Youtube,
  ArrowLeft,
  MoreHorizontal,
} from "lucide-react";
import type { UserPlaylist, UserPlaylistTrack, Track } from "../types";
import { AddTrackToUserPlaylistModal } from "../components/modals/AddTrackToUserPlaylistModal";

/**
 * Convert a UserPlaylistTrack to a playable Track object for the player store
 */
function toPlayableTrack(upt: UserPlaylistTrack): Track {
  if (upt.source === "youtube") {
    return {
      id: upt.id,
      title: upt.title,
      artistId: "",
      artistName: upt.artistName,
      albumId: "",
      albumName: upt.albumName,
      duration: upt.duration || 0,
      path: "",
      filename: "",
      playCount: 0,
      url: upt.url,
      service: "youtube",
      externalArtwork: upt.coverUrl,
    };
  }
  // TuneCamp track
  return {
    id: upt.tunecampTrackId || upt.id,
    title: upt.title,
    artistId: "",
    artistName: upt.artistName,
    albumId: upt.albumId || "",
    albumName: upt.albumName,
    duration: upt.duration || 0,
    path: "",
    filename: "",
    playCount: 0,
    streamUrl: upt.streamUrl,
    coverUrl: upt.coverUrl,
    coverImage: upt.coverUrl,
  };
}

export const MyPlaylistDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<UserPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated, user } = useAuthStore();
  const { playTrack } = usePlayerStore();

  useEffect(() => {
    if (id) loadPlaylist(id);
  }, [id]);

  const loadPlaylist = async (playlistId: string) => {
    setLoading(true);
    try {
      const data = await GunPlaylists.getPlaylist(playlistId);
      if (!data) {
        navigate("/my-playlists");
        return;
      }
      setPlaylist(data);
    } catch (e) {
      console.error(e);
      navigate("/my-playlists");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (
      !playlist ||
      !confirm(
        "Are you sure you want to delete this playlist? This cannot be undone.",
      )
    )
      return;
    try {
      await GunPlaylists.deletePlaylist(playlist.id);
      navigate("/my-playlists");
    } catch (e) {
      console.error(e);
      alert("Failed to delete playlist");
    }
  };

  const handleRemoveTrack = async (trackId: string) => {
    if (!playlist) return;
    if (!confirm("Remove track from playlist?")) return;
    try {
      await GunPlaylists.removeTrackFromPlaylist(playlist.id, trackId);
      loadPlaylist(playlist.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePlayTrack = (track: UserPlaylistTrack) => {
    if (!playlist) return;
    const playable = toPlayableTrack(track);
    const allPlayable = playlist.tracks.map(toPlayableTrack);
    playTrack(playable, allPlayable);
  };

  const handlePlayAll = () => {
    if (!playlist || !playlist.tracks.length) return;
    const allPlayable = playlist.tracks.map(toPlayableTrack);
    playTrack(allPlayable[0], allPlayable);
  };

  const isOwner = isAuthenticated && user?.pub === playlist?.ownerPub;

  if (loading)
    return (
      <div className="text-center opacity-50 py-12">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  if (!playlist) return null;

  return (
    <div className="space-y-8 animate-fade-in p-6">
      {/* Back button */}
      <button
        onClick={() => navigate("/my-playlists")}
        className="btn btn-ghost btn-sm gap-2 -ml-2 opacity-60 hover:opacity-100"
      >
        <ArrowLeft size={16} /> My Playlists
      </button>

      {/* Hero */}
      <div className="flex flex-col md:flex-row gap-8 items-end">
        <div className="w-52 h-52 bg-gradient-to-br from-pink-500/30 to-purple-500/30 rounded-2xl shadow-2xl flex items-center justify-center shrink-0">
          <Heart size={64} className="text-pink-300/50" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="uppercase text-xs font-bold tracking-widest opacity-70 mb-2 flex items-center gap-2">
            <Heart size={12} className="text-pink-400" /> Personal Playlist
          </div>
          <h1 className="text-4xl lg:text-6xl font-black tracking-tighter mb-4 leading-tight">
            {playlist.name}
          </h1>
          {playlist.description && (
            <p className="opacity-70 text-lg mb-4 line-clamp-3">
              {playlist.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <div className="opacity-70">{playlist.trackCount} tracks</div>
            <span className="opacity-50">•</span>
            <div className="opacity-50">
              Created {new Date(playlist.createdAt).toLocaleDateString()}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {isOwner && (
              <>
                <button
                  className="btn btn-sm btn-primary gap-2"
                  onClick={() =>
                    document.dispatchEvent(
                      new CustomEvent("open-add-track-to-user-playlist-modal"),
                    )
                  }
                >
                  <Plus size={16} /> Add Tracks
                </button>
                <button
                  className="btn btn-error btn-sm btn-outline gap-2"
                  onClick={handleDelete}
                >
                  <Trash2 size={16} /> Delete Playlist
                </button>
              </>
            )}
            <button
              className="btn btn-sm btn-outline gap-2"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                // Optional: show a quick toast/alert
              }}
            >
              Copy Link
            </button>
          </div>
        </div>

        <button
          className="btn btn-primary btn-circle btn-lg shadow-xl hover:scale-105 transition-transform"
          onClick={handlePlayAll}
          disabled={!playlist.tracks || playlist.tracks.length === 0}
        >
          <Play size={32} className="ml-1" />
        </button>
      </div>

      {/* Track list */}
      <div className="overflow-x-auto bg-base-200/30 rounded-xl border border-white/5">
        <table className="table w-full">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase opacity-50">
              <th className="w-12 text-center">#</th>
              <th>Title</th>
              <th>Source</th>
              <th className="text-right">
                <Clock size={16} />
              </th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {playlist.tracks &&
              playlist.tracks.map((track, i) => (
                <tr
                  key={`${track.id}-${i}`}
                  className="hover:bg-white/5 group border-b border-white/5 last:border-0"
                >
                  <td className="text-center opacity-50 font-mono w-12 group-hover:text-primary">
                    <span className="group-hover:hidden">{i + 1}</span>
                    <button
                      onClick={() => handlePlayTrack(track)}
                      className="hidden group-hover:flex items-center justify-center w-full"
                    >
                      <Play size={12} fill="currentColor" />
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="avatar rounded w-8 h-8 opacity-80 bg-base-300 flex items-center justify-center overflow-hidden">
                        {track.coverUrl ? (
                          <img
                            src={track.coverUrl}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : track.source === "youtube" ? (
                          <Youtube size={14} className="text-red-400" />
                        ) : (
                          <Music size={14} className="opacity-40" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold flex items-center gap-2">
                          {track.title}
                          {track.source === "youtube" && track.url && (
                            <a
                              href={track.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="opacity-40 hover:opacity-100 hover:text-red-400 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                              title="Open on YouTube"
                            >
                              <Youtube size={12} />
                            </a>
                          )}
                        </div>
                        <div className="text-xs opacity-50">
                          {track.artistName}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div
                      className={`badge badge-sm gap-1 ${track.source === "youtube" ? "badge-error badge-outline" : "badge-primary badge-outline"}`}
                    >
                      {track.source === "youtube" ? (
                        <Youtube size={10} />
                      ) : (
                        <Music size={10} />
                      )}
                      {track.source === "youtube" ? "YouTube" : "TuneCamp"}
                    </div>
                  </td>
                  <td className="text-right opacity-50 font-mono text-xs">
                    {track.duration
                      ? new Date(track.duration * 1000)
                          .toISOString()
                          .substr(14, 5)
                      : "-"}
                  </td>
                  <td className="w-12 text-right">
                    {isOwner && (
                      <div className="dropdown dropdown-end dropdown-hover opacity-0 group-hover:opacity-100">
                        <label
                          tabIndex={0}
                          className="btn btn-ghost btn-xs btn-circle"
                        >
                          <MoreHorizontal size={16} />
                        </label>
                        <ul
                          tabIndex={0}
                          className="dropdown-content z-[1] menu p-2 shadow bg-base-300 rounded-box w-52 text-sm border border-white/10"
                        >
                          <li>
                            <button
                              className="text-error"
                              onClick={() => handleRemoveTrack(track.id)}
                            >
                              <Trash2 size={16} /> Remove
                            </button>
                          </li>
                        </ul>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            {(!playlist.tracks || playlist.tracks.length === 0) && (
              <tr>
                <td colSpan={5} className="text-center py-12 opacity-50">
                  <Music size={32} className="mx-auto mb-3 opacity-40" />
                  <p>No tracks in this playlist yet.</p>
                  <button
                    className="btn btn-primary btn-sm gap-2 mt-4"
                    onClick={() =>
                      document.dispatchEvent(
                        new CustomEvent(
                          "open-add-track-to-user-playlist-modal",
                        ),
                      )
                    }
                  >
                    <Plus size={14} /> Add your first track
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Track Modal */}
      {id && (
        <AddTrackToUserPlaylistModal
          playlistId={id}
          onAdded={() => id && loadPlaylist(id)}
        />
      )}
    </div>
  );
};

export default MyPlaylistDetails;
