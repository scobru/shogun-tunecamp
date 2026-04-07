import { useState, useEffect } from "react";
import { 
  Download, 
  Trash2, 
  Magnet, 
  Server, 
  Users, 
  ArrowDown, 
  ArrowUp,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import API from "../services/api";
import { formatBytes } from "@/utils/format";

interface TorrentFile {
  name: string;
  path: string;
  progress: number;
  length: number;
  downloaded: number;
}

interface TorrentStatus {
  infoHash: string;
  name: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  received: number;
  uploaded: number;
  size: number;
  path: string;
  timeRemaining: number;
  done: boolean;
  files: TorrentFile[];
}

export function Torrents() {
  const [torrents, setTorrents] = useState<TorrentStatus[]>([]);
  const [magnetUri, setMagnetUri] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const data = await API.getTorrents();
      setTorrents(data);
    } catch (err) {
      console.error("Failed to fetch torrents:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleAddTorrent = async (e: React.FormEvent) => {
    e.preventDefault();
    const uri = magnetUri.trim();
    if (!uri) return;

    // Strict validation for magnet URI
    const magnetRegex = /^magnet:\?xt=urn:bt[ih]{1,2}:[a-z0-9]{20,50}/i;
    if (!magnetRegex.test(uri)) {
      setError("Invalid magnet URI format. Please ensure it starts with 'magnet:?xt=urn:btih:' followed by a valid info hash.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await API.addTorrent(uri);
      setMagnetUri("");
      fetchStatus();
    } catch (err: any) {
      // If the error message looks like HTML (e.g. NGINX 502 page), show a cleaner message
      const msg = err.message || "";
      if (msg.trim().startsWith("<")) {
        setError("Server connection error (502/504). The background service might be restarting or overloaded.");
      } else {
        setError(msg || "Failed to add torrent");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (infoHash: string, deleteFiles: boolean) => {
    if (!confirm(`Are you sure you want to remove this torrent${deleteFiles ? " and delete the files" : ""}?`)) return;
    
    try {
      await API.removeTorrent(infoHash, deleteFiles);
      fetchStatus();
    } catch (err: any) {
      alert("Failed to remove torrent: " + err.message);
    }
  };

  const formatTime = (ms: number) => {
    if (ms === Infinity || ms <= 0) return "Remaining time unknown";
    const seconds = Math.floor(ms / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-8">
        <Server className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-bold">BitTorrent Manager</h1>
      </div>

      {/* Add Torrent Form */}
      <div className="card bg-base-200 shadow-xl mb-8">
        <div className="card-body">
          <h2 className="card-title mb-4">
            <Magnet className="w-5 h-5" />
            Add Magnet Link
          </h2>
          <form onSubmit={handleAddTorrent} className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              placeholder="magnet:?xt=urn:btih:..."
              className="input input-bordered flex-1 font-mono text-sm"
              value={magnetUri}
              onChange={(e) => setMagnetUri(e.target.value)}
              disabled={isLoading}
            />
            <button 
              type="submit" 
              className={`btn btn-primary ${isLoading ? 'loading' : ''}`}
              disabled={isLoading || !magnetUri}
            >
              Add Torrent
            </button>
          </form>
          {error && (
            <div className="alert alert-error mt-4">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Torrents List */}
      <div className="space-y-4">
        {torrents.length === 0 ? (
          <div className="text-center py-20 bg-base-200/30 rounded-2xl border-2 border-dashed border-base-300">
            <Download className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg opacity-50">No active torrents</p>
          </div>
        ) : (
          torrents.map((t) => (
            <div key={t.infoHash} className="card bg-base-200 shadow-lg group overflow-hidden border border-base-300 hover:border-primary/50 transition-colors">
              <div className="card-body p-5">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold truncate mb-1" title={t.name}>
                      {t.name || "Retrieving metadata..."}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-60">
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {t.numPeers} peers
                      </div>
                      <div className="flex items-center gap-1">
                        <ArrowDown className="w-3 h-3 text-success" />
                        {formatBytes(t.downloadSpeed)}/s
                      </div>
                      <div className="flex items-center gap-1">
                        <ArrowUp className="w-3 h-3 text-info" />
                        {formatBytes(t.uploadSpeed)}/s
                      </div>
                      <div className="font-mono text-xs opacity-50">
                        {t.infoHash}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto">
                    {t.done ? (
                      <div className="badge badge-success gap-1 py-3 px-4">
                        <CheckCircle2 className="w-4 h-4" /> Seeding
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                         <div className="text-sm font-mono">{formatTime(t.timeRemaining)}</div>
                         <div className="badge badge-primary badge-outline text-xs">Downloading</div>
                      </div>
                    )}
                    
                    <div className="dropdown dropdown-end">
                      <label tabIndex={0} className="btn btn-ghost btn-sm text-error">
                        <Trash2 className="w-5 h-5" />
                      </label>
                      <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-300 rounded-box w-52">
                        <li>
                          <button onClick={() => handleRemove(t.infoHash, false)}>
                            Remove Torrent
                          </button>
                        </li>
                        <li className="text-error">
                          <button onClick={() => handleRemove(t.infoHash, true)}>
                            Remove & Delete Files
                          </button>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-xs mb-1 font-mono">
                    <span>{Math.round(t.progress * 1000) / 10}%</span>
                    <span>{formatBytes(t.received)} / {formatBytes(t.size)}</span>
                  </div>
                  <progress 
                    className={`progress w-full h-3 ${t.done ? 'progress-success' : 'progress-primary'}`} 
                    value={t.progress * 100} 
                    max="100"
                  ></progress>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
