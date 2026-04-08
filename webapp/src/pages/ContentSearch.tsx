import React, { useState, useEffect } from 'react';
import { API } from '../services/api';
import { Search, Download, Settings, Activity, Database, RefreshCw, Trash2, ExternalLink, Link as LinkIcon, AlertCircle } from 'lucide-react';

export const ContentSearch: React.FC = () => {
    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'torrents' | 'soulseek' | 'downloads'>('torrents');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [downloads, setDownloads] = useState<any[]>([]);
    const [showCreds, setShowCreds] = useState(false);
    const [creds, setCreds] = useState({ username: '', password: '' });
    const [manualMagnet, setManualMagnet] = useState('');
    const [searchError, setSearchError] = useState<string | null>(null);

    const quickLinks = [
        { name: 'RuTracker', icon: <ExternalLink size={14} />, url: (q: string) => `https://rutracker.org/forum/tracker.php?nm=${encodeURIComponent(q)}` },
        { name: '1337x', icon: <ExternalLink size={14} />, url: (q: string) => `https://1337x.to/category-search/${encodeURIComponent(q)}/Music/1/` },
        { name: 'The Pirate Bay', icon: <ExternalLink size={14} />, url: (q: string) => `https://thepiratebay.org/search/${encodeURIComponent(q)}/1/99/100` },
    ];

    const fetchDownloads = async () => {
        try {
            const data = await API.getSoulseekStatus();
            setDownloads(data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (activeTab === 'downloads') {
            fetchDownloads();
            const interval = setInterval(fetchDownloads, 5000);
            return () => clearInterval(interval);
        }
    }, [activeTab]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query) return;

        setLoading(true);
        setResults([]);
        setSearchError(null);
        try {
            let data: any[];
            if (activeTab === 'torrents') {
                data = await API.searchTorrents(query);
                if (data.length === 0) {
                    setSearchError("No direct results found. Try the external shortcuts below!");
                }
            } else {
                data = await API.searchSoulseek(query);
            }
            setResults(data);
        } catch (err: any) {
            console.error(`Search failed: ${err.message}`);
            setSearchError("Search service is currently limited. Use manual links below.");
        } finally {
            setLoading(false);
        }
    };

    const handleAddTorrent = async (magnet: string) => {
        if (!magnet.startsWith('magnet:?')) {
            alert('Please enter a valid magnet link starting with magnet:?');
            return;
        }
        try {
            await API.addTorrent(magnet);
            setManualMagnet('');
            alert('Torrent added to download queue!');
            if (activeTab === 'torrents') {
                // Optionally switch to transfers tab or show success
            }
        } catch (err: any) {
            console.error(`Failed to add torrent: ${err.message}`);
            alert(`Error: ${err.message}`);
        }
    };

    const handleSoulseekDownload = async (result: any) => {
        try {
            await API.downloadSoulseek(result);
            console.log('Download started');
            fetchDownloads();
        } catch (err: any) {
            console.error(`Failed to start download: ${err.message}`);
        }
    };

    const handleSyncSoulseek = async (id: number) => {
        try {
            await API.syncSoulseekDownload(id);
            console.log('Sync triggered');
            fetchDownloads();
        } catch (err: any) {
            console.error(`Failed to sync: ${err.message}`);
        }
    };

    const handleDeleteSoulseek = async (id: number) => {
        if (!confirm('Are you sure you want to remove this transfer record?')) return;
        try {
            await API.deleteSoulseekDownload(id);
            fetchDownloads();
        } catch (err: any) {
            console.error(`Failed to delete: ${err.message}`);
        }
    };

    const handleClearFailedSoulseek = async () => {
        if (!confirm('Are you sure you want to clear all failed transfers?')) return;
        try {
            await API.clearFailedSoulseekDownloads();
            fetchDownloads();
        } catch (err: any) {
            console.error(`Failed to clear failed: ${err.message}`);
        }
    };

    const handleUpdateCreds = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await API.updateSoulseekCredentials(creds);
            console.log('Soulseek credentials updated');
            setShowCreds(false);
        } catch (err: any) {
            console.error(`Failed to update credentials: ${err.message}`);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Content Search</h1>
                    <p className="text-base-content/60">Find and download music via decentralised protocols.</p>
                </div>
                {activeTab === 'soulseek' && (
                    <button 
                        onClick={() => setShowCreds(!showCreds)}
                        className="btn btn-ghost btn-sm gap-2"
                    >
                        <Settings size={16} /> Credentials
                    </button>
                )}
                {activeTab === 'downloads' && downloads.some(d => d.status === 'failed') && (
                    <button 
                        onClick={handleClearFailedSoulseek}
                        className="btn btn-error btn-outline btn-sm gap-2"
                    >
                        <Trash2 size={16} /> Clear All Failed
                    </button>
                )}
            </header>

            {showCreds && (
                <div className="card bg-base-200 mb-6 p-4 border border-base-300">
                    <form onSubmit={handleUpdateCreds} className="flex flex-wrap gap-4 items-end">
                        <div className="form-control">
                            <label className="label"><span className="label-text">Soulseek Username</span></label>
                            <input 
                                type="text" 
                                className="input input-bordered" 
                                value={creds.username}
                                onChange={e => setCreds({...creds, username: e.target.value})}
                            />
                        </div>
                        <div className="form-control">
                            <label className="label"><span className="label-text">Password</span></label>
                            <input 
                                type="password" 
                                className="input input-bordered" 
                                value={creds.password}
                                onChange={e => setCreds({...creds, password: e.target.value})}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary">Save & Connect</button>
                    </form>
                </div>
            )}

            <div className="tabs tabs-boxed mb-6 p-1 bg-base-300">
                <button 
                    className={`tab flex-1 transition-all ${activeTab === 'torrents' ? 'tab-active bg-primary text-primary-content shadow-lg' : ''}`}
                    onClick={() => setActiveTab('torrents')}
                >
                    <Database className="mr-2" size={16} /> Torrents
                </button>
                <button 
                    className={`tab flex-1 transition-all ${activeTab === 'soulseek' ? 'tab-active bg-primary text-primary-content shadow-lg' : ''}`}
                    onClick={() => setActiveTab('soulseek')}
                >
                    <Activity className="mr-2" size={16} /> Soulseek
                </button>
                <button 
                    className={`tab flex-1 transition-all ${activeTab === 'downloads' ? 'tab-active bg-primary text-primary-content shadow-lg' : ''}`}
                    onClick={() => setActiveTab('downloads')}
                >
                    <Download className="mr-2" size={16} /> Transfers
                </button>
            </div>

            {activeTab !== 'downloads' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Search Column */}
                    <div className="lg:col-span-2">
                        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={18} />
                                <input 
                                    type="text" 
                                    placeholder={`Quick search ${activeTab === 'torrents' ? 'automated sites' : 'Soulseek users'}...`}
                                    className="input input-bordered w-full pl-10"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary gap-2 min-w-[120px]" disabled={loading}>
                                {loading ? <span className="loading loading-spinner loading-xs"></span> : <Search size={18} />}
                                Search
                            </button>
                        </form>

                        {searchError && (
                            <div className="alert alert-warning mb-6 py-3 shadow-sm rounded-lg">
                                <AlertCircle size={18} />
                                <span className="text-sm font-medium">{searchError}</span>
                            </div>
                        )}

                        <div className="grid gap-3">
                            {results.length === 0 && !loading && !searchError && (
                                <div className="text-center py-20 bg-base-200/50 border border-dashed border-base-300 rounded-2xl">
                                    <div className="bg-base-300 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Search className="opacity-20" size={32} />
                                    </div>
                                    <p className="opacity-40 font-medium">Ready to search the network...</p>
                                </div>
                            )}

                            {results.map((res: any, i: number) => (
                                <div key={i} className="group card bg-base-200/50 hover:bg-base-200 border border-base-300/50 hover:border-primary/30 transition-all duration-200">
                                    <div className="card-body p-4 flex-row justify-between items-center">
                                        <div className="flex-1 min-w-0 pr-4">
                                            <h3 className="font-bold truncate text-sm lg:text-base group-hover:text-primary transition-colors">
                                                {res.title || res.name || res.file}
                                            </h3>
                                            <div className="text-xs opacity-50 flex flex-wrap gap-x-4 gap-y-1 mt-1 font-medium">
                                                {activeTab === 'torrents' ? (
                                                    <>
                                                        <span className="flex items-center gap-1">Size: {res.size}</span>
                                                        <span className="flex items-center gap-1 text-success">Seeds: {res.seeders}</span>
                                                        <span className="flex items-center gap-1">Leechers: {res.leechers}</span>
                                                        {res.provider && <span className="badge badge-ghost badge-xs bg-base-300 px-2 py-1 h-auto uppercase opacity-70">{res.provider}</span>}
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="flex items-center gap-1">User: {res.user}</span>
                                                        <span className="flex items-center gap-1">{(res.size / 1024 / 1024).toFixed(2)} MB</span>
                                                        <span className="flex items-center gap-1">{(res.speed / 1024).toFixed(0)} KB/s</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => activeTab === 'torrents' ? handleAddTorrent(res.magnet) : handleSoulseekDownload(res)}
                                            className="btn btn-circle btn-sm btn-ghost hover:bg-primary hover:text-primary-content transition-all"
                                            title="Download"
                                        >
                                            <Download size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Side Actions Column */}
                    <div className="space-y-6">
                        {/* Manual Magnet Input */}
                        {activeTab === 'torrents' && (
                            <div className="card bg-base-200 border border-base-300 shadow-sm overflow-hidden">
                                <div className="card-body p-5">
                                    <h2 className="card-title text-sm font-bold uppercase tracking-wider opacity-60 flex items-center gap-2 mb-2">
                                        <LinkIcon size={16} /> Manual Magnet
                                    </h2>
                                    <p className="text-xs opacity-50 mb-4 leading-relaxed">
                                        Found a magnet link on an external site? Paste it here to start the download.
                                    </p>
                                    <div className="flex flex-col gap-2">
                                        <textarea 
                                            placeholder="magnet:?xt=urn:btih:..."
                                            className="textarea textarea-bordered h-24 text-xs font-mono bg-base-300/50 resize-none focus:border-primary/50"
                                            value={manualMagnet}
                                            onChange={e => setManualMagnet(e.target.value)}
                                        />
                                        <button 
                                            onClick={() => handleAddTorrent(manualMagnet)}
                                            className="btn btn-primary btn-sm w-full font-bold shadow-md"
                                            disabled={!manualMagnet.trim()}
                                        >
                                            Add to Queue
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Search Shortcuts */}
                        {activeTab === 'torrents' && (
                            <div className="card bg-base-200 border border-base-300 shadow-sm overflow-hidden">
                                <div className="card-body p-5">
                                    <h2 className="card-title text-sm font-bold uppercase tracking-wider opacity-60 flex items-center gap-2 mb-2">
                                        <ExternalLink size={16} /> Site Shortcuts
                                    </h2>
                                    <p className="text-xs opacity-50 mb-4 leading-relaxed">
                                        Scraping is fragile. Use these specialized indexers for the best results.
                                    </p>
                                    <div className="grid gap-2">
                                        {quickLinks.map((link, idx) => (
                                            <a 
                                                key={idx}
                                                href={link.url(query || '')}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="btn btn-sm btn-outline border-base-300 hover:bg-base-300 hover:border-base-300 justify-between font-medium group"
                                            >
                                                {link.name}
                                                <span className="opacity-0 group-hover:opacity-100 transition-opacity translate-x-1">{link.icon}</span>
                                            </a>
                                        ))}
                                    </div>
                                    {query && (
                                        <p className="text-[10px] text-center mt-3 opacity-30 italic">
                                            Links are pre-filled with your current query.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Note about Soulseek */}
                        {activeTab === 'soulseek' && (
                            <div className="card bg-primary/5 border border-primary/20 p-5">
                                <h3 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
                                    <Activity size={16} /> Soulseek Protocol
                                </h3>
                                <p className="text-xs opacity-70 leading-relaxed">
                                    Soulseek is a peer-to-peer network specifically for music. It is often more reliable than torrents for finding rare albums and lossless tracks.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="overflow-x-auto bg-base-200/50 rounded-2xl border border-base-300 shadow-sm">
                    <table className="table table-zebra w-full">
                        <thead>
                            <tr className="bg-base-300/50 text-base-content/60">
                                <th className="rounded-tl-2xl">File</th>
                                <th>Status</th>
                                <th>Progress</th>
                                <th>Added</th>
                                <th className="text-right rounded-tr-2xl">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {downloads.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-20 opacity-40 font-medium">No recent transfers.</td>
                                </tr>
                            )}
                            {downloads.map((dl: any) => (
                                <tr key={dl.id} className="hover:bg-base-300/30 transition-colors">
                                    <td className="max-w-[12rem] lg:max-w-xs">
                                        <div className="truncate font-semibold text-base-content" title={dl.filename}>
                                            {dl.filename}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`badge badge-sm px-3 h-6 font-bold uppercase tracking-tighter ${
                                            dl.status === 'completed' ? 'badge-success text-success-content' : 
                                            dl.status === 'failed' ? 'badge-error text-error-content' : 
                                            'badge-info text-info-content'
                                        }`}>
                                            {dl.status}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <progress 
                                                className={`progress w-16 lg:w-24 ${dl.status === 'completed' ? 'progress-success' : 'progress-primary'}`} 
                                                value={dl.progress * 100} 
                                                max="100"
                                            ></progress>
                                            <span className="text-[10px] font-mono opacity-50">{(dl.progress * 100).toFixed(0)}%</span>
                                        </div>
                                    </td>
                                    <td className="text-[10px] uppercase opacity-40 font-bold">{new Date(dl.added_at).toLocaleDateString()}</td>
                                    <td className="text-right">
                                        <div className="flex justify-end gap-1">
                                            {dl.status === 'completed' && (
                                                <button 
                                                    onClick={() => handleSyncSoulseek(dl.id)}
                                                    className="btn btn-ghost btn-xs text-primary gap-1 font-bold"
                                                    title="Sync to Library"
                                                >
                                                    <RefreshCw size={14} /> Sync
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => handleDeleteSoulseek(dl.id)}
                                                className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                                                title="Remove Transfer"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ContentSearch;
