import { useState, useEffect } from "react";
import API from "../../services/api";
import { Link as LinkIcon, Edit, Trash2 } from "lucide-react";
import { BatchTrackEditModal } from "../modals/BatchTrackEditModal";

export const AdminTracksList = ({ mine }: { mine?: boolean }) => {
  const [tracks, setTracks] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [showBatchEdit, setShowBatchEdit] = useState(false);

  const loadTracks = () => API.getTracks({ mine }).then(setTracks).catch(console.error);

  useEffect(() => {
    loadTracks();
    window.addEventListener("refresh-admin-tracks", loadTracks);
    return () => window.removeEventListener("refresh-admin-tracks", loadTracks);
  }, [mine]);

  const handleDelete = async (id: string, name: string) => {
    if (
      !confirm(
        `Are you sure you want to delete track ${name}? This cannot be undone.`,
      )
    )
      return;
    try {
      await API.deleteTrack(id, true);
      loadTracks();
    } catch (e) {
      console.error(e);
      alert("Failed to delete track");
    }
  };

  const toggleSelect = (id: string | number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === tracks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tracks.map(t => t.id)));
    }
  };

  const handleBatchDelete = async () => {
    const count = selectedIds.size;
    if (!confirm(`Are you sure you want to delete ${count} tracks? This will also delete their files and cannot be undone.`)) return;
    
    try {
      await API.deleteTracksBatch(Array.from(selectedIds), true);
      setSelectedIds(new Set());
      loadTracks();
    } catch (e: any) {
      console.error(e);
      alert("Failed to perform batch deletion: " + e.message);
    }
  };

  if (tracks.length === 0)
    return <div className="opacity-50 text-center py-4">No tracks found.</div>;

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-4 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="font-bold text-primary">{selectedIds.size} tracks selected</span>
            <button className="btn btn-xs btn-ghost" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
          <div className="flex gap-2">
            <button 
              className="btn btn-sm btn-primary gap-2"
              onClick={() => setShowBatchEdit(true)}
            >
              <Edit size={16} /> Batch Edit
            </button>
            <button 
              className="btn btn-sm btn-error btn-outline gap-2"
              onClick={handleBatchDelete}
            >
              <Trash2 size={16} /> Batch Delete
            </button>
          </div>
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th className="w-10">
              <input 
                type="checkbox" 
                className="checkbox checkbox-xs" 
                checked={selectedIds.size === tracks.length && tracks.length > 0}
                onChange={toggleSelectAll}
              />
            </th>
            <th>Title</th>
            <th>Artist</th>
            <th>Album</th>
            <th>User</th>
            <th>Duration</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((t) => (
            <tr key={t.id} className={selectedIds.has(t.id) ? "bg-primary/5" : ""}>
              <td>
                <input 
                  type="checkbox" 
                  className="checkbox checkbox-xs" 
                  checked={selectedIds.has(t.id)}
                  onChange={() => toggleSelect(t.id)}
                />
              </td>
              <td className="font-bold">
                <div className="flex items-center gap-2">
                  {t.title}
                  {t.service && t.service !== "local" && (
                    <span className="badge badge-secondary badge-xs gap-1 opacity-70">
                      <LinkIcon size={10} /> {t.service}
                    </span>
                  )}
                  {t.lossless_path ? (
                    <span className="badge badge-outline badge-xs opacity-50 font-mono scale-90">
                      {t.lossless_path.toLowerCase().endsWith(".wav")
                        ? "WAV"
                        : "FLAC"}
                    </span>
                  ) : (
                    t.format && (
                      <span className="badge badge-outline badge-xs opacity-50 font-mono scale-90 uppercase">
                        {t.format}
                      </span>
                    )
                  )}
                </div>
              </td>
              <td>{t.artist_name}</td>
              <td>{t.album_title}</td>
              <td className="text-sm opacity-60">
                {t.owner_name || (t.artist_name ? `(${t.artist_name})` : "-")}
              </td>
              <td>
                {t.duration
                  ? `${Math.floor(t.duration / 60)}:${String(Math.floor(t.duration % 60)).padStart(2, "0")}`
                  : "-"}
              </td>
              <td className="flex gap-2">
                <button
                  className="btn btn-xs btn-ghost text-primary"
                  onClick={() =>
                    document.dispatchEvent(
                      new CustomEvent("open-admin-track-modal", { detail: t }),
                    )
                  }
                >
                  Edit
                </button>
                <button
                  className="btn btn-xs btn-ghost text-error"
                  onClick={() => handleDelete(t.id, t.title)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showBatchEdit && (
        <BatchTrackEditModal 
          selectedIds={Array.from(selectedIds)}
          onTracksUpdated={() => {
            loadTracks();
            setSelectedIds(new Set());
            setShowBatchEdit(false);
          }}
          onClose={() => setShowBatchEdit(false)}
        />
      )}
    </>
  );
};

