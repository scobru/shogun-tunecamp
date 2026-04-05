import { useState, useEffect } from 'react';
import API from '../services/api';
import { useParams, Link } from 'react-router-dom';
import { Play, Disc, Globe, Trash2, Shield } from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useAuthStore } from '../stores/useAuthStore';
import type { Artist, Album, Post } from '../types';

export const ArtistDetails = () => {
    const { idOrSlug } = useParams();
    const [coverVersion] = useState(Date.now()); // Cache buster
    const [artist, setArtist] = useState<Artist | null>(null);
    const [formalReleases, setFormalReleases] = useState<Album[]>([]);
    const [libraryAlbums, setLibraryAlbums] = useState<Album[]>([]);
    const [looseTracks, setLooseTracks] = useState<Track[]>([]);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const { playTrack } = usePlayerStore();
    const { isAdminAuthenticated } = useAuthStore();

    useEffect(() => {
        if (idOrSlug) {
            Promise.all([
                API.getArtist(idOrSlug),
                API.getArtistPosts(idOrSlug)
            ]).then(([artistData, artistPosts]) => {
                setArtist(artistData);
                // Use albums directly from artist response if available
                if (artistData.albums) {
                    const formal = artistData.albums.filter((a: any) => a.is_formal_release || a.is_release);
                    const library = artistData.albums.filter((a: any) => !a.is_formal_release && !a.is_release);
                    setFormalReleases(formal);
                    setLibraryAlbums(library);
                }
                if (artistData.tracks) {
                    setLooseTracks(artistData.tracks);
                }
                setPosts(artistPosts);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
        }
    }, [idOrSlug]);

    if (loading) return <div className="p-12 text-center opacity-50">Loading artist...</div>;
    if (!artist) return <div className="p-12 text-center opacity-50">Artist not found.</div>;

    const handlePlay = () => {
        // Play strategy: 
        // 1. First album track if available
        // 2. First loose track if available
        const albumsToUse = formalReleases.length > 0 ? formalReleases : libraryAlbums;
        if (albumsToUse.length > 0 && albumsToUse[0].tracks && albumsToUse[0].tracks.length > 0) {
            playTrack(albumsToUse[0].tracks[0], albumsToUse[0].tracks);
        } else if (looseTracks.length > 0) {
            playTrack(looseTracks[0], looseTracks);
        }
    };

    const handleDeletePost = async (postId: string) => {
        if (!confirm("Are you sure you want to delete this post? This will also remove it from the ActivityPub network.")) return;
        try {
            await API.deletePost(Number(postId));
            setPosts(posts.filter(p => p.id !== postId));
        } catch (err: any) {
            alert("Failed to delete post: " + err.message);
        }
    };

    return (
        <div className="space-y-12 animate-fade-in">
             {/* Header */}
             <div className="relative h-80 rounded-2xl overflow-hidden flex items-end p-8 border border-white/5">
                {/* Background Image ideally from artist cover or generic */}
                 <div className="absolute inset-0 z-0">
                     {artist.coverImage ? (
                        <img src={API.getArtistCoverUrl(artist.id, coverVersion)} className="w-full h-full object-cover opacity-30 blur-sm scale-105" />
                     ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 h-full w-full"/>
                     )}
                     <div className="absolute inset-0 bg-gradient-to-t from-base-100 via-base-100/50 to-transparent"></div>
                </div>

                <div className="relative z-10 flex gap-6 items-end w-full">
                     <figure className="w-40 h-40 rounded-full shadow-2xl border-4 border-base-100 overflow-hidden shrink-0">
                         {artist.coverImage ? (
                             <img src={API.getArtistCoverUrl(artist.id, coverVersion)} className="w-full h-full object-cover"/>
                         ) : (
                             <div className="w-full h-full bg-neutral flex items-center justify-center text-4xl">{artist.name[0]}</div>
                         )}
                     </figure>
                     <div className="flex-1 space-y-2">
                         <h1 className="text-5xl md:text-7xl font-black tracking-tight">{artist.name}</h1>
                         {artist.bio && (
                             <p className="text-lg opacity-80 max-w-2xl line-clamp-2" title={artist.bio}>{artist.bio}</p>
                         )}
                         <div className="flex items-center gap-4 text-sm font-bold opacity-70">
                            <span>{formalReleases.length + libraryAlbums.length} Releases</span>
                         </div>
                     </div>
                     <div className="flex gap-2">
                        {artist.links?.map((link, i) => (
                            <a href={link.url} key={i} target="_blank" rel="noopener noreferrer" className="btn btn-circle btn-ghost bg-white/5">
                                <Globe size={20}/>
                            </a>
                        ))}
                         <button className="btn btn-primary btn-circle btn-lg text-white shadow-xl hover:scale-105 transition-transform" onClick={handlePlay}>
                             <Play fill="currentColor" size={28}/>
                         </button>
                     </div>
                </div>
             </div>

             {/* Posts / News */}
             {posts.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-6 opacity-80 border-b border-white/5 pb-2">
                        <Globe size={20}/>
                        <h2 className="text-xl font-bold">Latest News</h2>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {posts.map(post => (
                            <div key={post.id} className="card bg-base-200 border border-white/5 p-6 space-y-4 relative group">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="avatar placeholder">
                                            <div className="bg-neutral text-neutral-content rounded-full w-8">
                                                <span>{artist?.name[0]}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm flex items-center gap-2">
                                                {artist?.name}
                                                {post.visibility === 'private' && <Shield size={12} className="text-warning"/>}
                                            </div>
                                            <div className="text-xs opacity-50">{new Date(post.createdAt).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    
                                    {isAdminAuthenticated && (
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                className="btn btn-xs btn-circle btn-ghost text-error"
                                                onClick={() => handleDeletePost(post.id)}
                                                title="Delete Post"
                                            >
                                                <Trash2 size={14}/>
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: post.content }} />
                            </div>
                        ))}
                    </div>
                </section>
             )}

              {/* Discography / Releases */}
             {formalReleases.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-6 opacity-80 border-b border-white/5 pb-2">
                        <Disc />
                        <h2 className="text-xl font-bold">Discography</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        {formalReleases.map(album => (
                            <Link to={`/releases/${album.slug || album.id}`} key={album.id} className="group">
                                <figure className="aspect-square relative overflow-hidden rounded-lg shadow-lg mb-3">
                                    <img 
                                        src={API.getReleaseCoverUrl(album.id, coverVersion)} 
                                        alt={album.title} 
                                        className="absolute inset-0 object-cover w-full h-full group-hover:scale-105 transition-transform" 
                                        onError={(e) => {
                                           const target = e.target as HTMLImageElement;
                                           target.style.display = 'none';
                                           if (target.nextElementSibling) {
                                              (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                           }
                                        }}
                                    />
                                    <div className="hidden absolute inset-0 bg-neutral w-full h-full items-center justify-center opacity-30">
                                        <Disc size={32} />
                                    </div>
                                </figure>
                                <h3 className="font-bold truncate group-hover:text-primary transition-colors">{album.title}</h3>
                                <p className="text-xs opacity-50">{album.year} • {album.type}</p>
                            </Link>
                        ))}
                    </div>
                </section>
             )}

             {/* Library Additions */}
             {libraryAlbums.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-6 opacity-80 border-b border-white/5 pb-2">
                        <Disc />
                        <h2 className="text-xl font-bold">Library Additions</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        {libraryAlbums.map(album => (
                            <Link to={`/albums/${album.slug || album.id}`} key={album.id} className="group">
                                <figure className="aspect-square relative overflow-hidden rounded-lg shadow-lg mb-3">
                                    <img 
                                        src={API.getAlbumCoverUrl(album.id, coverVersion)} 
                                        alt={album.title} 
                                        className="absolute inset-0 object-cover w-full h-full group-hover:scale-105 transition-transform" 
                                        onError={(e) => {
                                           const target = e.target as HTMLImageElement;
                                           target.style.display = 'none';
                                           if (target.nextElementSibling) {
                                              (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                           }
                                        }}
                                    />
                                    <div className="hidden absolute inset-0 bg-neutral w-full h-full items-center justify-center opacity-30">
                                        <Disc size={32} />
                                    </div>
                                </figure>
                                <h3 className="font-bold truncate group-hover:text-primary transition-colors">{album.title}</h3>
                                <p className="text-xs opacity-50">{album.year} • {album.type}</p>
                            </Link>
                        ))}
                    </div>
                </section>
             )}

             {/* Loose Tracks */}
             {looseTracks.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-6 opacity-80 border-b border-white/5 pb-2">
                        <Play size={20} />
                        <h2 className="text-xl font-bold">Singles & Orphaned Tracks</h2>
                    </div>
                    <div className="overflow-x-auto bg-base-200/30 rounded-2xl border border-white/5">
                        <table className="table w-full">
                            <thead>
                                <tr className="border-b border-white/10 opacity-50 text-xs uppercase tracking-wider">
                                    <th className="w-12 text-center">#</th>
                                    <th>Title</th>
                                    <th className="text-right">Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                {looseTracks.map((track, i) => (
                                    <tr key={track.id} className="hover:bg-white/5 group border-b border-white/5 last:border-0 transition-colors cursor-pointer" onClick={() => playTrack(track, looseTracks)}>
                                        <td className="text-center font-mono w-12 relative">
                                            <span className="opacity-40 group-hover:opacity-0 transition-opacity absolute inset-0 flex items-center justify-center">
                                                {i + 1}
                                            </span>
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 flex items-center justify-center text-primary">
                                                <Play size={14} fill="currentColor" />
                                            </div>
                                        </td>
                                        <td>
                                            <div className="font-bold">{track.title}</div>
                                            <div className="text-xs opacity-40">{track.artistName}</div>
                                        </td>
                                        <td className="text-right opacity-40 font-mono text-xs">
                                            {new Date((track.duration || 0) * 1000).toISOString().substr(14, 5)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
             )}
        </div>
    );
};
