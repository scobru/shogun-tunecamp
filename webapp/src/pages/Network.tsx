import { useState, useEffect, useCallback, memo } from "react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { Globe, Server, Music, ExternalLink, Play } from "lucide-react";
import { usePlayerStore } from "../stores/usePlayerStore";
import { StringUtils } from "../utils/stringUtils";
import type { NetworkSite, NetworkTrack, NetworkStatus } from "../types";

const getHostname = (url: string) => {
  try {
    if (!url) return "Unknown";
    if (url.startsWith("https://")) {
      const u = new URL(url);
      return u.hostname;
    }
    // Handle AP Actor URIs or IDs
    if (url.includes("/users/")) {
      const u = new URL(url);
      return u.hostname;
    }
    return url || "Unknown";
  } catch {
    return url || "Unknown";
  }
};

/**
 * Resolves a URL that might be relative to a remote site's base URL.
 * If the URL starts with "http", it is returned as-is.
 * If the URL starts with "/", it is prepended with the baseUrl.
 * Otherwise, it is returned as-is.
 */
const resolveUrl = (url?: string, baseUrl?: string) => {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/") && baseUrl) {
    const cleanBase = baseUrl.replace(/\/$/, "");
    return `${cleanBase}${url}`;
  }
  return url;
};

const SiteCard = memo(({ site }: { site: any }) => {
  const isLocal = site.federation === "local";
  const coverUrl = resolveUrl(site.coverImage, site.url);
  
  return (
    <a
      href={site.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`card bg-base-200 border ${isLocal ? 'border-primary/50' : 'border-white/5'} hover:border-primary/30 transition-all hover:scale-[1.01] group`}
    >
      <figure className="h-32 bg-base-300 relative overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            alt={site.name}
          />

        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-20 bg-gradient-to-br from-blue-500/10 to-purple-500/10">
            <span>{isLocal ? "🏠" : "🏢"}</span>
          </div>
        )}
        <div className="absolute bottom-2 right-2 badge badge-neutral badge-sm bg-black/50 border-none backdrop-blur-md">
          {isLocal ? "LOCAL" : getHostname(site.url)}
        </div>
        {isLocal && (
          <div className="absolute top-2 left-2 badge badge-primary badge-xs">
            YOU
          </div>
        )}
      </figure>
      <div className="card-body p-4">
        <h3 className="font-bold text-lg group-hover:text-primary transition-colors flex items-center gap-2">
          {site.name}
          <ExternalLink size={12} className="opacity-50" />
        </h3>
        <p className="text-sm opacity-60 line-clamp-2">
          {site.description || "No description provided."}
        </p>

        <div className="flex items-center justify-between text-xs font-mono opacity-50 border-t border-white/5 pt-4 mt-2">
          <span>{site.version}</span>
          <span>
            {site.lastSeen ? StringUtils.formatTimeAgo(new Date(site.lastSeen).getTime()) : "Never"}
          </span>
        </div>
      </div>
    </a>
  );
});

