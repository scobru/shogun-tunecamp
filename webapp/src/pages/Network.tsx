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

            {/* Sites */}
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <Server size={24} className="text-primary"/> 
                    <h2 className="text-2xl font-bold">Discovered Instances</h2>
                    <span className="badge badge-neutral font-mono">{sites.length}</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sites.map((site, i) => (
                        <div key={i} className="group card bg-base-200/50 hover:bg-base-200 border border-white/5 hover:border-blue-400/30 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                            <div className="card-body p-6 relative overflow-hidden">
                                {/* Decorative gradient */}
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-bl-full -mr-8 -mt-8 z-0 transition-transform group-hover:scale-150 duration-500"/>
                                
                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="font-bold text-lg flex items-center gap-2">
                                            {site.name} 
                                        </h3>
                                        <a href={site.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost btn-circle">
                                            <ExternalLink size={16}/>
                                        </a>
                                    </div>
                                    
                                    <p className="text-sm opacity-70 line-clamp-2 mb-4 min-h-[2.5em]">{site.description || "No description provided."}</p>
                                    
                                    <div className="flex items-center justify-between text-xs font-mono opacity-50 border-t border-white/5 pt-4">
                                        <div className="flex gap-3">
                                            <span>v{site.version}</span>
                                            <span className="opacity-30">•</span>
                                            <span>{GleamUtils.formatTimeAgo(new Date(site.lastSeen).getTime())}</span>
                                        </div>
                                        <div className="badge badge-xs badge-ghost">ONLINE</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Recent Remote Tracks */}
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <Music size={24} className="text-secondary"/> 
                    <h2 className="text-2xl font-bold">Recent Network Activity</h2>
                </div>
                
                <div className="bg-base-200/30 rounded-2xl border border-white/5 overflow-hidden">
                    <table className="table w-full">
                        <thead>
                            <tr className="border-b border-white/10 text-xs uppercase opacity-50 bg-base-200/50">
                                <th className="w-16"></th>
                                <th className="py-4 pl-4">Track</th>
                                <th>Artist</th>
                                <th>Instance</th>
                                <th className="text-right pr-6">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tracks.map((item, i) => {
                                if (!item || !item.track) return null;
                                return (
                                <tr key={i} className="group hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                                    <td className="text-center">
                                        <button 
                                            onClick={() => handlePlayNetworkTrack(item)}
                                            className="btn btn-circle btn-sm btn-ghost group-hover:bg-primary group-hover:text-white transition-all"
                                        >
                                            <Play size={14} fill="currentColor" className="ml-0.5"/>
                                        </button>
                                    </td>
                                    <td className="font-medium text-base">
                                        {item.track.title}
                                    </td>
                                    <td className="opacity-70">{item.track.artistName}</td>
                                    <td>
                                        <a 
                                            href={item.siteUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="badge badge-outline hover:bg-white/10 transition-colors gap-2 pl-1 pr-3"
                                        >
                                            <Globe size={10}/> {item.siteName}
                                        </a>
                                    </td>
                                    <td className="text-right pr-6">
                                         <a href={item.siteUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm gap-2">
                                            Visit <ExternalLink size={14} className="opacity-50"/>
                                         </a>
                                    </td>
                                </tr>
                            )})}
                            {tracks.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 opacity-50">No recent network activity found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default Network;
