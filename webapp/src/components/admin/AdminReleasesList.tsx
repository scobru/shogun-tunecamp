import { useState, useEffect } from "react";
import API from "../../services/api";
import { Globe, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const AdminReleasesList = ({ mine }: { mine?: boolean }) => {
  const navigate = useNavigate();
  const [releases, setReleases] = useState<any[]>([]);
  useEffect(() => {
    const loadReleases = () =>
      API.getAdminReleases({ mine }).then(setReleases).catch(console.error);
    loadReleases();
    window.addEventListener("refresh-admin-releases", loadReleases);
    return () =>
      window.removeEventListener("refresh-admin-releases", loadReleases);
  }, [mine]);

  const handleToggleVisibility = async (e: React.MouseEvent, release: any) => {
    e.stopPropagation(); // prevent row click if any
    const newVisibility =
      release.visibility === "public" ? "private" : "public";

    // Optimistic update
    const oldReleases = [...releases];
    setReleases(
      releases.map((r) =>
        r.id === release.id ? { ...r, visibility: newVisibility } : r,
      ),
    );

    try {
      await API.toggleReleaseVisibility(release.id, newVisibility);
    } catch (e) {
      console.error(e);
      alert("Failed to update visibility");
      setReleases(oldReleases); // Rollback
    }
  };

  if (releases.length === 0)
    return (
      <div className="opacity-50 text-center py-4">No releases found.</div>
    );

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Artist</th>
          <th>Type</th>
          <th>Visibility</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {releases.map((r) => (
          <tr key={r.id}>
            <td className="font-bold">{r.title}</td>
            <td>{r.artistName}</td>
            <td>
              <div className="badge badge-sm">{r.type}</div>
            </td>
            <td>
              <button
                className={`btn btn-xs btn-ghost gap-1 ${r.visibility === "public" ? "text-success" : "text-base-content/50"}`}
                onClick={(e) => handleToggleVisibility(e, r)}
                title={r.visibility === "public" ? "Public" : "Private"}
              >
                {r.visibility === "public" ? (
                  <Globe size={14} />
                ) : (
                  <Lock size={14} />
                )}
                <span className="hidden md:inline">{r.visibility}</span>
              </button>
            </td>
            <td className="flex gap-2">
              <button
                className="btn btn-xs btn-ghost"
                onClick={() => {
                  if (r.is_formal_release) {
                    navigate(`/admin/release/${r.id}/edit`);
                  } else {
                    document.dispatchEvent(
                      new CustomEvent("open-admin-release-modal", {
                        detail: r,
                      }),
                    );
                  }
                }}
              >
                Edit
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
