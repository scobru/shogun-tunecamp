import { useState, useEffect } from 'react';
import API from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';
import { Globe, Server, Music, ExternalLink, Play } from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { StringUtils } from '../utils/stringUtils';
import type { NetworkSite, NetworkTrack } from '../types';

export const Network = () => {
    const [sites, setSites] = useState<NetworkSite[]>([]);
    const [tracks, setTracks] = useState<NetworkTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const { playTrack } = usePlayerStore();
    const { isAdminAuthenticated } = useAuthStore();
    const [hiddenTracks, setHiddenTracks] = useState<string[]>([]);
    const [showHidden, setShowHidden] = useState(false);

    const getHostname = (url: string) => {
        try {
            if (!url) return 'Unknown';
            if (url.startsWith('https://')) {
                const u = new URL(url);
                return u.hostname;
            }
            // Handle AP Actor URIs or IDs
            if (url.includes('/users/')) {
                const u = new URL(url);
                return u.hostname;
            }
            return url || 'Unknown';
        } catch {
            return url || 'Unknown';
        }
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                const [sitesData, tracksData] = await Promise.all([
                    API.getNetworkSites(),
                    API.getNetworkTracks()
                ]);

                // Deduplicate Sites (GunDB)
                const uniqueSites = new Map();
                sitesData.forEach((s: any) => {
                    if (!s.url || !s.url.startsWith('http')) return;
                    const normalizedUrl = s.url.replace(/\/$/, '');
                    if (!uniqueSites.has(normalizedUrl)) {
                        uniqueSites.set(normalizedUrl, { ...s, url: normalizedUrl });
                    }
                });
                const sites = Array.from(uniqueSites.values()) as NetworkSite[];

                // Process Tracks (GunDB + ActivityPub)
                // 1. Initial validity filter
                const validTracks = tracksData.filter((t: any) => {
                    // AP tracks have different structure (flattened)
                    if (t.federation === 'activitypub') return !!t.audioUrl;
                    
                    if (!t.track) return false;
                    
                    // Strict local filter (t.siteUrl cannot be null/empty/slash)
                    const url = t.siteUrl;
                    if (!url || url.trim() === '/' || url.trim() === '') return false;

                    return true;
                });

                // 2. Content Deduplication (Artist + Title)
                const uniqueContent = new Map<string, NetworkTrack>();
                
                validTracks.forEach((t: any) => {
                    const title = t.federation === 'activitypub' ? t.title : t.track.title;
                    const artist = t.federation === 'activitypub' ? t.artistName : (t.track.artistName || 'unknown');
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
        
        // Load hidden tracks
        const stored = localStorage.getItem('tunecamp_blocked_tracks');
        if (stored) {
            try {
                setHiddenTracks(JSON.parse(stored));
            } catch {}
        }
    }, []);

    const toggleTrackVisibility = (url: string) => {
        const newHidden = hiddenTracks.includes(url) 
            ? hiddenTracks.filter(u => u !== url)
            : [...hiddenTracks, url];
        
        setHiddenTracks(newHidden);
        localStorage.setItem('tunecamp_blocked_tracks', JSON.stringify(newHidden));
    };

    const handlePlayNetworkTrack = (networkTrack: any) => {
        if (networkTrack.federation === 'activitypub') {
            const track = {
                id: networkTrack.slug,
                title: networkTrack.title,
                artistName: networkTrack.artistName,
                albumTitle: networkTrack.releaseTitle,
                streamUrl: networkTrack.audioUrl,
                coverUrl: networkTrack.coverUrl,
                coverImage: networkTrack.coverUrl,
                duration: networkTrack.duration,
                siteUrl: networkTrack.siteUrl,
                service: 'activitypub'
            };
            playTrack(track as any, [track as any]);
            return;
        }

        if (!networkTrack.track || !networkTrack.siteUrl) return;
        
        // Construct a playable track object with remote URLs (GunDB)
        const baseUrl = networkTrack.siteUrl.replace(/\/$/, '');
        const trackData = networkTrack.track;
        
        const coverUrl = trackData.coverUrl || 
                        trackData.coverImage || 
                        (trackData.albumId ? `${baseUrl}/api/albums/${trackData.albumId}/cover` : undefined);
        
        const track = {
            ...trackData,
            streamUrl: trackData.streamUrl || `${baseUrl}/api/tracks/${trackData.id}/stream`,
            coverUrl: coverUrl,
            coverImage: coverUrl
        };

        playTrack(track, [track]);
    };

    if (loading) return <div className="p-12 text-center opacity-50 flex flex-col items-center gap-4"><Globe className="animate-pulse" size={48}/>Scanning the universe...</div>;

    const filteredTracks = tracks.filter((item: any) => {
        if (!item) return false;
        const uniqueId = item.federation === 'activitypub' ? item.slug : (item.siteUrl + '::' + item.track?.id);
        
        if (showHidden) return true;
        return !hiddenTracks.includes(uniqueId);
    });

    return (
        <div className="space-y-12 animate-fade-in pb-12">
            <header className="flex flex-col gap-4 border-b border-white/5 pb-8">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20">
                            <Globe size={48} className="text-blue-400"/>
                        </div>
                        <div>
                            <h1 className="text-4xl font-black tracking-tight">Federated Network</h1>
                            <p className="opacity-60 text-lg">
                                Discover music from other TuneCamp instances across the globe.
                            </p>
                        </div>
                    </div>
                    {isAdminAuthenticated && (
                        <button 
                            className="btn btn-primary btn-sm gap-2"
                            onClick={async () => {
                                if (confirm("Do you want to synchronize all content with ActivityPub? This will update metadata and ensure visibility settings are correct on remote instances.")) {
                                    try {
                                        const res = await API.syncActivityPub() as { artists: number; notes: number };
                                        alert(`Sync complete! Processed ${res.artists} artists and ${res.notes} items.`);
                                    } catch (err: any) {
                                        alert("Sync failed: " + err.message);
                                    }
                                }
                            }}
                        >
                            <Server size={16}/> Sync with ActivityPub
                        </button>
                    )}
                </div>
            </header>

            {/* Recent Remote Tracks */}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Music size={24} className="text-secondary"/> 
                        <h2 className="text-2xl font-bold">Community Tracks</h2>
                        <span className="badge badge-primary badge-outline">{filteredTracks.length}</span>
                    </div>
                    {isAdminAuthenticated && (
                        <div className="form-control">
                            <label className="label cursor-pointer gap-2">
                                <span className="label-text text-xs uppercase font-bold opacity-50">Show Hidden</span>
                                <input 
                                    type="checkbox" 
                                    className="toggle toggle-xs toggle-neutral" 
                                    checked={showHidden} 
                                    onChange={e => setShowHidden(e.target.checked)}
                                />
                            </label>
                        </div>
                    )}
                </div>
                
                {filteredTracks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredTracks.map((item: any, i) => {
                             const isAP = item.federation === 'activitypub';
                             const track = isAP ? item : item.track;
                             if (!track) return null;

                             const uniqueId = isAP ? item.slug : (item.siteUrl + '::' + track.id);
                             const isHidden = hiddenTracks.includes(uniqueId);

                             if (isHidden && !showHidden) return null;

                             const baseUrl = !isAP && item.siteUrl ? item.siteUrl.replace(/\/$/, '') : '';
                             let coverUrl = isAP ? item.coverUrl : (track.coverImage || (track.albumId && baseUrl ? `${baseUrl}/api/albums/${track.albumId}/cover` : undefined));
                             
                             if (coverUrl && !coverUrl.startsWith('http') && !coverUrl.startsWith('/')) {
                                 coverUrl = undefined;
                             }

                             const siteUrl = isAP ? item.siteUrl : item.siteUrl;

                             return (
                                <div 
                                    key={i} 
                                    className={`card border hover:bg-base-200 transition-all cursor-pointer group shadow-sm hover:shadow-md ${isHidden ? 'bg-error/10 border-error/20 opacity-70' : 'bg-base-200/50 border-white/5'}`}
                                    onClick={() => handlePlayNetworkTrack(item)}
                                >
                                    <div className="p-3 flex items-center gap-4">
                                        <div className="relative w-12 h-12 rounded-lg bg-base-300 flex-shrink-0 overflow-hidden">
                                            {coverUrl ? (
                                                <img src={coverUrl} alt={track.title} className="w-full h-full object-cover"/>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xl opacity-30">🎵</div>
                                            )}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <Play size={20} className="text-white fill-current"/>
                                            </div>
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-sm truncate pr-2 flex items-center gap-2">
                                                {track.title}
                                                {isAP && <span className="badge badge-accent badge-xs opacity-70" title="Discovered via ActivityPub">AP</span>}
                                                {isHidden && <span className="badge badge-error badge-xs">Hidden</span>}
                                            </div>
                                            <div className="text-xs opacity-60 truncate flex items-center gap-1">
                                                <span>{isAP ? track.artistName : track.artistName}</span>
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
                                                {track.duration ? new Date(track.duration * 1000).toISOString().substr(14, 5) : '--:--'}
                                            </div>
                                            {isAdminAuthenticated && (
                                                <button 
                                                    className={`btn btn-xs btn-ghost btn-circle ${isHidden ? 'text-primary' : 'text-error opacity-0 group-hover:opacity-100'}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTrackVisibility(uniqueId);
                                                    }}
                                                    title={isHidden ? "Unhide Track" : "Hide Track"}
                                                >
                                                    {isHidden ? (
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                                                    ) : (
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                             );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12 opacity-50 border-2 border-dashed border-white/5 rounded-xl">
                    <div className="text-center py-12 opacity-50 border-2 border-dashed border-white/5 rounded-xl">
                        <p>No community tracks found yet.</p>
                        <p className="text-sm mt-2">Tracks from other instances will appear here when available.</p>
                    </div>
                    </div>
                )}
            </section>

            {/* Sites */}
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <Server size={24} className="text-primary"/> 
                    <h2 className="text-2xl font-bold">Active Instances</h2>
                    <span className="badge badge-secondary badge-outline">{sites.length}</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sites.map((site, i) => (
                        <a 
                            key={i} 
                            href={site.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="card bg-base-200 border border-white/5 hover:border-primary/30 transition-all hover:scale-[1.01] group"
                        >
                            <figure className="h-32 bg-base-300 relative overflow-hidden">
                                {site.coverImage ? (
                                    <img src={site.coverImage} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={site.name} />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-4xl opacity-20 bg-gradient-to-br from-blue-500/10 to-purple-500/10">
                                        <span>🏠</span>
                                    </div>
                                )}
                                <div className="absolute bottom-2 right-2 badge badge-neutral badge-sm bg-black/50 border-none backdrop-blur-md">
                                    {getHostname(site.url)}
                                </div>
                            </figure>
                            <div className="card-body p-4">
                                <h3 className="font-bold text-lg group-hover:text-primary transition-colors flex items-center gap-2">
                                    {site.name} <ExternalLink size={12} className="opacity-50"/>
                                </h3>
                                <p className="text-sm opacity-60 line-clamp-2">{site.description || "No description provided."}</p>
                                
                                <div className="flex items-center justify-between text-xs font-mono opacity-50 border-t border-white/5 pt-4 mt-2">
                                    <span>v{site.version}</span>
                                    <span>{StringUtils.formatTimeAgo(new Date(site.lastSeen).getTime())}</span>
                                </div>
                            </div>
                        </a>
                    ))}
                </div>
            </section>
        </div>
    );
};

export default Network;
