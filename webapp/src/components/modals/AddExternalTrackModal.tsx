import { useState, useRef, useEffect } from "react";
import API from "../../services/api";
import { Link2, Search, Youtube, Music, Cloud } from "lucide-react";

export const AddExternalTrackModal = ({
  onComplete,
}: {
  onComplete?: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const handleOpen = () => {
      setUrl("");
      setError("");
      setSuccess("");
      setLoading(false);
      dialogRef.current?.showModal();
    };

    document.addEventListener("open-add-external-modal", handleOpen as EventListener);
    // Legacy support
    document.addEventListener("open-add-youtube-modal", handleOpen as EventListener);
    
    return () => {
      document.removeEventListener("open-add-external-modal", handleOpen as EventListener);
      document.removeEventListener("open-add-youtube-modal", handleOpen as EventListener);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await API.createExternalTrack(url);
      setSuccess("Track added to your library successfully!");
      setUrl("");
      if (onComplete) {
          onComplete();
          window.dispatchEvent(new CustomEvent("refresh-admin-tracks"));
      }
      
      setTimeout(() => dialogRef.current?.close(), 1500);
    } catch (err: any) {
      setError(err.message || "Failed to add track from URL");
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog id="add-external-modal" className="modal" ref={dialogRef}>
      <div className="modal-box bg-base-100 border border-white/5">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
            ✕
          </button>
        </form>

        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Link2 size={24} className="text-primary" /> Add from Link
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-control">
            <div className="flex gap-4 mb-4 justify-center py-2 opacity-80">
              <div className="flex flex-col items-center gap-1">
                <Youtube size={24} className="text-red-500" />
                <span className="text-[10px]">YouTube</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Cloud size={24} className="text-orange-500" />
                <span className="text-[10px]">SoundCloud</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Music size={24} className="text-teal-500" />
                <span className="text-[10px]">Bandcamp</span>
              </div>
            </div>
            
            <p className="text-sm opacity-70 mb-4 text-center">
              Paste a link to a song from YouTube, SoundCloud, or Bandcamp.
            </p>

            <label className="label">
              <span className="label-text">Track URL</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="https://..."
                className="input input-bordered w-full"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                required
              />
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={loading || !url}
              >
                {loading ? <span className="loading loading-spinner loading-xs"></span> : "Add"}
              </button>
            </div>
          </div>

          {error && <div className="alert alert-error py-2 text-sm">{error}</div>}
          {success && <div className="alert alert-success py-2 text-sm">{success}</div>}

          <div className="modal-action">
             <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
};
