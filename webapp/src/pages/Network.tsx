import { useState, useEffect } from 'react';
import API from '../services/api';
import { Globe, Server, Music, ExternalLink, Play } from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { GleamUtils } from '../utils/gleam';
import type { NetworkSite, NetworkTrack } from '../types';

export const Network = () => {
    const [sites, setSites] = useState<NetworkSite[]>([]);
    const [tracks, setTracks] = useState<NetworkTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const { playTrack } = usePlayerStore();

    useEffect(() => {
        const loadData = async () => {
            try {
                const [sitesData, tracksData] = await Promise.all([
                    API.getNetworkSites(),
                    API.getNetworkTracks()
                ]);
                setSites(sitesData);
                setTracks(tracksData);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const handlePlayNetworkTrack = (networkTrack: NetworkTrack) => {
        if (!networkTrack.track) return;
        
        // Construct a playable track object with remote URLs
        // Remove trailing slash from siteUrl if present
        const baseUrl = networkTrack.siteUrl.replace(/\/$/, '');
        const track = {
            ...networkTrack.track,
            // Override ID to avoid conflicts? Maybe not needed if we use streamUrl.
            // But if we add to queue, we might want unique IDs.
            // Let's keep ID but strictly rely on streamUrl.
            streamUrl: `${baseUrl}/api/tracks/${networkTrack.track.id}/stream`,
            coverUrl: networkTrack.track.albumId ? `${baseUrl}/api/albums/${networkTrack.track.albumId}/cover` : undefined
        };

        playTrack(track, [track]); // Play as single track context for now
    };

    if (loading) return <div className="p-12 text-center opacity-50 flex flex-col items-center gap-4"><Globe className="animate-pulse" size={48}/>Scanning the universe...</div>;

    return (
        <div className="space-y-12 animate-fade-in pb-12">
            <header className="flex flex-col gap-4 border-b border-white/5 pb-8">
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
            </header>

            {/* Recent Remote Tracks (Top Priority like Legacy) */}
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <Music size={24} className="text-secondary"/> 
                    <h2 className="text-2xl font-bold">Community Tracks</h2>
                    <span className="badge badge-primary badge-outline">{tracks.length}</span>
                </div>
                
                {tracks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {tracks.map((item, i) => {
                             if (!item || !item.track) return null;
                             const track = item.track;
                             
                             // Resolve cover (prefer local proxy or direct remote?)
                             // Legacy uses a proxy logic or direct url. 
                             // We constructed basic track objects in handlePlay, let's use similar logic for display.
                             const baseUrl = item.siteUrl.replace(/\/$/, '');
                             const coverUrl = track.coverImage || (track.albumId ? `${baseUrl}/api/albums/${track.albumId}/cover` : undefined);

                             return (
                                <div 
                                    key={i} 
                                    className="card bg-base-200/50 border border-white/5 hover:bg-base-200 transition-all cursor-pointer group shadow-sm hover:shadow-md"
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
                                            <div className="font-bold text-sm truncate pr-2">{track.title}</div>
                                            <div className="text-xs opacity-60 truncate flex items-center gap-1">
                                                <span>{track.artistName}</span>
                                                <span className="opacity-40">•</span>
                                                <a 
                                                    href={item.siteUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="hover:text-primary hover:underline"
                                                >
                                                    {new URL(item.siteUrl).hostname}
                                                </a>
                                            </div>
                                        </div>

                                        <div className="text-xs font-mono opacity-40">
                                            {new Date(track.duration * 1000).toISOString().substr(14, 5)}
                                        </div>
                                    </div>
                                </div>
                             );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12 opacity-50 border-2 border-dashed border-white/5 rounded-xl">
                        <p>No community tracks found yet.</p>
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
                                {/* Use site cover image if available, similar to legacy */}
                                {/* Legacy doesn't explicitly show where it gets site.coverImage from except settings. API response likely includes it. */}
                                 {/* For now keeping decorative gradient or fallback */}
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10" />
                                <div className="w-full h-full flex items-center justify-center text-4xl opacity-20">🏠</div>
                                
                                <div className="absolute bottom-2 right-2 badge badge-neutral badge-sm bg-black/50 border-none backdrop-blur-md">
                                    {new URL(site.url).hostname}
                                </div>
                            </figure>
                            <div className="card-body p-4">
                                <h3 className="font-bold text-lg group-hover:text-primary transition-colors flex items-center gap-2">
                                    {site.name} <ExternalLink size={12} className="opacity-50"/>
                                </h3>
                                <p className="text-sm opacity-60 line-clamp-2">{site.description || "No description provided."}</p>
                                
                                <div className="flex items-center justify-between text-xs font-mono opacity-50 border-t border-white/5 pt-4 mt-2">
                                    <span>v{site.version}</span>
                                    <span>{GleamUtils.formatTimeAgo(new Date(site.lastSeen).getTime())}</span>
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
