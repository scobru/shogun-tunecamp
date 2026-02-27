import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/useAuthStore";
import API from "../../services/api";
import {
  Home,
  Search,
  Disc,
  User,
  Music,
  BarChart2,
  Folder,
  Globe,
  LifeBuoy,
  LogIn,
  Settings,
  ListMusic,
  LogOut,
  Heart,
} from "lucide-react";
import clsx from "clsx";

export const Sidebar = () => {
  const location = useLocation();
  const { user, isAuthenticated, isAdminAuthenticated, logout, logoutAdmin } =
    useAuthStore();
  const [siteName, setSiteName] = useState("TuneCamp");

  useEffect(() => {
    API.getSiteSettings()
      .then((s) => {
        if (s.siteName) setSiteName(s.siteName);
      })
      .catch(console.error);
  }, []);

  const handleLogout = () => {
    logout();
    logoutAdmin();
  };

  const isActive = (path: string) =>
    location.pathname === path ||
    (path !== "/" && location.pathname.startsWith(path));

  const NavItem = ({
    to,
    icon: Icon,
    label,
  }: {
    to: string;
    icon: any;
    label: string;
  }) => (
    <li className="tooltip tooltip-right z-50" data-tip={label}>
      <Link
        to={to}
        className={clsx(
          "flex items-center justify-center p-2 rounded-lg transition-colors aspect-square",
          isActive(to)
            ? "bg-primary/10 text-primary active"
            : "hover:bg-base-200",
        )}
      >
        <Icon size={24} />
      </Link>
    </li>
  );

  return (
    <div className="menu p-2 w-20 min-h-full bg-base-100 text-base-content border-r border-white/5 flex flex-col gap-2 pb-28 items-center">
      {/* Brand */}
      <div
        className="flex items-center justify-center p-2 mb-2 tooltip tooltip-right z-50"
        data-tip={siteName}
      >
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
          <Music className="text-white w-6 h-6" />
        </div>
      </div>

      {/* Main Nav */}
      <ul className="menu bg-base-200/50 rounded-box w-full gap-1 p-1 font-medium items-center">
        <NavItem to="/" icon={Home} label="Home" />
        <NavItem to="/search" icon={Search} label="Search" />
        <NavItem to="/network" icon={Globe} label="Network" />
      </ul>

      {/* Library Nav */}
      <div className="w-full h-px bg-white/5 my-2"></div>

      <ul className="menu bg-base-200/50 rounded-box w-full gap-1 p-1 font-medium flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin items-center no-scrollbar">
        <NavItem to="/albums" icon={Disc} label="Albums" />
        <NavItem to="/artists" icon={User} label="Artists" />
        <NavItem to="/tracks" icon={Music} label="Tracks" />
        <NavItem to="/playlists" icon={ListMusic} label="Playlists" />
        {isAuthenticated && (
          <NavItem to="/my-playlists" icon={Heart} label="My Playlists" />
        )}
        <NavItem to="/stats" icon={BarChart2} label="Stats" />
        {isAdminAuthenticated && (
          <NavItem to="/browser" icon={Folder} label="Files" />
        )}
      </ul>

      <ul className="menu bg-base-200/50 rounded-box w-full gap-1 p-1 font-medium mt-auto mb-2 items-center">
        <NavItem to="/support" icon={LifeBuoy} label="Support" />
      </ul>

      {/* User Footer */}
      <div className="flex flex-col items-center gap-3 p-2 border-t border-white/5 w-full">
        {isAuthenticated || isAdminAuthenticated ? (
          <div className="flex flex-col items-center gap-3 w-full">
            <div
              className="avatar placeholder tooltip tooltip-right z-50"
              data-tip={
                user?.alias || (isAdminAuthenticated ? "Admin" : "User")
              }
            >
              <div className="bg-neutral text-neutral-content rounded-full w-10 ring ring-primary ring-offset-base-100 ring-offset-2 cursor-pointer hover:scale-105 transition-transform">
                <span>
                  {(user?.alias || (isAdminAuthenticated ? "A" : "?"))
                    ?.charAt(0)
                    .toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 items-center">
              {isAdminAuthenticated && (
                <Link
                  to="/admin"
                  className="btn btn-ghost btn-sm btn-circle text-primary tooltip tooltip-right z-50"
                  data-tip="Admin Settings"
                >
                  <Settings size={20} />
                </Link>
              )}
              <button
                className="btn btn-ghost btn-sm btn-circle opacity-70 hover:opacity-100 hover:text-error tooltip tooltip-right z-50"
                data-tip="Logout"
                onClick={handleLogout}
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <button
              className="btn btn-primary btn-circle btn-sm tooltip tooltip-right z-50"
              data-tip="Login"
              onClick={() =>
                document.dispatchEvent(new CustomEvent("open-auth-modal"))
              }
            >
              <LogIn size={20} />
            </button>
          </div>
        )}

        {/* Helper for Admin Login if not authenticated */}
        {!isAdminAuthenticated && !isAuthenticated && (
          <button
            onClick={() =>
              document.dispatchEvent(new CustomEvent("open-auth-modal"))
            }
            className="mt-2 opacity-30 hover:opacity-100 flex items-center justify-center tooltip tooltip-right z-50"
            data-tip="Admin Login"
          >
            <Settings size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
