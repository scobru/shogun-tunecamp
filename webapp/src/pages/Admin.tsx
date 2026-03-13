import { useState, useEffect } from "react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { useNavigate } from "react-router-dom";
import {
  Settings,
  RefreshCw,
  Save,
  User,
  Globe,
  Lock,
  Link as LinkIcon,
} from "lucide-react";
import { AdminUserModal } from "../components/modals/AdminUserModal";

import { IdentityPanel } from "../components/admin/IdentityPanel";
import { ActivityPubPanel } from "../components/admin/ActivityPubPanel";
import { BackupPanel } from "../components/admin/BackupPanel";
import type { SiteSettings } from "../types";

export const Admin = () => {
  const { adminUser, isAdminAuthenticated, isAdminLoading } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    | "users"
    | "settings"
    | "system"
    | "identity"
    | "activitypub"
    | "backup"
  >("users");
  const [stats, setStats] = useState<any>(null);

  // const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdminLoading) return;
    if (!isAdminAuthenticated || !adminUser?.isAdmin) {
      navigate("/");
      return;
    }
    loadStats();
  }, [isAdminAuthenticated, adminUser, isAdminLoading]);

  if (isAdminLoading)
    return (
      <div className="p-12 text-center opacity-50">Loading dashboard...</div>
    );

  const loadStats = async () => {
    // setLoading(true);
    try {
      const data = await API.getAdminStats();
      setStats(data);
    } catch (e) {
      console.error(e);
    } finally {
      // setLoading(false);
    }
  };

  const handleSystemAction = async (action: "cleanup" | "consolidate") => {
    const isCleanup = action === "cleanup";
    if (
      !confirm(
        `Are you sure you want to ${isCleanup ? "cleanup the network" : "consolidate files"}? This may take a while.`,
      )
    )
      return;
    try {
      if (isCleanup) {
        await API.cleanupNetwork();
        alert(`Network cleanup finished successfully.`);
      } else {
        const res = await API.consolidateFiles();
        alert(`File consolidation finished. Success: ${res.success}, Failed: ${res.failed}, Skipped: ${res.skipped}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to start action");
    }
  };

  if (!isAdminAuthenticated || !adminUser?.isAdmin) return null;

  return (
    <div className="space-y-8 animate-fade-in">
      <h1 className="text-3xl font-bold flex items-center gap-3">
        <Settings size={32} className="text-primary" /> Admin Dashboard
      </h1>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat bg-base-200 rounded-box border border-white/5">
            <div className="stat-title">Total Users</div>
            <div className="stat-value text-primary">{stats.totalUsers}</div>
          </div>
          <div className="stat bg-base-200 rounded-box border border-white/5">
            <div className="stat-title">Total Tracks</div>
            <div className="stat-value text-secondary">{stats.totalTracks}</div>
          </div>
          <div className="stat bg-base-200 rounded-box border border-white/5">
            <div className="stat-title">Storage Used</div>
            <div className="stat-value text-accent">
              {(stats.storageUsed / 1024 / 1024 / 1024).toFixed(2)} GB
            </div>
          </div>
          <div className="stat bg-base-200 rounded-box border border-white/5">
            <div className="stat-title">Network Sites</div>
            <div className="stat-value">{stats.networkSites}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-lifted">
        <a
          role="tab"
          className={`tab ${activeTab === "users" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Users
        </a>
        <a
          role="tab"
          className={`tab ${activeTab === "settings" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          Settings
        </a>
        <a
          role="tab"
          className={`tab ${activeTab === "system" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("system")}
        >
          System
        </a>
        <a
          role="tab"
          className={`tab ${activeTab === "identity" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("identity")}
        >
          Identity
        </a>
        <a
          role="tab"
          className={`tab ${activeTab === "activitypub" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("activitypub")}
        >
          ActivityPub
        </a>
        <a
          role="tab"
          className={`tab ${activeTab === "backup" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("backup")}
        >
          Backup
        </a>
      </div>

      <div className="bg-base-100 p-6 rounded-b-box border-x border-b border-base-300 min-h-[400px]">
        {activeTab === "system" && (
          <div className="space-y-6">
            <h3 className="font-bold text-lg">System Maintenance</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="card bg-base-200 border border-white/5">
                <div className="card-body">
                  <h2 className="card-title text-accent">
                    <RefreshCw /> Cleanup
                  </h2>
                  <p className="opacity-70 text-sm">
                    Check reachability of all registered sites on GunDB and
                    remove dead entries.
                  </p>
                  <div className="card-actions justify-end mt-4">
                    <button
                      className="btn btn-accent btn-outline"
                      onClick={() => handleSystemAction("cleanup")}
                    >
                      Network Cleanup
                    </button>
                  </div>
                </div>
              </div>

              <div className="card bg-base-200 border border-white/5">
                <div className="card-body">
                  <h2 className="card-title text-primary">
                    <Save /> Consolidate
                  </h2>
                  <p className="opacity-70 text-sm">
                    Rename physical files to "Artist - Title" format based on database tags.
                  </p>
                  <div className="card-actions justify-end mt-4">
                    <button
                      className="btn btn-primary btn-outline"
                      onClick={() => handleSystemAction("consolidate")}
                    >
                      Consolidate Files
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}


        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">User Management</h3>
              <button
                className="btn btn-sm btn-primary"
                onClick={() =>
                  document.dispatchEvent(
                    new CustomEvent("open-admin-user-modal"),
                  )
                }
              >
                Add User
              </button>
            </div>
            <AdminUsersList />
          </div>
        )}



        {activeTab === "settings" && <AdminSettingsPanel />}
        {activeTab === "identity" && <IdentityPanel isAdmin={adminUser?.isAdmin} />}
        {activeTab === "activitypub" && <ActivityPubPanel />}
        {activeTab === "backup" && <BackupPanel />}
      </div>

      <AdminUserModal
        onUserUpdated={() =>
          window.dispatchEvent(new CustomEvent("refresh-admin-users"))
        }
      />
      {/* AdminTrackModal removed - handled globally in MainLayout */}
      {/* PlaylistModal removed - handled globally in MainLayout */}
    </div>
  );
};

const AdminSettingsPanel = () => {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  useEffect(() => {
    API.getSiteSettings().then(setSettings).catch(console.error);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setLoading(true);
    setMessage("");
    try {
      await API.updateSettings(settings);

      if (bgFile) {
        await API.uploadBackgroundImage(bgFile);
      }
      if (coverFile) {
        await API.uploadSiteCover(coverFile);
      }

      setMessage("Settings saved successfully.");
      setBgFile(null);
      setCoverFile(null);
      // Refresh settings to get new bg url if needed
      API.getSiteSettings().then(setSettings);
    } catch (e) {
      console.error(e);
      setMessage("Failed to save settings.");
    } finally {
      setLoading(false);
    }
  };

  if (!settings)
    return (
      <div className="p-8 text-center opacity-50">Loading settings...</div>
    );

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      <h3 className="font-bold text-lg">Site Settings</h3>

      <div className="form-control">
        <label className="label">
          <span className="label-text">Site Name</span>
        </label>
        <input
          type="text"
          className="input input-bordered"
          value={settings.siteName}
          onChange={(e) =>
            setSettings({ ...settings, siteName: e.target.value })
          }
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">Description</span>
        </label>
        <textarea
          className="textarea textarea-bordered h-24"
          value={settings.siteDescription || ""}
          onChange={(e) =>
            setSettings({ ...settings, siteDescription: e.target.value })
          }
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">
            Public URL (for ActivityPub & GunDB)
          </span>
          <span className="label-text-alt opacity-50">
            Example: https://sudorecords.scobrudot.dev
          </span>
        </label>
        <input
          type="url"
          className="input input-bordered"
          value={settings.publicUrl || ""}
          onChange={(e) =>
            setSettings({ ...settings, publicUrl: e.target.value })
          }
          placeholder="https://your-site.com"
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">Background Image URL</span>
        </label>
        <input
          type="text"
          className="input input-bordered"
          value={settings.backgroundImage || ""}
          onChange={(e) =>
            setSettings({ ...settings, backgroundImage: e.target.value })
          }
          placeholder="/images/bg.jpg"
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">Upload Background</span>
        </label>
        <input
          type="file"
          className="file-input file-input-bordered w-full"
          accept="image/*"
          onChange={(e) => setBgFile(e.target.files ? e.target.files[0] : null)}
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">Site Cover (Network List Image)</span>
          <span className="label-text-alt opacity-50">
            Displayed on other nodes
          </span>
        </label>
        <input
          type="file"
          className="file-input file-input-bordered w-full"
          accept="image/*"
          onChange={(e) =>
            setCoverFile(e.target.files ? e.target.files[0] : null)
          }
        />
      </div>

      <div className="form-control">
        <label className="label cursor-pointer justify-start gap-4">
          <span className="label-text">Allow Public Registration</span>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={settings.allowPublicRegistration || false}
            onChange={(e) =>
              setSettings({
                ...settings,
                allowPublicRegistration: e.target.checked,
              })
            }
          />
        </label>
      </div>

      <div className="pt-4">
        {message && (
          <div
            className={`mb-4 text-sm ${message.includes("Failed") ? "text-error" : "text-success"}`}
          >
            {message}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary gap-2"
          disabled={loading}
        >
          <Save size={16} /> Save Changes
        </button>
      </div>
    </form>
  );
};

// Sub-components for Admin Tabs (Internal for now)
const AdminUsersList = () => {
  const [users, setUsers] = useState<any[]>([]);

  const loadUsers = () => API.getUsers().then(setUsers).catch(console.error);

  useEffect(() => {
    loadUsers();
    window.addEventListener("refresh-admin-users", loadUsers);
    return () => window.removeEventListener("refresh-admin-users", loadUsers);
  }, []);

  const handleDelete = async (id: string, username: string) => {
    if (
      !confirm(
        `Are you sure you want to delete user ${username}? This cannot be undone.`,
      )
    )
      return;
    try {
      await API.deleteUser(id);
      loadUsers();
    } catch (e) {
      console.error(e);
      alert("Failed to delete user");
    }
  };

  if (users.length === 0)
    return <div className="opacity-50 text-center py-4">No users found.</div>;

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Role</th>
          <th>Linked Artist</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
            <td className="font-bold">{u.username}</td>
            <td>
              {u.isAdmin ? (
                <span className="badge badge-primary badge-outline">Admin</span>
              ) : (
                <span className="badge badge-ghost">User</span>
              )}
              {u.is_active === 0 && (
                <span className="badge badge-error ml-2">Disabled</span>
              )}
            </td>
            <td className="opacity-70">
              {u.artist_id ? (
                <span className="flex items-center gap-1">
                  <User size={12} /> {u.artist_name || "Linked"}
                </span>
              ) : (
                "-"
              )}
            </td>
            <td className="opacity-50">
              {new Date(u.createdAt).toLocaleDateString()}
            </td>
            <td className="flex gap-2">
              <button
                className="btn btn-xs btn-ghost"
                onClick={() =>
                  document.dispatchEvent(
                    new CustomEvent("open-admin-user-modal", { detail: u }),
                  )
                }
              >
                Edit
              </button>
              <button
                className="btn btn-xs btn-ghost text-error"
                onClick={() => handleDelete(u.id, u.username)}
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
                onClick={() => navigate(`/admin/release/${r.id}/edit`)}
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

export default Admin;
