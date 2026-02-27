import { useState, useEffect } from "react";
import { useAuthStore } from "../stores/useAuthStore";
import { Link } from "react-router-dom";
import { ListMusic, Plus, Heart, Music } from "lucide-react";
import type { UserPlaylist } from "../types";
import { GunPlaylists } from "../services/gun";
import { CreateUserPlaylistModal } from "../components/modals/CreateUserPlaylistModal";

export const MyPlaylists = () => {
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) loadPlaylists();
    else setLoading(false);
  }, [isAuthenticated]);

  const loadPlaylists = async () => {
    setLoading(true);
    try {
      const data = await GunPlaylists.getMyPlaylists();
      setPlaylists(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in p-6">
        <div className="p-6 rounded-3xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 mb-6">
          <Heart size={64} className="text-pink-400" />
        </div>
        <h1 className="text-3xl font-black mb-3">My Playlists</h1>
        <p className="opacity-60 text-lg mb-6 text-center max-w-md">
          Login with your community account to create and manage personal
          playlists.
        </p>
        <button
          className="btn btn-primary gap-2"
          onClick={() =>
            document.dispatchEvent(new CustomEvent("open-auth-modal"))
          }
        >
          Login to Get Started
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20">
            <Heart size={32} className="text-pink-400" />
          </div>
          <div>
            <h1 className="text-4xl font-bold">My Playlists</h1>
            <p className="opacity-50 text-sm mt-1">
              {user?.alias}'s personal collection
            </p>
          </div>
        </div>

        <button
          className="btn btn-primary gap-2"
          onClick={() =>
            document.dispatchEvent(
              new CustomEvent("open-create-user-playlist-modal"),
            )
          }
        >
          <Plus size={20} /> New Playlist
        </button>
      </div>

      {loading ? (
        <div className="text-center opacity-50 py-12">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="mt-4">Loading playlists from GunDB...</p>
        </div>
      ) : playlists.length === 0 ? (
        <div className="text-center opacity-50 py-16 border-2 border-dashed border-white/5 rounded-2xl">
          <ListMusic size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-bold">No playlists yet</p>
          <p className="text-sm mt-2 opacity-70">
            Create your first playlist to start collecting your favorite tracks!
          </p>
          <button
            className="btn btn-primary btn-sm gap-2 mt-6"
            onClick={() =>
              document.dispatchEvent(
                new CustomEvent("open-create-user-playlist-modal"),
              )
            }
          >
            <Plus size={16} /> Create Playlist
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {playlists.map((p) => (
            <Link
              to={`/my-playlists/${p.id}`}
              key={p.id}
              className="card bg-base-200 border border-white/5 hover:bg-base-300 transition-all hover:-translate-y-1 group"
            >
              <div className="card-body">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500/30 to-purple-500/30 flex items-center justify-center">
                    <Music size={20} className="text-pink-300" />
                  </div>
                  <h2 className="card-title text-lg group-hover:text-primary transition-colors flex-1 truncate">
                    {p.name}
                  </h2>
                </div>
                {p.description && (
                  <p className="opacity-70 line-clamp-2 text-sm">
                    {p.description}
                  </p>
                )}

                <div className="card-actions justify-between mt-4 items-center">
                  <span className="text-xs opacity-50">
                    {p.trackCount} tracks
                  </span>
                  <span className="text-xs opacity-40">
                    {p.updatedAt
                      ? new Date(p.updatedAt).toLocaleDateString()
                      : ""}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateUserPlaylistModal onCreated={loadPlaylists} />
    </div>
  );
};

export default MyPlaylists;
