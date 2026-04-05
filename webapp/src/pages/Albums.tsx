import { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import { Link } from 'react-router-dom';
import { Disc, Library } from 'lucide-react';
import type { Album } from '../types';
import { useAuthStore } from '../stores/useAuthStore';
import clsx from 'clsx';

export const Albums = () => {
    const { isAuthenticated } = useAuthStore();
    const [activeTab, setActiveTab] = useState<'releases' | 'library'>('releases');
    const [releases, setReleases] = useState<any[]>([]);
    const [library, setLibrary] = useState<Album[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // Always load public releases (no auth needed)
                const releasesData = await API.getReleases().catch(err => {
                    console.error("Failed to load releases:", err);
                    return [];
                });
                setReleases(releasesData);

                // Only try to load library if authenticated
                // We add a small check for the token to avoid race conditions right after login
                if (isAuthenticated) {
                    const token = API.getToken();
                    if (token) {
                        const libraryData = await API.getAlbums().catch(async (err) => {
                            // If it's a 401 right after login, it might be a race condition.
                            // Try one more time after a very short delay.
                            if (err.status === 401) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                                return API.getAlbums().catch(() => []);
                            }
                            return [];
                        });
                        setLibrary(libraryData);
                    }
                }
            } catch (e) {
                console.error("Error loading catalog data:", e);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [isAuthenticated]);

    const currentItems = useMemo(() => {
        return activeTab === 'releases' ? releases : library;
    }, [activeTab, releases, library]);

    if (loading) return <div className="p-12 text-center opacity-50">Loading...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Disc size={32} className="text-primary"/> Catalog
                </h1>
                
                <div role="tablist" className="tabs tabs-boxed bg-base-200/50 p-1 border border-white/5">
                    <button 
                        role="tab" 
                        className={clsx("tab tab-sm md:tab-md transition-all gap-2", activeTab === 'releases' && "tab-active !bg-primary !text-primary-content")}
                        onClick={() => setActiveTab('releases')}
                    >
                        <Disc size={16}/> Formal Releases
                        <div className={clsx("badge badge-xs", activeTab === 'releases' ? "badge-ghost" : "badge-outline opacity-50")}>
                            {releases.length}
                        </div>
                    </button>
                    <button 
                        role="tab" 
                        className={clsx("tab tab-sm md:tab-md transition-all gap-2", activeTab === 'library' && "tab-active !bg-primary !text-primary-content")}
                        onClick={() => setActiveTab('library')}
                    >
                        <Library size={16}/> File Library
                        <div className={clsx("badge badge-xs", activeTab === 'library' ? "badge-ghost" : "badge-outline opacity-50")}>
                            {library.length}
                        </div>
                    </button>
                </div>
             </div>

             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {currentItems.map(item => {
                    if (!item) return null;
                    const isReleaseTab = activeTab === 'releases';
                    const linkTo = isReleaseTab ? `/releases/${item.slug || item.id}` : `/albums/${item.slug || item.id}`;
                    const coverUrl = isReleaseTab ? API.getReleaseCoverUrl(item.id) : API.getAlbumCoverUrl(item.id);

                    return (
                        <Link to={linkTo} key={item.id} className="group card bg-base-200 hover:bg-base-300 transition-all hover:-translate-y-1 duration-300 shadow-xl border border-white/5">
                            <figure className="aspect-square relative overflow-hidden">
                                <img 
                                    src={coverUrl} 
                                    alt={item.title} 
                                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" 
                                    loading="lazy"
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        if (target.nextElementSibling) {
                                            (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                        }
                                    }}
                                />
                                <div className="hidden absolute inset-0 bg-neutral items-center justify-center opacity-30">
                                    <Disc size={48}/>
                                </div>
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="btn btn-circle btn-primary btn-sm scale-0 group-hover:scale-100 transition-transform delay-75">
                                        <Disc size={16}/>
                                    </span>
                                </div>
                            </figure>
                            <div className="card-body p-4">
                                <h3 className="font-bold truncate text-lg" title={item.title}>{item.title}</h3>
                                <p className="text-sm opacity-60 truncate">{item.artistName || (item as any).artist_name}</p>
                                <div className="flex justify-between items-center mt-2 opacity-40 text-xs font-mono">
                                    <span>{item.year}</span>
                                    <span className="uppercase border border-white/20 px-1 rounded text-[10px]">{item.type}</span>
                                </div>
                            </div>
                        </Link>
                    );
                })}
             </div>
             
             {currentItems.length === 0 && (
                <div className="text-center py-20 opacity-30 flex flex-col items-center gap-4">
                    <Disc size={64}/>
                    <p className="text-xl">
                        {activeTab === 'releases' ? "No formal releases published yet." : "Library is empty."}
                    </p>
                </div>
             )}
        </div>
    );
};
