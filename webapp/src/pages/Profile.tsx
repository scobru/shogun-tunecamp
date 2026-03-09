import { useState, useEffect, useMemo } from "react";
import { useAuthStore } from "../stores/useAuthStore";
import { useWalletStore } from "../stores/useWalletStore";
import { usePurchases } from "../hooks/usePurchases";
import { GunAuth, GunSocial } from "../services/gun";
import {
  User,
  Settings,
  Heart,
  Download,
  Camera,
  Check,
  Play,
  Clock,
} from "lucide-react";
import { usePlayerStore } from "../stores/usePlayerStore";
import API from "../services/api";
import type { Track } from "../types";
import clsx from "clsx";

export const Profile = () => {
  const { user, isAuthenticated, isInitializing } = useAuthStore();
  const { address } = useWalletStore();
  const { loading: purchasesLoading, isPurchased } = usePurchases();
  const { playTrack } = usePlayerStore();

  const [activeTab, setActiveTab] = useState<
    "settings" | "favorites" | "collection"
  >("settings");
  const [alias, setAlias] = useState(user?.alias || "");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [likedTracks, setLikedTracks] = useState<any[]>([]);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(true);

  useEffect(() => {
    if (user) {
      setAlias(user.alias);
      setAvatar(user.profile?.avatar || null);
    }
  }, [user]);

  useEffect(() => {
    if (isAuthenticated) {
      setLoadingTracks(true);

      // Load liked tracks from GunDB
      GunSocial.getLikedTracks().then(setLikedTracks);

      // Load all tracks from API to match likes/purchases with full metadata
      API.getTracks()
        .then(setAllTracks)
        .finally(() => setLoadingTracks(false));
    }
  }, [isAuthenticated]);

  const purchasedTracks = useMemo(() => {
    return allTracks.filter((t) => isPurchased(t.id));
  }, [allTracks, isPurchased]);

  const favorites = useMemo(() => {
    const likedIds = new Set(likedTracks.map((t) => t.id));
    return allTracks.filter((t) => likedIds.has(t.id));
  }, [allTracks, likedTracks]);

  const handleUpdateAlias = async () => {
    if (!alias.trim()) return;
    setIsSaving(true);
    try {
      await GunAuth.updateAlias(alias);
      // Force local store update or reload if necessary
      window.location.reload();
    } catch (err) {
      console.error("Failed to update alias:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setAvatar(base64);
      setIsSaving(true);
      try {
        await GunAuth.updateProfile({ avatar: base64 });
      } catch (err) {
        console.error("Failed to update avatar:", err);
      } finally {
        setIsSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (isInitializing) {
    return (
      <div className="p-12 text-center opacity-50">Loading profile...</div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="p-12 text-center opacity-70 animate-fade-in">
        <User size={48} className="mx-auto mb-4 text-primary opacity-50" />
        <h2 className="text-xl font-bold mb-2">Login Required</h2>
        <p className="mb-4">Please login to view and manage your profile.</p>
        <button
          className="btn btn-primary gap-2"
          onClick={() =>
            document.dispatchEvent(new CustomEvent("open-auth-modal"))
          }
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20 p-6 md:p-0">
      {/* Profile Header */}
      <div className="flex flex-col md:flex-row items-center gap-8 border-b border-white/5 pb-10">
        <div className="relative group">
          <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-primary/20 bg-neutral flex items-center justify-center text-4xl font-black">
            {avatar ? (
              <img
                src={avatar}
                alt={user?.alias}
                className="w-full h-full object-cover"
              />
            ) : (
              user?.alias?.charAt(0).toUpperCase()
            )}
          </div>
          <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-full">
            <Camera size={24} className="text-white" />
            <input
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleAvatarChange}
            />
          </label>
        </div>

        <div className="text-center md:text-left flex-1">
          <h1 className="text-4xl font-black tracking-tight mb-2">
            {user?.alias}
            <span className="text-lg font-normal opacity-40 ml-3">
              @{user?.pub?.substring(0, 8)}
            </span>
          </h1>
          <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-4">
            <div className="badge badge-outline gap-2 py-3 px-4">
              <Heart size={14} className="text-primary" />
              {likedTracks.length} Likes
            </div>
            <div className="badge badge-outline gap-2 py-3 px-4">
              <Download size={14} className="text-secondary" />
              {purchasedTracks.length} Purchases
            </div>
            <div className="badge badge-outline gap-2 py-3 px-4 opacity-70">
              <Settings size={14} />
              Wallet: {address?.substring(0, 6)}...
              {address?.substring(address.length - 4)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs tabs-boxed bg-base-300/50 p-1 rounded-2xl w-fit mx-auto md:mx-0">
        <button
          className={clsx(
            "tab tab-lg px-8 gap-2",
            activeTab === "settings" && "tab-active",
          )}
          onClick={() => setActiveTab("settings")}
        >
          <Settings size={18} /> Settings
        </button>
        <button
          className={clsx(
            "tab tab-lg px-8 gap-2",
            activeTab === "favorites" && "tab-active",
          )}
          onClick={() => setActiveTab("favorites")}
        >
          <Heart size={18} /> Favorites
        </button>
        <button
          className={clsx(
            "tab tab-lg px-8 gap-2",
            activeTab === "collection" && "tab-active",
          )}
          onClick={() => setActiveTab("collection")}
        >
          <Download size={18} /> Collection
        </button>
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {activeTab === "settings" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="card bg-base-100/50 border border-white/5 p-6 space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <User size={20} className="text-primary" /> Account Settings
              </h3>

              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text opacity-60">
                    Display Name / Alias
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter alias"
                    className="input input-bordered flex-1"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                  />
                  <button
                    className={clsx(
                      "btn btn-primary btn-square",
                      isSaving && "loading",
                    )}
                    onClick={handleUpdateAlias}
                    disabled={alias === user?.alias || isSaving}
                  >
                    {!isSaving && <Check size={20} />}
                  </button>
                </div>
                <label className="label">
                  <span className="label-text-alt opacity-40 italic">
                    This name is used across TuneCamp and GunDB.
                  </span>
                </label>
              </div>

              <div className="divider opacity-10"></div>

              <div className="alert alert-info bg-primary/10 border-primary/20 text-sm">
                <Settings size={18} />
                <span>
                  Your account is decentralized. Updates are stored in GunDB and
                  synced across peers.
                </span>
              </div>
            </div>

            <div className="card bg-base-100/50 border border-white/5 p-6 space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Camera size={20} className="text-secondary" /> Profile Visuals
              </h3>
              <p className="text-sm opacity-60">
                Your profile picture is stored locally on your device and shared
                via GunDB. Larger images may take longer to sync.
              </p>

              <div className="flex flex-col items-center gap-4 py-4">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-neutral ring-4 ring-secondary/20">
                  {avatar ? (
                    <img src={avatar} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl font-bold opacity-30">
                      TC
                    </div>
                  )}
                </div>
                <label className="btn btn-outline btn-sm gap-2">
                  <Camera size={16} /> Change Avatar
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleAvatarChange}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === "favorites" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            {loadingTracks ? (
              <div className="p-12 text-center opacity-50">
                Loading favorites...
              </div>
            ) : favorites.length === 0 ? (
              <div className="p-20 text-center opacity-40 bg-base-200/20 rounded-3xl border border-dashed border-white/10">
                <Heart size={48} className="mx-auto mb-4" />
                <p>You haven't liked any tracks yet.</p>
              </div>
            ) : (
              <TrackList
                tracks={favorites}
                onPlay={(t) => playTrack(t, favorites)}
              />
            )}
          </div>
        )}

        {activeTab === "collection" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            {purchasesLoading || loadingTracks ? (
              <div className="p-12 text-center opacity-50">
                Loading collection...
              </div>
            ) : purchasedTracks.length === 0 ? (
              <div className="p-20 text-center opacity-40 bg-base-200/20 rounded-3xl border border-dashed border-white/10">
                <Download size={48} className="mx-auto mb-4" />
                <p>Your collection is empty.</p>
              </div>
            ) : (
              <TrackList
                tracks={purchasedTracks}
                onPlay={(t) => playTrack(t, purchasedTracks)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const TrackList = ({
  tracks,
  onPlay,
}: {
  tracks: Track[];
  onPlay: (t: Track) => void;
}) => {
  return (
    <div className="overflow-x-auto bg-base-200/30 rounded-2xl border border-white/5">
      <table className="table w-full">
        <thead>
          <tr className="border-b border-white/10 opacity-50 text-xs uppercase tracking-wider">
            <th className="w-12 text-center">#</th>
            <th>Title</th>
            <th>Album</th>
            <th className="text-right">
              <Clock size={16} />
            </th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track, i) => (
            <tr
              key={track.id}
              className="hover:bg-white/5 group border-b border-white/5 last:border-0 transition-colors"
            >
              <td className="text-center font-mono w-12 relative">
                <span className="opacity-40 group-hover:opacity-0 transition-opacity absolute inset-0 flex items-center justify-center">
                  {i + 1}
                </span>
                <button
                  onClick={() => onPlay(track)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 flex items-center justify-center text-primary"
                >
                  <Play size={14} fill="currentColor" />
                </button>
              </td>
              <td>
                <div className="font-bold">{track.title}</div>
                <div className="text-xs opacity-40">{track.artistName}</div>
              </td>
              <td className="opacity-60 text-sm">{track.albumName}</td>
              <td className="text-right opacity-40 font-mono text-xs">
                {new Date(track.duration * 1000).toISOString().substr(14, 5)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
