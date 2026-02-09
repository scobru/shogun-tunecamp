
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';
import { 
    Save, 
    Upload, 
    Image as ImageIcon, 
    Music, 
    GripVertical, 
    X, 
    Play, 
    Pause,
    Plus,
    Trash2,
    Calendar,
    Globe,
    Lock,
    EyeOff
} from 'lucide-react';

// Types (should be in a types file, but defining here for now/speed)
interface Track {
    id: number;
    title: string;
    duration: number;
    position: number;
    price?: number;
    file_path: string;
}

interface Release {
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
    is_public: boolean; // Legacy/API compat
    price?: number;
}

export default function AdminReleaseEditor() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isNew = !id;
    const { isAdmin } = useAuthStore();

    // State
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [artists, setArtists] = useState<any[]>([]);
    
    // Metadata State
    const [metadata, setMetadata] = useState<Partial<Release>>({
        title: '',
        type: 'album',
        year: new Date().getFullYear(),
        visibility: 'private',
        description: '',
        credits: '',
        tags: '',
        price: 0
    });
    
    // Tracks State
    const [tracks, setTracks] = useState<Track[]>([]);
    const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    
    // Cover Art
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);

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
                setMetadata(prev => ({ ...prev, artist_id: data[0].id }));
            }
        } catch (e) {
            console.error(e);
        }
    };

    const loadRelease = async (releaseId: number) => {
        setLoading(true);
        try {
            const data = await API.getAlbum(releaseId);
            setMetadata({
                ...data,
                visibility: data.visibility || (data.is_public ? 'public' : 'private')
            });
            if (data.cover_path) {
                setCoverPreview(API.getCoverUrl(data.slug)); // Helper or direct URL construction
            }
            if (data.tracks) {
                setTracks(data.tracks.sort((a: Track, b: Track) => a.position - b.position));
            }
        } catch (e) {
            console.error("Failed to load release", e);
            navigate('/admin'); // Fallback
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (publish: boolean = false) => {
        setSaving(true);
        try {
            const dataToSave = {
                ...metadata,
                visibility: publish ? 'public' : metadata.visibility
            };

            let releaseId = id ? parseInt(id) : null;

            if (isNew) {
                // Create
                const created = await API.createRelease(dataToSave); // Ensure API supports this
                releaseId = created.id;
            } else if (releaseId) {
                // Update
                await API.updateAlbum(releaseId, dataToSave);
            }

            if (!releaseId) throw new Error("No release ID available");

            // Upload Cover if changed
            if (coverFile) {
                await API.uploadCover(releaseId, coverFile);
            }

            // Handle Track Uploads (Simple sequential for now)
            if (filesToUpload.length > 0) {
               // This needs to use the API logic for uploading to a specific release
               // relying on the backend changes we made earlier: POST /tracks with releaseSlug
               // Use API.uploadTracks(files, { releaseSlug: metadata.slug }) 
               // BUT wait, if it's a new release, we might not have the slug yet or it might verify against DB
               // Ideally we save the release first (done above), then upload tracks to it via ID or Slug
               
               // We need to fetch the fresh release to get the slug if it was auto-generated
               const fresh = await API.getAlbum(releaseId);
               await API.uploadTracks(filesToUpload, { 
                   releaseSlug: fresh.slug,
                   onProgress: (pct) => {
                       // Global progress roughly
                   }
                });
            }

            // Save Track Order/Metadata updates if existing tracks were modified
            // TODO: Batch update track positions/titles logic

            if (isNew || publish) {
                navigate('/admin');
            } else {
                // Reload to show updates
                loadRelease(releaseId);
                setFilesToUpload([]);
                setCoverFile(null);
            }

        } catch (e) {
            console.error("Save failed", e);
            alert("Failed to save release");
        } finally {
            setSaving(false);
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
                    <button 
                        className="btn btn-ghost" 
                        onClick={() => handleSave(false)} 
                        disabled={saving}
                    >
                        Save Draft
                    </button>
                    <button 
                        className="btn btn-primary" 
                        onClick={() => handleSave(true)}
                        disabled={saving}
                    >
                        {saving ? 'Publishing...' : 'Publish'}
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
                            <label className="btn btn-sm btn-outline">
                                <Plus className="w-4 h-4" /> Add Audio
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

                        {/* Existing Tracks */}
                        <div className="space-y-2">
                            {tracks.length === 0 && filesToUpload.length === 0 && (
                                <div className="p-12 border-2 border-dashed border-base-content/20 rounded-box text-center text-base-content/50">
                                    <p>Drag and drop audio files here</p>
                                    <p className="text-sm">WAV, FLAC, MP3 supported</p>
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
                                        </div>
                                        <div className="text-sm opacity-50 font-mono">
                                            {/* Duration placeholder or logic */}
                                            0:00
                                        </div>
                                        <button className="btn btn-ghost btn-xs text-error opacity-0 group-hover:opacity-100">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {/* Pending Uploads */}
                            {filesToUpload.map((file, idx) => (
                                <div key={`upload-${idx}`} className="card card-compact bg-base-100/50 border border-dashed border-primary/30">
                                    <div className="card-body flex-row items-center gap-4 py-3">
                                        <div className="loading loading-spinner loading-xs text-primary"></div>
                                        <div className="flex-1 truncate">
                                            {file.name}
                                        </div>
                                        <div className="badge badge-ghost">Pending Upload</div>
                                        <button 
                                            className="btn btn-ghost btn-xs btn-circle"
                                            onClick={() => setFilesToUpload(prev => prev.filter((_, i) => i !== idx))}
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

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
                        
                        {/* Pricing */}
                        <div className="form-control">
                            <label className="label">Price (€)</label>
                            <input 
                                type="number" 
                                className="input input-bordered w-full" 
                                value={metadata.price}
                                onChange={e => setMetadata(prev => ({...prev, price: parseFloat(e.target.value)}))}
                                step="0.50"
                                min="0"
                            />
                            <label className="label cursor-pointer justify-start gap-2">
                                <input type="checkbox" className="checkbox checkbox-xs" defaultChecked />
                                <span className="label-text text-xs">Let fans pay more</span>
                            </label>
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
