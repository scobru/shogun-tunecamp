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
  Profile,
  MyMusic,
  About,
  SharePage,
  ContentSearch,
} from "./pages";
import Admin from "./pages/Admin";
import AdminReleaseEditor from "./pages/AdminReleaseEditor";
import Files from "./pages/Files";
import { useAuthStore } from "./stores/useAuthStore";
import { useEffect } from "react";
import { ForcePasswordChangeModal } from "./components/modals/ForcePasswordChangeModal";

/**
 * Guard component: only renders children if the user has correct role.
 * Otherwise redirects to home.
 */
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, role } = useAuthStore();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  // Allow if user is explicitly a Root Admin OR if they have the 'admin' role
  if (!isAuthenticated || (!user?.isRootAdmin && role !== 'admin')) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function EditorGuard({ children }: { children: React.ReactNode }) {
  const { role, isAuthenticated, isLoading } = useAuthStore();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (!isAuthenticated || (role !== 'admin' && role !== 'user')) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function App() {
  const { init, checkAuth } = useAuthStore();

  useEffect(() => {
    init();

    const handleUnauthorized = () => {
      checkAuth(); // Re-check auth on 401
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
          <Route path="/about" element={<About />} />

          {/* Library */}
          <Route path="/albums" element={<Albums />} />
          <Route path="/albums/:idOrSlug" element={<AlbumDetails />} />
          <Route path="/releases/:idOrSlug" element={<AlbumDetails />} />
          <Route path="/artists" element={<Artists />} />
          <Route path="/artists/:idOrSlug" element={<ArtistDetails />} />
          <Route path="/tracks" element={<Tracks />} />

          {/* Features */}
          <Route path="/search" element={<Search />} />
          <Route path="/playlists" element={<Playlists />} />
          <Route path="/playlists/:id" element={<PlaylistDetails />} />
          <Route path="/my-playlists" element={<MyPlaylists />} />
          <Route path="/my-playlists/:id" element={<MyPlaylistDetails />} />
          {/* Purchased tracks view is now in the User Profile Collection tab */}
          <Route path="/post/:slug" element={<Post />} />
          <Route path="/network" element={<Network />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/my-music" element={<MyMusic />} />
          <Route path="/share/:id" element={<SharePage />} />

          {/* Auth Callback */}
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Admin - Protected: only role='admin' can access */}
          <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
          <Route path="/admin/release/new" element={<EditorGuard><AdminReleaseEditor /></EditorGuard>} />
          <Route
            path="/admin/release/:id/edit"
            element={<EditorGuard><AdminReleaseEditor /></EditorGuard>}
          />
          <Route path="/browser" element={<AdminGuard><Files /></AdminGuard>} />

          <Route path="/search/content" element={<AdminGuard><ContentSearch /></AdminGuard>} />

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
