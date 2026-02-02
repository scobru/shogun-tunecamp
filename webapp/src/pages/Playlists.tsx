import { useState, useEffect } from 'react';
import API from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';
import { Link } from 'react-router-dom';
import { ListMusic, Plus, Globe, Lock } from 'lucide-react';
import type { Playlist } from '../types';
import { CreatePlaylistModal } from '../components/modals/CreatePlaylistModal';

export const Playlists = () => {
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [loading, setLoading] = useState(true);
    const { isAdminAuthenticated } = useAuthStore();

    useEffect(() => {
        loadPlaylists();
        window.addEventListener('refresh-playlists', loadPlaylists);
        return () => window.removeEventListener('refresh-playlists', loadPlaylists);
    }, []);

    const loadPlaylists = async () => {
        setLoading(true);
        try {
            const data = await API.getPlaylists();
            setPlaylists(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-4xl font-bold flex items-center gap-3">
                    <ListMusic size={40} className="text-secondary"/> Playlists
                </h1>
                
                {isAdminAuthenticated && (
                    <button 
                        className="btn btn-primary gap-2"
                        onClick={() => document.dispatchEvent(new CustomEvent('open-create-playlist-modal'))}
                    >
                        <Plus size={20}/> Create Playlist
                    </button>
                )}
            </div>

            {loading ? (
                <div className="text-center opacity-50 py-12">Loading playlists...</div>
            ) : playlists.length === 0 ? (
                <div className="text-center opacity-50 py-12 border-2 border-dashed border-white/5 rounded-2xl">
                    <ListMusic size={48} className="mx-auto mb-4 opacity-50"/>
                    <p className="text-lg">No playlists found.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {playlists.map(p => (
                        <Link 
                            to={`/playlists/${p.id}`} 
                            key={p.id}
                            className="card bg-base-200 border border-white/5 hover:bg-base-300 transition-all hover:-translate-y-1 group"
                        >
                            <div className="card-body">
                                <h2 className="card-title text-xl group-hover:text-primary transition-colors">{p.name}</h2>
                                {p.description && <p className="opacity-70 line-clamp-2 text-sm">{p.description}</p>}
                                
                                <div className="card-actions justify-end mt-4 items-center gap-3">
                                    <div className="badge badge-ghost gap-1">
                                        {p.isPublic ? <Globe size={12}/> : <Lock size={12}/>}
                                        {p.isPublic ? 'Public' : 'Private'}
                                    </div>
                                    <span className="text-xs opacity-50">{p.trackCount} tracks</span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
            
            <CreatePlaylistModal onCreated={loadPlaylists} />
        </div>
    );
};

export default Playlists;
