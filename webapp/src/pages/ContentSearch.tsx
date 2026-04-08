import React, { useState, useEffect } from 'react';
import { API } from '../services/api';
import { Search, Download, Settings, Activity, Database, RefreshCw, Trash2 } from 'lucide-react';

export const ContentSearch: React.FC = () => {
    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'torrents' | 'soulseek' | 'downloads'>('torrents');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [downloads, setDownloads] = useState<any[]>([]);
    const [showCreds, setShowCreds] = useState(false);
    const [creds, setCreds] = useState({ username: '', password: '' });

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
        try {
            let data: any[];
            if (activeTab === 'torrents') {
                data = await API.searchTorrents(query);
            } else {
                data = await API.searchSoulseek(query);
            }
            setResults(data);
        } catch (err: any) {
            console.error(`Search failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleAddTorrent = async (magnet: string) => {
        try {
            await API.addTorrent(magnet);
            console.log('Torrent added to download queue');
        } catch (err: any) {
            console.error(`Failed to add torrent: ${err.message}`);
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
                    <p className="text-base-content/60">Search and download music from decentralized networks.</p>
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
                <div className="card bg-base-200 mb-6 p-4">
                    <form onSubmit={handleUpdateCreds} className="flex gap-4 items-end">
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

            <div className="tabs tabs-boxed mb-6">
                <a 
                    className={`tab ${activeTab === 'torrents' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('torrents')}
                >
                    <Database className="mr-2" size={16} /> Torrents (TPB)
                </a>
                <a 
                    className={`tab ${activeTab === 'soulseek' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('soulseek')}
                >
                    <Activity className="mr-2" size={16} /> Soulseek
                </a>
                <a 
                    className={`tab ${activeTab === 'downloads' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('downloads')}
                >
                    <Download className="mr-2" size={16} /> Transfers
                </a>
            </div>

            {activeTab !== 'downloads' ? (
                <>
                    <form onSubmit={handleSearch} className="flex gap-2 mb-8">
                        <input 
                            type="text" 
                            placeholder={`Search for music on ${activeTab === 'torrents' ? 'The Pirate Bay' : 'Soulseek'}...`}
                            className="input input-bordered flex-1"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                        />
                        <button type="submit" className="btn btn-primary gap-2" disabled={loading}>
                            {loading ? <span className="loading loading-spinner"></span> : <Search size={18} />}
                            Search
                        </button>
                    </form>

                    <div className="grid gap-4">
                        {results.length === 0 && !loading && (
                            <div className="text-center py-20 bg-base-200 rounded-xl">
                                <Search className="mx-auto text-4xl mb-4 opacity-20" />
                                <p className="opacity-60">Enter a query to search for music.</p>
                            </div>
                        )}

                        {results.map((res: any, i: number) => (
                            <div key={i} className="card bg-base-200 hover:bg-base-300 transition-colors">
                                <div className="card-body p-4 flex-row justify-between items-center">
                                    <div className="flex-1">
                                        <h3 className="font-bold line-clamp-1">{res.name || res.file}</h3>
                                        <div className="text-xs opacity-60 flex gap-4 mt-1">
                                            {activeTab === 'torrents' ? (
                                                <>
                                                    <span>Size: {res.size}</span>
                                                    <span>Seeds: {res.seeders}</span>
                                                    <span>Leechers: {res.leechers}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span>User: {res.user}</span>
                                                    <span>Size: {(res.size / 1024 / 1024).toFixed(2)} MB</span>
                                                    <span>Speed: {(res.speed / 1024).toFixed(0)} KB/s</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => activeTab === 'torrents' ? handleAddTorrent(res.magnet) : handleSoulseekDownload(res)}
                                        className="btn btn-circle btn-ghost"
                                        title="Download"
                                    >
                                        <Download size={20} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="overflow-x-auto">
                    <table className="table table-zebra w-full">
                        <thead>
                            <tr>
                                <th>File</th>
                                <th>Status</th>
                                <th>Progress</th>
                                <th>Added</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {downloads.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="text-center py-10 opacity-60">No recent transfers.</td>
                                </tr>
                            )}
                            {downloads.map((dl: any) => (
                                <tr key={dl.id}>
                                    <td className="max-w-xs truncate font-medium">{dl.filename}</td>
                                    <td>
                                        <span className={`badge ${
                                            dl.status === 'completed' ? 'badge-success' : 
                                            dl.status === 'failed' ? 'badge-error' : 
                                            'badge-info'
                                        }`}>
                                            {dl.status}
                                        </span>
                                    </td>
                                    <td>
                                        <progress 
                                            className="progress progress-primary w-20" 
                                            value={dl.progress * 100} 
                                            max="100"
                                        ></progress>
                                    </td>
                                    <td className="text-xs opacity-60">{new Date(dl.added_at).toLocaleString()}</td>
                                    <td className="text-right">
                                        <div className="flex justify-end gap-1">
                                            {dl.status === 'completed' && (
                                                <button 
                                                    onClick={() => handleSyncSoulseek(dl.id)}
                                                    className="btn btn-ghost btn-xs text-success gap-1"
                                                    title="Sync to Library"
                                                >
                                                    <RefreshCw size={14} /> Sync
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => handleDeleteSoulseek(dl.id)}
                                                className="btn btn-ghost btn-xs text-error"
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