const PostCard = memo(({ 
  item, 
  onToggleVisibility, 
  isHidden, 
  isAdmin 
}: { 
  item: NetworkTrack; 
  onToggleVisibility: (id: string) => void;
  isHidden: boolean;
  isAdmin: boolean;
}) => {
  const uniqueId = item.slug || "";
    const baseUrl = item.siteUrl ? item.siteUrl.replace(/\/$/, "") : "";
    const coverUrl = resolveUrl(item.coverUrl, baseUrl);

    return (
      <div
        className={`card border hover:bg-base-200 transition-all group shadow-sm hover:shadow-md ${isHidden ? "bg-error/10 border-error/20 opacity-70" : "bg-base-200/50 border-white/5"}`}
      >
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary overflow-hidden">
                {coverUrl ? (
                  <img src={coverUrl} className="w-full h-full object-cover" alt={item.artistName} />
                ) : (
                  <span>{item.artistName?.charAt(0)}</span>
                )}
              </div>

            <div className="flex flex-col">
              <span className="text-sm font-bold">{item.artistName}</span>
              <span className="text-[10px] opacity-50">
                {item.published_at ? StringUtils.formatTimeAgo(new Date(item.published_at).getTime()) : ""}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
             <span className={`badge badge-xs ${item.federation === 'local' ? 'badge-primary' : 'badge-ghost opacity-50'}`}>
                {item.federation?.toUpperCase()}
             </span>
             {isAdmin && (
              <button
                className={`btn btn-xs btn-ghost btn-circle ${isHidden ? "text-primary" : "text-error opacity-0 group-hover:opacity-100"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(uniqueId);
                }}
              >
                {isHidden ? "👁️" : "🗑️"}
              </button>
            )}
          </div>
        </div>

        <div className="text-sm opacity-80 line-clamp-4 prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: item.content || "" }}>
        </div>

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/5">
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] opacity-40 hover:text-primary transition-colors flex items-center gap-1"
          >
            <Globe size={10} />
            {getHostname(siteUrl)}
          </a>
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-xs btn-primary btn-outline gap-1"
          >
            View Post
            <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </div>
  );
});

const TrackCard = memo(({ 
    item, 
    onPlay, 
    onToggleVisibility, 
    isHidden, 
    isAdmin 
}: { 
    item: NetworkTrack; 
    onPlay: (item: NetworkTrack) => void;
    onToggleVisibility: (id: string) => void;
    isHidden: boolean;
    isAdmin: boolean;
}) => {
  const isAP = item.federation === "activitypub" || item.federation === "local";
  
  if (isAP) {
    const uniqueId = item.slug || "";
    const baseUrl = item.siteUrl ? item.siteUrl.replace(/\/$/, "") : "";
    const coverUrl = resolveUrl(item.coverUrl, baseUrl);
    const siteUrl = item.siteUrl;

    return (
      <div
        className={`card border hover:bg-base-200 transition-all cursor-pointer group shadow-sm hover:shadow-md ${isHidden ? "bg-error/10 border-error/20 opacity-70" : "bg-base-200/50 border-white/5"}`}
        onClick={() => onPlay(item)}
      >
        <div className="p-3 flex items-center gap-4">
          <div className="relative w-12 h-12 rounded-lg bg-base-300 flex-shrink-0 overflow-hidden">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xl opacity-30">
                🎵
              </div>
            )}

            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Play size={20} className="text-white fill-current" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate pr-2 flex items-center gap-2">
              {item.title}
              {isHidden && (
                <span className="badge badge-error badge-xs">
                  Hidden
                </span>
              )}
              {item.federation === 'local' && (
                <span className="badge badge-primary badge-xs">Local</span>
              )}
            </div>
            <div className="text-xs opacity-60 truncate flex items-center gap-1">
              <span>{item.artistName}</span>
              <span className="opacity-40">•</span>
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="hover:text-primary hover:underline"
              >
                {getHostname(siteUrl)}
              </a>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="text-xs font-mono opacity-40">
              {item.duration
                ? new Date(item.duration * 1000)
                    .toISOString()
                    .substr(14, 5)
                : "--:--"}
            </div>
            {isAdmin && (
              <button
                className={`btn btn-xs btn-ghost btn-circle ${isHidden ? "text-primary" : "text-error opacity-0 group-hover:opacity-100"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(uniqueId);
                }}
                title={isHidden ? "Unhide Track" : "Hide Track"}
              >
                {isHidden ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                    <path d="m2 2 20 20" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // GunDB Track
  const track = item.track;
  if (!track) return null;

  const uniqueId = item.siteUrl + "::" + track.id;

  const baseUrl = item.siteUrl ? item.siteUrl.replace(/\/$/, "") : "";
  let coverUrl = resolveUrl(track.coverImage, baseUrl) ||
    (track.albumId && baseUrl
      ? `${baseUrl}/api/albums/${encodeURIComponent(track.albumId)}/cover`
      : undefined);

  if (
    coverUrl &&
    !coverUrl.startsWith("http") &&
    !coverUrl.startsWith("/")
  ) {

    coverUrl = undefined;
  }

  const siteUrl = item.siteUrl;

  return (
    <div
      className={`card border hover:bg-base-200 transition-all cursor-pointer group shadow-sm hover:shadow-md ${isHidden ? "bg-error/10 border-error/20 opacity-70" : "bg-base-200/50 border-white/5"}`}
      onClick={() => onPlay(item)}
    >
      <div className="p-3 flex items-center gap-4">
        <div className="relative w-12 h-12 rounded-lg bg-base-300 flex-shrink-0 overflow-hidden">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={track.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl opacity-30">
              🎵
            </div>
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Play size={20} className="text-white fill-current" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate pr-2 flex items-center gap-2">
            {track.title}
            {isHidden && (
              <span className="badge badge-error badge-xs">
                Hidden
              </span>
            )}
          </div>
          <div className="text-xs opacity-60 truncate flex items-center gap-1">
            <span>{track.artistName}</span>
            <span className="opacity-40">•</span>
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hover:text-primary hover:underline"
            >
              {getHostname(siteUrl)}
            </a>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="text-xs font-mono opacity-40">
            {track.duration
              ? new Date(track.duration * 1000)
                  .toISOString()
                  .substr(14, 5)
              : "--:--"}
          </div>
          {isAdmin && (
            <button
              className={`btn btn-xs btn-ghost btn-circle ${isHidden ? "text-primary" : "text-error opacity-0 group-hover:opacity-100"}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(uniqueId);
              }}
              title={isHidden ? "Unhide Track" : "Hide Track"}
            >
              {isHidden ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                  <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                  <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                  <path d="m2 2 20 20" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export const Network = () => {
  const [sites, setSites] = useState<NetworkSite[]>([]);
  const [tracks, setTracks] = useState<NetworkTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const { playTrack, currentTrack } = usePlayerStore();
  const { isAdminAuthenticated } = useAuthStore();
  const [hiddenTracks, setHiddenTracks] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [status, setStatus] = useState<NetworkStatus | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [sitesData, tracksData, statusData] = await Promise.all([
          API.getNetworkSites(),
          API.getNetworkTracks(),
          API.getNetworkStatus().catch(() => null),
        ]);
        setStatus(statusData);

        // Deduplicate Sites (GunDB)
        const uniqueSites = new Map();
        sitesData.forEach((s: any) => {
          if (!s.url || !s.url.startsWith("http")) return;
          const normalizedUrl = s.url.replace(/\/$/, "");
          if (!uniqueSites.has(normalizedUrl)) {
            uniqueSites.set(normalizedUrl, { ...s, url: normalizedUrl });
          }
        });
        const sites = Array.from(uniqueSites.values()) as NetworkSite[];

        // Process Tracks (GunDB + ActivityPub)
        const validTracks = tracksData.filter((t: any) => {
          if (t.federation === "activitypub") return !!t.audioUrl;
          if (!t.track) return false;
          const url = t.siteUrl;
          if (!url || url.trim() === "/" || url.trim() === "") return false;
          return true;
        }) as NetworkTrack[];

        const uniqueContent = new Map<string, NetworkTrack>();
        validTracks.forEach((t) => {
          const isAP = t.federation === "activitypub";
          const title = isAP ? t.title || "" : t.track.title;
          const artist = isAP
            ? t.artistName || ""
            : t.track.artistName || "unknown";
          const key = `${title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
          if (!uniqueContent.has(key)) {
            uniqueContent.set(key, t);
          }
        });

        const finalTracks = Array.from(uniqueContent.values());
        setSites(sites);
        setTracks(finalTracks);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();

    const stored = localStorage.getItem("tunecamp_blocked_tracks");
    if (stored) {
      try {
        setHiddenTracks(JSON.parse(stored));
      } catch {}
    }
  }, []);

  const toggleTrackVisibility = useCallback((id: string) => {
    setHiddenTracks(prev => {
        const newHidden = prev.includes(id)
            ? prev.filter((u) => u !== id)
            : [...prev, id];
        localStorage.setItem("tunecamp_blocked_tracks", JSON.stringify(newHidden));
        return newHidden;
    });
  }, []);

  const handlePlayNetworkTrack = useCallback((networkTrack: NetworkTrack) => {
    if (networkTrack.federation === "activitypub") {
      const track = {
        id: networkTrack.slug || "",
        title: networkTrack.title || "",
        artistName: networkTrack.artistName || "",
        albumTitle: networkTrack.releaseTitle || "",
        streamUrl: networkTrack.audioUrl || "",
        coverUrl: networkTrack.coverUrl || "",
        coverImage: networkTrack.coverUrl || "",
        duration: networkTrack.duration || 0,
        siteUrl: networkTrack.siteUrl || "",
        service: "activitypub",
      };
      // Prevent redundant play if same ID
      if (currentTrack?.id === track.id) return;
      playTrack(track as any, [track as any]);
      return;
    }

    if (!networkTrack.track || !networkTrack.siteUrl) return;

    if (currentTrack?.id === networkTrack.track.id) return;

    const baseUrl = networkTrack.siteUrl.replace(/\/$/, "");
    const trackData = networkTrack.track;

    const coverUrl =
      trackData.coverUrl ||
      trackData.coverImage ||
      (trackData.albumId
        ? `${baseUrl}/api/albums/${trackData.albumId}/cover`
        : undefined);

    const track = {
      ...trackData,
      streamUrl: API.getStreamUrl(trackData.streamUrl || trackData.id),
      coverUrl: coverUrl,
      coverImage: coverUrl,
    };

    playTrack(track as any, [track as any]);
  }, [currentTrack?.id, playTrack]);

  if (loading)
    return (
      <div className="p-12 text-center opacity-50 flex flex-col items-center gap-4">
        <Globe className="animate-pulse" size={48} />
        Scanning the universe...
      </div>
    );

  const filteredItems = tracks.filter((item: NetworkTrack) => {
    if (!item) return false;
    const uniqueId = item.slug || (item.siteUrl + "::" + item.track?.id);

    if (showHidden) return true;
    return !hiddenTracks.includes(uniqueId);
  });

  const gunDbTracks = filteredItems.filter(t => t.federation === "gundb" && (!t.type || t.type === 'release'));
  const apTracks = filteredItems.filter(t => (t.federation === "activitypub" || t.federation === "local") && (!t.type || t.type === 'release'));
  const allPosts = filteredItems.filter(t => t.type === 'post');

  const gunDbSites = sites.filter(s => s.federation === "gundb");
  const federatedSites = sites.filter(s => s.federation === "activitypub" || s.federation === "local");

  return (
    <div className="space-y-12 animate-fade-in pb-12">
      <header className="flex flex-col gap-4 border-b border-white/5 pb-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20">
              <Globe size={48} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight">
                Federated Network
              </h1>
              <p className="opacity-60 text-lg">
                Discover music across the P2P network and ActivityPub.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdminAuthenticated && (
              <button
                className="btn btn-primary btn-sm gap-2"
                onClick={async () => {
                  if (
                    confirm(
                      "Do you want to synchronize all content with ActivityPub? This will update metadata and ensure visibility settings are correct on remote instances.",
                    )
                  ) {
                    try {
                      const res = (await API.syncActivityPub()) as {
                        artists: number;
                        notes: number;
                      };
                      alert(
                        `Sync complete! Processed ${res.artists} artists and ${res.notes} items.`,
                      );
                    } catch (err: unknown) {
                      alert("Sync failed: " + (err instanceof Error ? err.message : String(err)));
                    }
                  }
                }}
              >
                <Server size={16} /> Sync with ActivityPub
              </button>
            )}
            {isAdminAuthenticated && (
              <div className="form-control ml-4">
                <label className="label cursor-pointer gap-2">
                  <span className="label-text text-xs uppercase font-bold opacity-50">
                    Show Hidden
                  </span>
                  <input
                    type="checkbox"
                    className="toggle toggle-xs toggle-neutral"
                    checked={showHidden}
                    onChange={(e) => setShowHidden(e.target.checked)}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="space-y-8">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <Server size={24} className="text-info" />
            <div>
              <h2 className="text-2xl font-bold">P2P Network (GunDB)</h2>
              <p className="text-sm opacity-50">Content shared directly between TuneCamp instances.</p>
            </div>
            <div
              className={`px-3 py-1 rounded-full border text-[10px] font-bold flex items-center gap-2 ml-4 ${status?.gundb?.connected ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${status?.gundb?.connected ? "bg-green-400 animate-pulse" : "bg-red-400"}`}
              ></div>
              {status?.gundb?.connected
                ? `${status.gundb.peers} PEERS`
                : "DISCONNECTED"}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold mb-4 opacity-80 flex items-center gap-2">
            <Music size={18} /> Community Tracks 
            <span className="badge badge-info badge-outline badge-sm">{gunDbTracks.length}</span>
          </h3>
          {gunDbTracks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {gunDbTracks.map((item, i) => {
                const uniqueId = item.siteUrl + "::" + item.track?.id;
                return (
                  <TrackCard 
                    key={uniqueId || i} 
                    item={item} 
                    onPlay={handlePlayNetworkTrack}
                    onToggleVisibility={toggleTrackVisibility}
                    isHidden={hiddenTracks.includes(uniqueId)}
                    isAdmin={isAdminAuthenticated}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 opacity-40 border border-dashed border-white/5 rounded-xl text-sm">
              No P2P tracks discovered yet.
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-bold mb-4 opacity-80 flex items-center gap-2">
            <Server size={18} /> Active Instances
            <span className="badge badge-info badge-outline badge-sm">{gunDbSites.length}</span>
          </h3>
          {gunDbSites.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {gunDbSites.map((site, i) => (
                <SiteCard key={site.url || i} site={site} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 opacity-40 border border-dashed border-white/5 rounded-xl text-sm">
              No GunDB instances found.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-8 bg-white/5 p-8 rounded-3xl border border-white/5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <Globe size={24} className="text-accent" />
            <div>
              <h2 className="text-2xl font-bold">ActivityPub & Local Feed</h2>
              <p className="text-sm opacity-50">Content discovered across the wider Fediverse and this instance.</p>
            </div>
            <div
              className={`px-3 py-1 rounded-full border text-[10px] font-bold flex items-center gap-2 ml-4 ${status?.activitypub?.enabled ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"}`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${status?.activitypub?.enabled ? "bg-blue-400" : "bg-yellow-400"}`}
              ></div>
              {status?.activitypub?.enabled ? "ACTIVE" : "SETUP REQUIRED"}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold mb-4 opacity-80 flex items-center gap-2">
            <Music size={18} /> Federated Releases
            <span className="badge badge-accent badge-outline badge-sm">{apTracks.length}</span>
          </h3>
          {apTracks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {apTracks.map((item, i) => {
                const uniqueId = item.slug || String(i);
                return (
                  <TrackCard 
                    key={uniqueId} 
                    item={item} 
                    onPlay={handlePlayNetworkTrack}
                    onToggleVisibility={toggleTrackVisibility}
                    isHidden={hiddenTracks.includes(uniqueId)}
                    isAdmin={isAdminAuthenticated}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 opacity-40 border border-dashed border-white/10 rounded-xl text-sm">
              No ActivityPub tracks discovered yet.
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-bold mb-4 opacity-80 flex items-center gap-2">
            <Globe size={18} /> Community Posts
            <span className="badge badge-accent badge-outline badge-sm">{allPosts.length}</span>
          </h3>
          {allPosts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allPosts.map((item, i) => (
                <PostCard 
                  key={item.slug || i} 
                  item={item} 
                  onToggleVisibility={toggleTrackVisibility}
                  isHidden={hiddenTracks.includes(item.slug || "")}
                  isAdmin={isAdminAuthenticated}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 opacity-40 border border-dashed border-white/10 rounded-xl text-sm">
              No community posts found.
            </div>
          )}
        </div>

        {federatedSites.length > 0 && (
          <div>
            <h3 className="text-lg font-bold mb-4 opacity-80 flex items-center gap-2">
              <Globe size={18} /> Federated Instances
              <span className="badge badge-accent badge-outline badge-sm">{federatedSites.length}</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {federatedSites.map((site, i) => (
                <SiteCard key={site.url || i} site={site} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Network;
