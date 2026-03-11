import { Routes, Route, Navigate } from "react-router-dom";
import { MainLayout } from "./components/layout/MainLayout";
import {
  Home,
  Albums,
  AlbumDetails,
  Artists,
  ArtistDetails,
  Tracks,
  Stats,
  Search,
  Network,
  Support,
  Playlists,
  PlaylistDetails,
  MyPlaylists,
  MyPlaylistDetails,
  Post,
  AuthCallback,
  Wallet,
  Purchases,
  Profile,
} from "./pages";
import Admin from "./pages/Admin";
import AdminReleaseEditor from "./pages/AdminReleaseEditor";
import Files from "./pages/Files";
import { useAuthStore } from "./stores/useAuthStore";
import { useEffect } from "react";
import { ForcePasswordChangeModal } from "./components/modals/ForcePasswordChangeModal";

/**
 * Guard component: only renders children if the user has admin role.
 * Otherwise redirects to home.
 */
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { role, isAdminAuthenticated } = useAuthStore();
  if (!isAdminAuthenticated || role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function App() {
  const { init, checkAdminAuth } = useAuthStore();

  useEffect(() => {
    init();

    const handleUnauthorized = () => {
      checkAdminAuth(); // Re-check admin auth on 401
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  return (
    <>
      <ForcePasswordChangeModal />
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />

          {/* Library */}
          <Route path="/albums" element={<Albums />} />
          <Route path="/albums/:idOrSlug" element={<AlbumDetails />} />
          <Route path="/artists" element={<Artists />} />
          <Route path="/artists/:idOrSlug" element={<ArtistDetails />} />
          <Route path="/tracks" element={<Tracks />} />

          {/* Features */}
          <Route path="/search" element={<Search />} />
          <Route path="/playlists" element={<Playlists />} />
          <Route path="/playlists/:id" element={<PlaylistDetails />} />
          <Route path="/my-playlists" element={<MyPlaylists />} />
          <Route path="/my-playlists/:id" element={<MyPlaylistDetails />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/post/:slug" element={<Post />} />
          <Route path="/network" element={<Network />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/profile" element={<Profile />} />

          {/* Auth Callback */}
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Admin - Protected: only role='admin' can access */}
          <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
          <Route path="/admin/release/new" element={<AdminGuard><AdminReleaseEditor /></AdminGuard>} />
          <Route
            path="/admin/release/:id/edit"
            element={<AdminGuard><AdminReleaseEditor /></AdminGuard>}
          />
          <Route path="/browser" element={<AdminGuard><Files /></AdminGuard>} />

          {/* Other */}
          <Route path="/support" element={<Support />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
