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
  Globe,
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
    "settings" | "favorites" | "collection" | "artist"
  >("settings");
  const [artistData, setArtistData] = useState<any>(null);
  const [artistLoading, setArtistLoading] = useState(false);
  const [alias, setAlias] = useState(user?.gunProfile?.alias || "");
  const [avatar, setAvatar] = useState<string | null>(user?.gunProfile?.profile?.avatar || null);
  const [isSaving, setIsSaving] = useState(false);
  const [likedTracks, setLikedTracks] = useState<any[]>([]);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(true);

  useEffect(() => {
    if (user) {
      setAlias(user.gunProfile?.alias || "");
      setAvatar(user.gunProfile?.profile?.avatar || null);
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

      // Load artist data if user is linked to an artist
      if (user?.artistId) {
        setArtistLoading(true);
        API.getArtist(user.artistId)
          .then(setArtistData)
          .catch(console.error)
          .finally(() => setArtistLoading(false));
      }
    }
  }, [isAuthenticated, user?.artistId]);

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
                alt={user?.gunProfile?.alias}
                className="w-full h-full object-cover"
              />
            ) : (
              user?.gunProfile?.alias?.charAt(0).toUpperCase()
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
            {user?.gunProfile?.alias || user?.username}
            <span className="text-lg font-normal opacity-40 ml-3">
              @{user?.gunProfile?.pub?.substring(0, 8)}
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
        {user?.artistId && (
          <button
            className={clsx(
              "tab tab-lg px-8 gap-2",
              activeTab === "artist" && "tab-active",
            )}
            onClick={() => setActiveTab("artist")}
          >
            <User size={18} className="text-secondary" /> Artist Profile
          </button>
        )}
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
                    disabled={alias === user?.gunProfile?.alias || isSaving}
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
              
              <div className="form-control w-full">
                  <label className="label">
                      <span className="label-text opacity-60">Backup Account Pair (GunDB)</span>
                  </label>
                  <p className="text-xs opacity-50 mb-2">
                       This JSON contains your decentralized cryptographic keys. Save it somewhere safe. 
                       You can use it to log into TuneCamp from another device if you forget your password.
                  </p>
                  
                  {/* Since Gun.user()._.sea might not be typed easily, we access it dynamically */}
                  { GunAuth.user?.is && (GunAuth.user as any)._?.sea ? (
                      <div className="flex flex-col gap-2">
                          <textarea 
                              readOnly 
                              className="textarea textarea-bordered font-mono text-xs h-24 w-full bg-base-200"
                              value={JSON.stringify((GunAuth.user as any)._?.sea, null, 2)}
                          />
                          <button 
                              className="btn btn-sm btn-outline btn-secondary self-start gap-2"
                              onClick={() => {
                                  navigator.clipboard.writeText(JSON.stringify((GunAuth.user as any)._?.sea));
                                  alert('Pair copied to clipboard!');
                              }}
                          >
                              Copy Backup Pair
                          </button>
                      </div>
                  ) : (
                      <div className="text-sm opacity-50 italic">
                          Pair not available for this session. Log in again with password to reveal.
                      </div>
                  )}
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

        {activeTab === "artist" && user?.artistId && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                {artistLoading ? (
                    <div className="p-12 text-center opacity-50">Loading artist profile...</div>
                ) : (
                    <ArtistProfileEditor initialData={artistData} onSaved={(data) => setArtistData(data)} />
                )}
            </div>
        )}
      </div>
    </div>
  );
};

