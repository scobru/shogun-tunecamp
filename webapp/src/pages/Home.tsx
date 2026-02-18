import { useEffect, useState } from "react";
import API from "../services/api";
import { usePlayerStore } from "../stores/usePlayerStore";
import type { Album } from "../types";
import { Play } from "lucide-react";

export const Home = () => {
  const [recentAlbums, setRecentAlbums] = useState<Album[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const {} = usePlayerStore();

  useEffect(() => {
    const load = async () => {
      try {
        const catalog = await API.getCatalog();
        setRecentAlbums(catalog.recentAlbums || []);
        setStats(catalog.stats || {});
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-4 lg:p-8 space-y-8">
        <div className="space-y-4">
          <div className="skeleton h-32 w-full rounded-3xl"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="skeleton h-24 rounded-box"></div>
          <div className="skeleton h-24 rounded-box"></div>
          <div className="skeleton h-24 rounded-box"></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div
              key={i}
              className="card bg-base-200 border border-white/5 shadow-xl"
            >
              <figure className="aspect-square w-full">
                <div className="skeleton w-full h-full rounded-none"></div>
              </figure>
              <div className="card-body p-4 gap-2">
                <div className="skeleton h-4 w-3/4 rounded"></div>
                <div className="skeleton h-3 w-1/2 rounded opacity-50"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="p-4 lg:p-8">
      <div className="hero min-h-[40vh] rounded-3xl overflow-hidden bg-gradient-to-br from-primary/10 to-secondary/10 mb-12 relative border border-white/5">
        <div className="hero-content text-center text-neutral-content z-10 w-full">
          <div className="max-w-md">
            <h1 className="mb-5 text-5xl font-bold text-white">
              Welcome to TuneCamp
            </h1>
            <p className="mb-5 text-lg opacity-80">
              Your decentralized, self-hosted music streaming server.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                className="btn btn-primary"
                onClick={() =>
                  document
                    .getElementById("recent-releases")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Start Listening
              </button>
              <a href="#/about" className="btn btn-ghost">
                Learn More
              </a>
            </div>
          </div>
        </div>
        {/* Decorative blobs */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-secondary/20 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      <div className="stats stats-vertical lg:stats-horizontal shadow-lg bg-base-200/50 backdrop-blur border border-white/5 w-full mb-12">
        <div className="stat">
          <div className="stat-figure text-primary">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              className="inline-block w-8 h-8 stroke-current"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              ></path>
            </svg>
          </div>
          <div className="stat-title">Albums</div>
          <div className="stat-value text-primary font-mono">
            {stats.albums || 0}
          </div>
          <div className="stat-desc">Curated releases</div>
        </div>

        <div className="stat">
          <div className="stat-figure text-secondary">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              className="inline-block w-8 h-8 stroke-current"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
          </div>
          <div className="stat-title">Tracks</div>
          <div className="stat-value text-secondary font-mono">
            {stats.tracks || 0}
          </div>
          <div className="stat-desc">Audio files</div>
        </div>

        <div className="stat">
          <div className="stat-figure text-accent">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              className="inline-block w-8 h-8 stroke-current"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
              ></path>
            </svg>
          </div>
          <div className="stat-title">Genres</div>
          <div className="stat-value text-accent font-mono">
            {stats.genres || 0}
          </div>
          <div className="stat-desc">Styles & Vibes</div>
        </div>
      </div>

      <div
        id="recent-releases"
        className="flex items-center justify-between mb-6"
      >
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <span className="w-2 h-8 bg-primary rounded-full"></span>
          Recent Releases
        </h2>
        <a href="#/albums" className="btn btn-ghost btn-sm group">
          View All
          <span className="group-hover:translate-x-1 transition-transform">
            →
          </span>
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {recentAlbums.map((album) => {
          if (!album) return null;
          return (
            <div
              key={album.id}
              className="card bg-base-200/50 hover:bg-base-200 border border-transparent hover:border-white/10 transition-all duration-300 shadow-lg hover:shadow-2xl group cursor-pointer"
              onClick={() =>
                (window.location.hash = `#/albums/${album.slug || album.id}`)
              }
            >
              <figure className="aspect-square relative overflow-hidden">
                <img
                  src={API.getAlbumCoverUrl(album.slug || album.id)}
                  alt={album.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                {/* Play overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                  <button
                    className="btn btn-circle btn-lg btn-primary text-white shadow-xl scale-90 hover:scale-105 transition-transform border-none"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        const fullAlbum = await API.getAlbum(album.id);
                        if (
                          fullAlbum &&
                          fullAlbum.tracks &&
                          fullAlbum.tracks.length > 0
                        ) {
                          const { playQueue } = usePlayerStore.getState();
                          playQueue(fullAlbum.tracks, 0);
                        }
                      } catch (error) {
                        console.error("Failed to play album", error);
                      }
                    }}
                  >
                    <Play fill="currentColor" size={32} />
                  </button>
                </div>
              </figure>
              <div className="card-body p-4 gap-1">
                <h3
                  className="card-title text-base font-bold truncate leading-tight"
                  title={album.title}
                >
                  {album.title}
                </h3>
                <p className="text-sm opacity-60 truncate hover:opacity-100 transition-opacity">
                  {album.artistName || album.artist_name}
                </p>
                <div className="card-actions justify-start mt-2">
                  <span className="badge badge-xs badge-neutral">
                    {album.year}
                  </span>
                  <span
                    className={`badge badge-xs ${album.type === "album" ? "badge-secondary" : "badge-primary"} badge-outline`}
                  >
                    {album.type}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
