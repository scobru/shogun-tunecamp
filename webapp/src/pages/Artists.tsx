import { useState, useEffect } from 'react';
import API from '../services/api';
import { Link } from 'react-router-dom';
import { User, Trash2 } from 'lucide-react';
import type { Artist, User as AppUser } from '../types';

export const Artists = () => {
    const [artists, setArtists] = useState<Artist[]>([]);
    const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        API.getCurrentUser()
            .then(setCurrentUser)
            .catch(console.error);

        API.getArtists()
            .then(setArtists)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleDelete = async (e: React.MouseEvent, artist: Artist) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.confirm(`Are you sure you want to delete ${artist.name}? This action cannot be undone.`)) return;
        
        try {
            await API.deleteArtist(artist.id.toString());
            setArtists(prev => prev.filter(a => a.id !== artist.id));
        } catch (error: any) {
            alert(error.message || 'Failed to delete artist. They might still have releases, albums, or tracks attached.');
        }
    };

    if (loading) return <div className="p-12 text-center opacity-50">Loading artists...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <User size={32} className="text-primary"/> Artists
                </h1>
                <span className="opacity-50 font-mono text-sm">{artists.length} items</span>
             </div>

             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {artists.map(artist => (
                    <div key={artist.id} className="group text-center relative block">
                        {currentUser?.isAdmin && (!currentUser.artistId) && (
                            <button
                                onClick={(e) => handleDelete(e, artist)}
                                className="absolute top-2 right-2 z-10 p-2 bg-base-300 hover:bg-error hover:text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg"
                                title="Delete Artist"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                        <Link to={`/artists/${artist.slug || artist.id}`} className="block">
                            <figure className="aspect-square relative overflow-hidden rounded-xl shadow-xl mb-4 border-4 border-transparent group-hover:border-primary/20 transition-all mx-auto w-full max-w-[200px]">
                                {artist.coverImage ? (
                                    <img 
                                        src={API.getArtistCoverUrl(artist.id)} 
                                        alt={artist.name} 
                                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" 
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-neutral flex items-center justify-center opacity-30 text-5xl font-bold">{artist.name[0]}</div>
                                )}
                            </figure>
                            <h3 className="font-bold truncate text-lg group-hover:text-primary transition-colors">{artist.name}</h3>
                            <p className="text-sm opacity-50">Artist</p>
                        </Link>
                    </div>
                ))}
             </div>
        </div>
    );
};