const ArtistProfileEditor = ({ initialData, onSaved }: { initialData: any, onSaved: (data: any) => void }) => {
    const [name, setName] = useState(initialData?.name || '');
    // const [slug, setSlug] = useState(initialData?.slug || '');
    const [bio, setBio] = useState(initialData?.bio || '');
    const [donationUrl, setDonationUrl] = useState('');
    const [socialLinks, setSocialLinks] = useState<{ platform: string, url: string }[]>([]);
    const [walletAddress, setWalletAddress] = useState(initialData?.walletAddress || '');
    const [mastodonInstance, setMastodonInstance] = useState('');
    const [mastodonToken, setMastodonToken] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

    useEffect(() => {
        if (initialData) {
            setName(initialData.name || '');
            setBio(initialData.bio || '');
            setWalletAddress(initialData.walletAddress || '');
            
            // Parse links
            if (initialData.links) {
                const links = initialData.links;
                const donation = links.find((l: any) => l.type === 'support' || l.platform?.toLowerCase() === 'donation');
                setDonationUrl(donation ? donation.url : '');
                setSocialLinks(links.filter((l: any) => l.type !== 'support' && l.platform?.toLowerCase() !== 'donation'));
            }

            // Parse Mastodon config
            if (initialData.postParams) {
                setMastodonInstance(initialData.postParams.instance || '');
                setMastodonToken(initialData.postParams.token || '');
            }
        }
    }, [initialData]);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAvatarFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setAvatarPreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setMessage('');

        try {
            const allLinks: any[] = [...socialLinks];
            if (donationUrl) {
                allLinks.unshift({ platform: 'Donation', url: donationUrl, type: 'support' });
            }

            const postParams = (mastodonInstance || mastodonToken) ? {
                instance: mastodonInstance,
                token: mastodonToken
            } : null;

            const updated = await API.updateArtist(initialData.id, {
                // name, // Usually name is fixed but biological part is bio
                bio,
                links: allLinks,
                walletAddress: walletAddress || undefined,
                postParams
            });

            if (avatarFile) {
                await API.uploadArtistAvatar(initialData.id, avatarFile);
            }

            setMessage('Artist profile updated successfully!');
            onSaved({ ...initialData, ...updated });
            setAvatarFile(null);
            setAvatarPreview(null);
        } catch (err: any) {
            console.error('Failed to update artist profile:', err);
            setMessage(`Update failed: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="space-y-6">
                <div className="card bg-base-100/50 border border-white/5 p-6 space-y-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <User size={20} className="text-primary" /> Basic Information
                    </h3>

                    <div className="form-control">
                        <label className="label"><span className="label-text opacity-60">Artist Name</span></label>
                        <input type="text" className="input input-bordered opacity-50" value={name} readOnly />
                        <label className="label"><span className="label-text-alt opacity-40">Name changes must be requested to admins.</span></label>
                    </div>

                    <div className="form-control">
                        <label className="label"><span className="label-text opacity-60">Bio / Description</span></label>
                        <textarea 
                            className="textarea textarea-bordered h-32" 
                            value={bio} 
                            onChange={e => setBio(e.target.value)}
                            placeholder="Tell your story..."
                        />
                    </div>
                    
                    <div className="form-control">
                        <label className="label"><span className="label-text font-bold text-accent">Payment Wallet Address</span></label>
                        <input 
                            type="text" 
                            className="input input-bordered border-accent/20 font-mono text-sm" 
                            value={walletAddress} 
                            onChange={e => setWalletAddress(e.target.value)}
                            placeholder="0x..."
                        />
                        <label className="label"><span className="label-text-alt opacity-50">Direct payments for your releases will go here.</span></label>
                    </div>
                </div>

                <div className="card bg-base-100/50 border border-white/5 p-6 space-y-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <Camera size={20} className="text-secondary" /> Artist Avatar
                    </h3>
                    <div className="flex items-center gap-6">
                        <div className="w-24 h-24 rounded-2xl overflow-hidden bg-neutral border border-white/10 ring-4 ring-secondary/5">
                            {avatarPreview ? (
                                <img src={avatarPreview} className="w-full h-full object-cover" />
                            ) : initialData?.id ? (
                                <img src={API.getArtistCoverUrl(initialData.id, Date.now())} className="w-full h-full object-cover" />
                            ) : null}
                        </div>
                        <label className="btn btn-outline btn-sm gap-2">
                            <Camera size={16} /> Upload New
                            <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                        </label>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="card bg-base-100/50 border border-white/5 p-6 space-y-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <Globe size={20} className="text-success" /> Links & Socials
                    </h3>

                    <div className="form-control">
                        <label className="label"><span className="label-text font-bold text-success">Donation / Support URL</span></label>
                        <input 
                            type="url" 
                            className="input input-bordered border-success/20" 
                            value={donationUrl} 
                            onChange={e => setDonationUrl(e.target.value)}
                            placeholder="https://ko-fi.com/..."
                        />
                    </div>

                    <div className="form-control">
                        <label className="label"><span className="label-text">Social Links (comma separated)</span></label>
                        <input 
                            type="text" 
                            className="input input-bordered" 
                            value={socialLinks.map(l => l.url).join(', ')} 
                            onChange={e => {
                                const urls = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                setSocialLinks(urls.map(url => {
                                    let platform = 'Social';
                                    if (url.includes('twitter')) platform = 'Twitter';
                                    if (url.includes('x.com')) platform = 'X';
                                    if (url.includes('instagram')) platform = 'Instagram';
                                    if (url.includes('facebook')) platform = 'Facebook';
                                    if (url.includes('youtube')) platform = 'YouTube';
                                    return { platform, url };
                                }));
                            }}
                            placeholder="twitter.com/..., instagram.com/..."
                        />
                    </div>
                </div>

                <div className="card bg-base-100/50 border border-white/5 p-6 space-y-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <Settings size={20} className="text-info" /> Mastodon Auto-Post
                    </h3>
                    <p className="text-xs opacity-50">Cross-post your releases to an external Mastodon account.</p>
                    
                    <div className="form-control">
                        <label className="label"><span className="label-text text-xs">Instance URL</span></label>
                        <input 
                            type="url" 
                            className="input input-sm input-bordered" 
                            value={mastodonInstance} 
                            onChange={e => setMastodonInstance(e.target.value)}
                            placeholder="https://mastodon.social"
                        />
                    </div>
                    
                    <div className="form-control">
                        <label className="label"><span className="label-text text-xs">Access Token</span></label>
                        <input 
                            type="password" 
                            className="input input-sm input-bordered" 
                            value={mastodonToken} 
                            onChange={e => setMastodonToken(e.target.value)}
                            placeholder="Bearer Token"
                        />
                    </div>
                </div>

                <div className="pt-4 space-y-4">
                    {message && (
                        <div className={clsx("alert text-sm", message.includes('failed') ? "alert-error bg-error/10 border-error/20" : "alert-success bg-success/10 border-success/20")}>
                            {message}
                        </div>
                    )}
                    <button type="submit" className="btn btn-primary btn-block gap-2" disabled={isSaving}>
                        {isSaving ? <span className="loading loading-spinner" /> : <Check size={20} />}
                        Save Artist Profile
                    </button>
                </div>
            </div>
        </form>
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
    <div className="overflow-x-auto bg-base-200/30 rounded-2xl border border-white/5 min-h-[300px]">
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
