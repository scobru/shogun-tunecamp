
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';
import { TrackPickerModal } from '../components/modals/TrackPickerModal';
import { UnlockCodeManager } from '../components/modals/UnlockCodeManager';
import { 
    Image as ImageIcon, 
    Music, 
    GripVertical, 
    X, 
    Plus,
    Trash2,
    Globe,
    Lock,
    Library,
    Key,
    Download,
    Unlock
} from 'lucide-react';

interface LocalTrack {
    id: number;
    title: string;
    duration: number;
    position: number;
    price?: number;
    file_path: string;
    artistName?: string;
    format?: string;
}



interface LocalRelease {
    id: number;
    title: string;
    artist_id: number;
    type: 'album' | 'single' | 'ep';
    year: number;
    cover_path?: string;
    slug: string;
    description?: string;
    credits?: string;
    tags?: string;
    visibility: 'public' | 'private' | 'unlisted';
    is_public: boolean;
    published_to_gundb?: boolean;
    published_to_ap?: boolean;
    price?: number;
    download?: string;
}

export default function AdminReleaseEditor() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isNew = !id;
    const { adminUser } = useAuthStore();

    // State
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [artists, setArtists] = useState<any[]>([]);
    
    // Metadata State
    const [metadata, setMetadata] = useState<Partial<LocalRelease>>({
        title: '',
        type: 'album',
        year: new Date().getFullYear(),
        visibility: 'private',
        description: '',
        credits: '',
        tags: '',
        price: 0,
        download: 'none'
    });
    
    // Tracks State
    const [tracks, setTracks] = useState<LocalTrack[]>([]);
    const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
    const [uploadingFileIndex, setUploadingFileIndex] = useState<number | null>(null);

    // Track Picker
    const [showTrackPicker, setShowTrackPicker] = useState(false);
    
    // Cover Art
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);

    // Unlock Codes Modal
    const [showUnlockManager, setShowUnlockManager] = useState(false);

    useEffect(() => {
        loadArtists();
        if (!isNew && id) {
            loadRelease(parseInt(id));
        }
    }, [id]);

    const loadArtists = async () => {
        try {
            const data = await API.getArtists();
            setArtists(data);
             // Default to first artist if new
             if (isNew && data.length > 0) {
                setMetadata(prev => ({ ...prev, artist_id: parseInt(data[0].id) }));
            }
        } catch (e) {
            console.error(e);
        }
    };

    const loadRelease = async (releaseId: number) => {
        setLoading(true);
        try {
            const data: any = await API.getAlbum(releaseId);
            setMetadata({
                id: parseInt(data.id),
                title: data.title,
                artist_id: parseInt(data.artistId),
                type: data.type,
                year: data.year,
                slug: data.slug,
                description: data.description,
                visibility: data.visibility || (data.is_public ? 'public' : 'private'),
                is_public: !!data.is_public,
                published_to_gundb: data.published_to_gundb !== undefined ? !!data.published_to_gundb : true,
                published_to_ap: data.published_to_ap !== undefined ? !!data.published_to_ap : true,
                price: data.price,
                download: data.download || 'none'
            });
            
            if (data.slug || releaseId) {
                setCoverPreview(API.getAlbumCoverUrl(data.slug || releaseId));
            }
            if (data.tracks) {
                setTracks(data.tracks.sort((a: any, b: any) => (a.position || 0) - (b.position || 0)));
            }
        } catch (e) {
            console.error("Failed to load release", e);
            navigate('/admin'); // Fallback
        } finally {
            setLoading(false);
        }
    };

    const handleAddLibraryTracks = (selected: any[]) => {
        const newTracks = selected.map(t => ({
            id: parseInt(t.id),
            title: t.title,
            duration: t.duration,
            position: tracks.length + 1, // Append
            price: 0,
            file_path: t.file_path || t.path,
            artistName: t.artist_name || t.artistName
        }));
        
        // Filter out duplicates
        const unique = newTracks.filter(nt => !tracks.find(t => t.id === nt.id));
        
        setTracks(prev => [...prev, ...unique]);
    };

    const handleRemoveTrack = (index: number) => {
        setTracks(prev => prev.filter((_, i) => i !== index));
    };

    const handleDelete = async () => {
        if (!window.confirm("Are you sure you want to delete this release? This cannot be undone.")) return;

        setSaving(true);
        try {
            if (id) {
                await API.deleteRelease(id);
                navigate('/admin');
            }
        } catch (e) {
            console.error("Failed to delete release", e);
            alert("Failed to delete release");
            setSaving(false);
        }
    };

    const handleSave = async (exit: boolean = false) => {
        if (!adminUser?.isAdmin) return;
        setSaving(true);
        try {
            // Prepare track IDs in order
            const track_ids = tracks.map(t => t.id);

            const dataToSave = {
                ...metadata,
                // Map frontend state to API expected keys
                publishedToGunDB: metadata.published_to_gundb,
                publishedToAP: metadata.published_to_ap,
                track_ids // Send full list of IDs to sync associations
            } as any; 

            let releaseId = id ? parseInt(id) : null;
            let currentSlug = metadata.slug;

            // 1. Create or Update Release
            if (isNew) {
                const created: any = await API.createRelease(dataToSave); 
                releaseId = parseInt(created.id);
                currentSlug = created.slug;
            } else if (releaseId) {
                await API.updateRelease(String(releaseId), dataToSave);
                // Fetch fresh slug if needed
                if (!currentSlug) {
                    const fresh = await API.getAlbum(releaseId);
                    currentSlug = fresh.slug;
                }
            }

            if (!releaseId) throw new Error("No release ID available");

            // 2. Upload Cover
            if (coverFile && currentSlug) {
                 await API.uploadCover(coverFile, currentSlug);
            }

            // 3. Handle File Uploads (Sequentially to report progress/errors)
            if (filesToUpload.length > 0 && currentSlug) {
                try {
                     setUploadingFileIndex(0); 
                     await API.uploadTracks(filesToUpload, { 
                        releaseSlug: currentSlug
                    });
                } catch (e) {
                    console.error("Upload failed", e);
                    alert("Some files failed to upload. Please try again.");
                    // Don't clear filesToUpload so user can retry
                    throw e; 
                }
            }

            if (exit) {
                navigate('/admin');
            } else {
                // Reload
                setFilesToUpload([]);
                // Reload release to get updated state (including new tracks if any were uploaded)
                setUploadingFileIndex(null);
                setCoverFile(null);
                loadRelease(releaseId);
            }

        } catch (e) {
            console.error("Save failed", e);
            alert("Failed to save release or upload tracks.");
        } finally {
            setSaving(false);
            setUploadingFileIndex(null);
        }
    };

    // Drag and Drop handlers for File Upload
    const handleDropAudio = (e: React.DragEvent) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
        if (files.length > 0) {
            setFilesToUpload(prev => [...prev, ...files]);
        }
    };
    
    const handleDropCover = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            setCoverFile(file);
            setCoverPreview(URL.createObjectURL(file));
        }
    };

    if (loading) return <div className="p-8 text-center">Loading...</div>;

    return (
        <div className="flex flex-col h-full bg-base-300">
            {/* Header / Toolbar */}
            <div className="navbar bg-base-100 border-b border-base-content/10 px-6 min-h-[4rem]">
                <div className="flex-1 gap-4">
                    <button onClick={() => navigate('/admin')} className="btn btn-ghost btn-sm">
                        &larr; Back
                    </button>
                    <h1 className="text-xl font-bold">
                        {isNew ? 'New Release' : `Edit: ${metadata.title}`}
                    </h1>
                </div>
                <div className="flex-none gap-2">
                    {!isNew && (
                        <button
                            className="btn btn-ghost text-error"
                            onClick={handleDelete}
                            disabled={saving}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                        </button>
                    )}
                    <button 
                        className="btn btn-ghost" 
                        onClick={() => handleSave(false)} 
                        disabled={saving}
                    >
                        Save
                    </button>
                    <button 
                        className="btn btn-primary" 
                        onClick={() => handleSave(true)}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : (metadata.visibility === 'public' ? 'Publish' : 'Save & Close')}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-row">
                
                {/* LEFT COLUMN: TRAKCS */}
                <div className="flex-1 overflow-y-auto p-8 border-r border-base-content/10 relative"
                     onDragOver={e => e.preventDefault()}
                     onDrop={handleDropAudio}
                >
                    <div className="max-w-3xl mx-auto space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <Music className="w-5 h-5" /> Tracks
                            </h2>
                            <div className="flex gap-2">
                                <button className="btn btn-sm btn-outline" onClick={() => setShowTrackPicker(true)}>
                                    <Library className="w-4 h-4" /> Add from Library
                                </button>
                                <label className="btn btn-sm btn-primary">
                                    <Plus className="w-4 h-4" /> Upload Audio
                                    <input 
                                        type="file" 
                                        multiple 
                                        accept="audio/*" 
                                        className="hidden"
                                        onChange={e => {
                                            if(e.target.files) setFilesToUpload(prev => [...prev, ...Array.from(e.target.files!)]);
                                        }} 
                                    />
                                </label>
                            </div>
                        </div>

                        {/* Existing Tracks */}
                        <div className="space-y-2">
                            {tracks.length === 0 && filesToUpload.length === 0 && (
                                <div className="p-12 border-2 border-dashed border-base-content/20 rounded-box text-center text-base-content/50">
                                    <p>Drag and drop audio files here</p>
                                    <p className="text-sm">or click buttons above</p>
                                </div>
                            )}

                            {tracks.map((track, idx) => (
                                <div key={track.id} className="card card-compact bg-base-100 shadow-sm border border-base-content/5 group">
                                    <div className="card-body flex-row items-center gap-4 py-2">
                                        <div className="cursor-grab text-base-content/30 hover:text-base-content">
                                            <GripVertical className="w-5 h-5" />
                                        </div>
                                        <div className="font-mono text-sm opacity-50 w-6 text-right">{idx + 1}</div>
                                        <div className="flex-1">
                                            <input 
                                                type="text" 
                                                value={track.title} 
                                                onChange={(e) => {
                                                    const newTracks = [...tracks];
                                                    newTracks[idx].title = e.target.value;
                                                    setTracks(newTracks);
                                                }}
                                                className="input input-ghost input-sm w-full font-medium focus:bg-base-200"
                                            />
                                            {track.artistName && <div className="text-xs opacity-50 px-3">{track.artistName}</div>}
                                        </div>
                                        {(track as any).losslessPath || (track as any).lossless_path ? (
                                            <span className="badge badge-outline badge-xs opacity-50 font-mono scale-90">
                                                {((track as any).losslessPath || (track as any).lossless_path || '').toLowerCase().endsWith('.wav') ? 'WAV' : 'FLAC'}
                                            </span>
                                        ) : (
                                            <span className="badge badge-outline badge-xs opacity-50 font-mono scale-90 uppercase">
                                                {track.format || 'MP3'}
                                            </span>
                                        )}
                                        <div className="text-sm opacity-50 font-mono">
                                            {track.duration ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}` : '-'}
                                        </div>
                                        <button 
                                            className="btn btn-ghost btn-xs text-error opacity-0 group-hover:opacity-100"
                                            onClick={() => handleRemoveTrack(idx)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {/* Pending Uploads */}
                            {filesToUpload.map((file, idx) => (
                                <div key={`upload-${idx}`} className="card card-compact bg-base-100/50 border border-dashed border-primary/30">
                                    <div className="card-body flex-row items-center gap-4 py-3">
                                        {uploadingFileIndex !== null && <div className="loading loading-spinner loading-xs text-primary"></div>}
                                        <div className="flex-1 truncate">
                                            {file.name}
                                        </div>
                                        <div className="badge badge-ghost">Pending Upload</div>
                                        <button 
                                            className="btn btn-ghost btn-xs btn-circle"
                                            onClick={() => setFilesToUpload(prev => prev.filter((_, i) => i !== idx))}
                                            disabled={uploadingFileIndex !== null}
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <TrackPickerModal 
                    isOpen={showTrackPicker} 
                    onClose={() => setShowTrackPicker(false)}
                    onTracksSelected={handleAddLibraryTracks}
                    excludeTrackIds={tracks.map(t => t.id)}
                />

                <UnlockCodeManager 
                    releaseId={metadata.id || ''}
                    isOpen={showUnlockManager}
                    onClose={() => setShowUnlockManager(false)}
                />

                {/* RIGHT COLUMN: METADATA */}
                <div className="w-96 bg-base-200 p-6 overflow-y-auto border-l border-base-content/10">
                    <div className="space-y-6">
                        
                        {/* Cover Art */}
                        <div className="form-control">
                            <label className="label font-bold">Cover Art</label>
                            <div 
                                className="aspect-square bg-base-100 rounded-box border-2 border-dashed border-base-content/20 flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer"
                                onDragOver={e => e.preventDefault()}
                                onDrop={handleDropCover}
                                onClick={() => document.getElementById('cover-upload')?.click()}
                            >
                                {coverPreview ? (
                                    <img src={coverPreview} className="w-full h-full object-cover" alt="Cover" />
                                ) : (
                                    <div className="text-center text-base-content/40">
                                        <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                                        <span className="text-sm">Drag image or click</span>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold">
                                    Change Cover
                                </div>
                                <input 
                                    id="cover-upload" 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={e => {
                                        if(e.target.files?.[0]) {
                                            setCoverFile(e.target.files[0]);
                                            setCoverPreview(URL.createObjectURL(e.target.files[0]));
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {/* Title */}
                        <div className="form-control">
                            <label className="label">Album Title</label>
                            <input 
                                type="text" 
                                className="input input-bordered w-full" 
                                value={metadata.title}
                                onChange={e => setMetadata(prev => ({...prev, title: e.target.value}))}
                                placeholder="e.g. Dark Side of the Moon" 
                            />
                        </div>

                        {/* Artist */}
                        <div className="form-control">
                            <label className="label">Artist</label>
                            <select 
                                className="select select-bordered w-full"
                                value={metadata.artist_id}
                                onChange={e => setMetadata(prev => ({...prev, artist_id: parseInt(e.target.value)}))}
                            >
                                {artists.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Year */}
                            <div className="form-control">
                                <label className="label">Year</label>
                                <input 
                                    type="number" 
                                    className="input input-bordered w-full" 
                                    value={metadata.year}
                                    onChange={e => setMetadata(prev => ({...prev, year: parseInt(e.target.value)}))}
                                />
                            </div>
                            {/* Type */}
                            <div className="form-control">
                                <label className="label">Type</label>
                                <select 
                                    className="select select-bordered w-full"
                                    value={metadata.type}
                                    onChange={e => setMetadata(prev => ({...prev, type: e.target.value as any}))}
                                >
                                    <option value="album">Album</option>
                                    <option value="single">Single</option>
                                    <option value="ep">EP</option>
                                </select>
                            </div>
                        </div>
                        
                        {/* Download Options */}
                        <div className="form-control">
                            <label className="label">Download Method</label>
                            <div className="space-y-2">
                                <label className="label cursor-pointer justify-start gap-3 border border-base-content/10 p-3 rounded-lg hover:bg-base-100">
                                    <input 
                                        type="radio" 
                                        name="download_method" 
                                        className="radio radio-sm" 
                                        checked={metadata.download === 'none' || !metadata.download}
                                        onChange={() => setMetadata(prev => ({...prev, download: 'none'}))}
                                    />
                                    <div className='flex flex-col'>
                                        <span className="font-bold text-xs uppercase opacity-70">Disabled</span>
                                    </div>
                                </label>

                                <label className="label cursor-pointer justify-start gap-3 border border-base-content/10 p-3 rounded-lg hover:bg-base-100">
                                    <input 
                                        type="radio" 
                                        name="download_method" 
                                        className="radio radio-sm radio-secondary" 
                                        checked={metadata.download === 'free'}
                                        onChange={() => setMetadata(prev => ({...prev, download: 'free'}))}
                                    />
                                    <div className='flex flex-col'>
                                        <span className="font-bold flex items-center gap-2 text-xs uppercase text-secondary">
                                            <Download className="w-3 h-3"/> Free Download
                                        </span>
                                        <span className="text-[10px] opacity-70 uppercase tracking-tighter">Anyone can download music for free.</span>
                                    </div>
                                </label>

                                <label className="label cursor-pointer justify-start gap-3 border border-base-content/10 p-3 rounded-lg hover:bg-base-100">
                                    <input 
                                        type="radio" 
                                        name="download_method" 
                                        className="radio radio-sm radio-primary" 
                                        checked={metadata.download === 'codes'}
                                        onChange={() => setMetadata(prev => ({...prev, download: 'codes'}))}
                                    />
                                    <div className='flex flex-col'>
                                        <span className="font-bold flex items-center gap-2 text-xs uppercase text-primary">
                                            <Unlock className="w-3 h-3"/> Unlock Codes
                                        </span>
                                        <span className="text-[10px] opacity-70 uppercase tracking-tighter">Requires a code to access downloads.</span>
                                    </div>
                                </label>

                                {metadata.download === 'codes' && !isNew && (
                                    <button 
                                        className="btn btn-sm btn-primary btn-outline w-full gap-2 mt-2"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setShowUnlockManager(true);
                                        }}
                                    >
                                        <Key size={14}/> Manage Unlock Codes
                                    </button>
                                )}
                                {metadata.download === 'codes' && isNew && (
                                    <div className="alert alert-info text-[10px] py-1 px-3 mt-2">
                                        Save the release first to manage codes.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Visibility */}
                        <div className="form-control">
                           <label className="label">Visibility</label>
                           <div className="flex flex-col gap-2">
                               <label className="label cursor-pointer justify-start gap-3 border border-base-content/10 p-3 rounded-lg hover:bg-base-100">
                                   <input 
                                        type="radio" 
                                        name="visibility" 
                                        className="radio radio-sm radio-primary" 
                                        checked={metadata.visibility === 'public'}
                                        onChange={() => setMetadata(prev => ({...prev, visibility: 'public'}))}
                                   />
                                   <div className='flex flex-col'>
                                       <span className="font-bold flex items-center gap-2"><Globe className="w-3 h-3"/> Public</span>
                                       <span className="text-xs opacity-70">Visible to everyone. Federates to ActivityPub.</span>
                                   </div>
                               </label>
                               
                               <label className="label cursor-pointer justify-start gap-3 border border-base-content/10 p-3 rounded-lg hover:bg-base-100">
                                   <input 
                                        type="radio" 
                                        name="visibility" 
                                        className="radio radio-sm" 
                                        checked={metadata.visibility === 'private'}
                                        onChange={() => setMetadata(prev => ({...prev, visibility: 'private'}))}
                                   />
                                   <div className='flex flex-col'>
                                       <span className="font-bold flex items-center gap-2"><Lock className="w-3 h-3"/> Private</span>
                                       <span className="text-xs opacity-70">Only visible to you (admins).</span>
                                   </div>
                               </label>
                           </div>

                           {/* Federation Settings - Only show when Public/Unlisted */}
                           {(metadata.visibility === 'public' || metadata.visibility === 'unlisted') && (
                                <div className="form-control border border-base-content/10 p-3 rounded-lg mt-2 bg-base-100/50">
                                    <label className="label font-bold text-xs uppercase opacity-70 pb-0">Federation</label>

                                    <label className="label cursor-pointer justify-start gap-3">
                                        <input
                                            type="checkbox"
                                            className="checkbox checkbox-sm checkbox-primary"
                                            checked={metadata.published_to_gundb !== false} // Default to true if undefined
                                            onChange={(e) => setMetadata(prev => ({...prev, published_to_gundb: e.target.checked}))}
                                        />
                                        <div className='flex flex-col'>
                                            <span className="text-sm font-bold">GunDB (P2P)</span>
                                            <span className="text-[10px] opacity-70">Decentralized database sync</span>
                                        </div>
                                    </label>

                                    <label className="label cursor-pointer justify-start gap-3">
                                        <input
                                            type="checkbox"
                                            className="checkbox checkbox-sm checkbox-secondary"
                                            checked={metadata.published_to_ap !== false} // Default to true if undefined
                                            onChange={(e) => setMetadata(prev => ({...prev, published_to_ap: e.target.checked}))}
                                        />
                                        <div className='flex flex-col'>
                                            <span className="text-sm font-bold">ActivityPub</span>
                                            <span className="text-[10px] opacity-70">Mastodon & Fediverse federation</span>
                                        </div>
                                    </label>
                                </div>
                            )}
                        </div>

                        {/* Description */}
                         <div className="form-control">
                            <label className="label">Description</label>
                            <textarea 
                                className="textarea textarea-bordered h-24"
                                value={metadata.description || ''}
                                onChange={e => setMetadata(prev => ({...prev, description: e.target.value}))}
                            ></textarea>
                        </div>

                        {/* Tags */}
                         <div className="form-control">
                            <label className="label">Tags</label>
                            <input 
                                type="text" 
                                className="input input-bordered w-full text-sm" 
                                placeholder="electronic, pop, ambient..."
                                value={metadata.tags || ''}
                                onChange={e => setMetadata(prev => ({...prev, tags: e.target.value}))}
                            />
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
