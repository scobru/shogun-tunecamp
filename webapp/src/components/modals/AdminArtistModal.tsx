import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { User, Image as ImageIcon, Globe } from 'lucide-react';

interface AdminArtistModalProps {
    onArtistUpdated: () => void;
}

export const AdminArtistModal = ({ onArtistUpdated }: AdminArtistModalProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [bio, setBio] = useState('');
    
    // ActivityPub / Mastodon Conf
    const [mastodonInstance, setMastodonInstance] = useState('');
    const [mastodonToken, setMastodonToken] = useState('');
    
    // Links
    const [donationUrl, setDonationUrl] = useState('');
    const [socialLinks, setSocialLinks] = useState<{platform: string, url: string}[]>([]);
    
    const [walletAddress, setWalletAddress] = useState('');
    
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    const isSelf = currentUser && editId && String(currentUser.artistId) === String(editId);
    const canEditSensitive = !isEditing || isSelf; // Can edit sensitive fields on create or if it's self

    useEffect(() => {
        API.getCurrentUser().then(setCurrentUser).catch(console.error);

        const handleOpen = (e: CustomEvent) => {
            if (e.detail && e.detail.id) {
                // Edit Mode
                const artist = e.detail;
                setIsEditing(true);
                setEditId(artist.id);
                setName(artist.name || '');
                setSlug(artist.slug || '');
                setBio(artist.bio || artist.description || '');
                
                // Parse postParams for Mastodon
                if (artist.postParams) {
                    let params = artist.postParams;
                    if (typeof params === 'string') {
                        try { params = JSON.parse(params); } catch (e) { params = {}; }
                    }
                    setMastodonInstance(params.instance || '');
                    setMastodonToken(params.token || '');
                } else {
                    setMastodonInstance('');
                    setMastodonToken('');
                }

                // Parse links
                if (artist.links) {
                    let linksArr = artist.links;
                    if (typeof linksArr === 'string') {
                        try { linksArr = JSON.parse(linksArr); } catch (e) { linksArr = []; }
                    }
                    if (Array.isArray(linksArr)) {
                        const donation = (linksArr as any[]).find(l => l.type === 'support' || l.platform?.toLowerCase() === 'donation');
                        setDonationUrl(donation ? donation.url : '');
                        setSocialLinks((linksArr as any[]).filter(l => l.type !== 'support' && l.platform?.toLowerCase() !== 'donation').map(l => ({
                            platform: l.platform || 'Social',
                            url: l.url
                        })));
                    }
                } else {
                    setDonationUrl('');
                    setSocialLinks([]);
                }
                
                setWalletAddress(artist.walletAddress || '');

            } else {
                // Create Mode
                setIsEditing(false);
                setEditId(null);
                setName('');
                setSlug('');
                setBio('');
                setMastodonInstance('');
                setMastodonToken('');
                setDonationUrl('');
                setSocialLinks([]);
                setWalletAddress('');
            }
            
            setAvatarFile(null);
            setError('');
            dialogRef.current?.showModal();
        };

        document.addEventListener('open-admin-artist-modal', handleOpen as EventListener);
        return () => document.removeEventListener('open-admin-artist-modal', handleOpen as EventListener);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const postParamsValue = (mastodonInstance || mastodonToken) ? {
                instance: mastodonInstance,
                token: mastodonToken
            } : null;

            const allLinks: any[] = socialLinks.map(l => ({ ...l, type: 'social' }));
            if (donationUrl) {
                allLinks.unshift({ platform: 'Donation', url: donationUrl, type: 'support' });
            }

            let artist;
            
            if (isEditing && editId) {
                artist = await API.updateArtist(editId, {
                    name,
                    slug: slug || undefined,
                    bio,
                    links: allLinks,
                    postParams: postParamsValue,
                    walletAddress: walletAddress || undefined
                });
            } else {
                artist = await API.createArtist({ 
                    name, 
                    slug: slug || undefined, 
                    bio,
                    links: allLinks,
                    postParams: postParamsValue,
                    walletAddress: walletAddress || undefined
                });
            }

            // Upload avatar if selected
            if (avatarFile && artist) {
                await API.uploadArtistAvatar(artist.id, avatarFile);
            }

            onArtistUpdated();
            dialogRef.current?.close();
        } catch (e: any) {
            console.error(e);
            setError(e.message || 'Failed to save artist');
        } finally {
            setLoading(false);
        }
    };

    return (
        <dialog id="admin-artist-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-white/5 w-11/12 max-w-2xl">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <User size={20}/> {isEditing ? 'Edit Artist' : 'Create Artist'}
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Name</span>
                            </label>
                            <input 
                                type="text" 
                                className="input input-bordered w-full" 
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Slug (URL)</span>
                            </label>
                            <input 
                                type="text" 
                                className="input input-bordered w-full" 
                                value={slug}
                                onChange={e => setSlug(e.target.value)}
                                placeholder="Auto-generated if empty"
                            />
                        </div>
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Description / Bio</span>
                        </label>
                        <textarea 
                            className="textarea textarea-bordered h-24" 
                            value={bio}
                            onChange={e => setBio(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text font-bold text-success">Donation / Support URL</span>
                            </label>
                            <input 
                                type="url" 
                                className="input input-bordered w-full border-success/30" 
                                value={donationUrl}
                                onChange={e => setDonationUrl(e.target.value)}
                                placeholder="https://ko-fi.com/..."
                            />
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Social Links (comma separated URLs)</span>
                            </label>
                            <input 
                                type="text" 
                                className="input input-bordered w-full" 
                                value={socialLinks.map(l => l.url).join(', ')}
                                onChange={e => {
                                    const urls = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                    setSocialLinks(urls.map(url => {
                                        let platform = 'Social';
                                        if (url.includes('twitter')) platform = 'Twitter';
                                        if (url.includes('x.com')) platform = 'X';
                                        if (url.includes('instagram')) platform = 'Instagram';
                                        if (url.includes('facebook')) platform = 'Facebook';
                                        if (url.includes('youtube')) platform = 'YouTube';
                                        return { platform, url };
                                    }));
                                }}
                                placeholder="twitter.com/..., instagram.com/..."
                            />
                        </div>
                    </div>
                    
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text font-bold text-accent">Payment Wallet Address (optional)</span>
                        </label>
                        <input 
                            type="text" 
                            className="input input-bordered w-full border-accent/30 font-mono text-sm" 
                            value={walletAddress}
                            onChange={e => setWalletAddress(e.target.value)}
                            placeholder="0x..."
                            disabled={!canEditSensitive && walletAddress !== ''}
                        />
                         <label className="label">
                            <span className="label-text-alt opacity-70">
                                {(!canEditSensitive && walletAddress !== '') ? 
                                    "Only the artist can change their wallet once set." : 
                                    "If provided, payments for this artist's releases will be sent directly to this address."
                                }
                            </span>
                        </label>
                    </div>
                    
                    <div className="divider text-xs opacity-50 uppercase tracking-widest">ActivityPub / Mastodon Config</div>
                    <div className="bg-base-200 p-4 rounded-lg space-y-4">
                         <div className="alert alert-info py-2 text-xs bg-info/10 border-info/20 mb-2">
                            <Globe size={16}/> 
                            <div>
                                <p className="font-bold">Mastodon Auto-Posting</p>
                                <p>This section is for cross-posting your releases to an <strong>external</strong> Mastodon account. 
                                Internal ActivityPub federation uses keys automatically managed by the system.</p>
                            </div>
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Instance URL</span>
                            </label>
                            <input 
                                type="url" 
                                className="input input-bordered w-full" 
                                value={mastodonInstance}
                                onChange={e => setMastodonInstance(e.target.value)}
                                placeholder="https://mastodon.social"
                                disabled={!canEditSensitive}
                            />
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Access Token</span>
                            </label>
                            <input 
                                type="password" 
                                className="input input-bordered w-full" 
                                value={mastodonToken}
                                onChange={e => setMastodonToken(e.target.value)}
                                placeholder="Bearer Token"
                                disabled={!canEditSensitive}
                            />
                        </div>
                        {!canEditSensitive && (
                            <p className="text-[10px] opacity-40 px-1 italic">Note: Only the artist can manage their Mastodon cross-posting credentials.</p>
                        )}
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Artist Avatar</span>
                        </label>
                         <div className="flex items-center gap-4">
                            {isEditing && editId && !avatarFile && (
                                <div className="avatar">
                                    <div className="w-16 h-16 rounded-full border border-white/10">
                                        <img src={API.getArtistCoverUrl(editId, Date.now())} />
                                    </div>
                                </div>
                            )}
                            <input 
                                type="file" 
                                className="file-input file-input-bordered w-full"
                                accept="image/*"
                                onChange={e => setAvatarFile(e.target.files ? e.target.files[0] : null)}
                            />
                            {avatarFile && <ImageIcon className="text-success" size={24}/>}
                        </div>
                         <label className="label">
                            <span className="label-text-alt opacity-70">JPG or PNG, max 5MB.</span>
                        </label>
                    </div>
                    
                    {error && <div className="text-error text-sm text-center">{error}</div>}

                    <div className="modal-action">
                        <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Saving...' : (isEditing ? 'Update Artist' : 'Create Artist')}
                        </button>
                    </div>
                </form>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
};
