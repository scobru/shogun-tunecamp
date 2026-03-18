import { useState, useEffect } from "react";
import API from "../../services/api";
import { Link as LinkIcon } from "lucide-react";

export const AdminTracksList = ({ mine }: { mine?: boolean }) => {
  const [tracks, setTracks] = useState<any[]>([]);

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

  if (tracks.length === 0)
    return <div className="opacity-50 text-center py-4">No tracks found.</div>;

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Artist</th>
          <th>Album</th>
          <th>Duration</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {tracks.map((t) => (
          <tr key={t.id}>
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
                    new CustomEvent("open-playlist-modal", {
                      detail: { trackId: t.id },
                    }),
                  )
                }
              >
                Playlist
              </button>
              <button
                className="btn btn-xs btn-ghost"
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
  );
};
