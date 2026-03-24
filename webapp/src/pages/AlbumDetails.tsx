import { useState, useEffect } from "react";
import API from "../services/api";
import { useParams, Link } from "react-router-dom";
import {
  Play,
  Clock,
  MoreHorizontal,
  Download,
  Unlock,
  ExternalLink,
  Shield,
  Music,
  Wallet,
  CheckCircle2,
  Copyright
} from "lucide-react";
import { usePlayerStore } from "../stores/usePlayerStore";
import { useAuthStore } from "../stores/useAuthStore";
import { usePurchases } from "../hooks/usePurchases";
import { useOwnedNFTs } from "../hooks/useOwnedNFTs";
import { useWalletStore } from "../stores/useWalletStore";

import type { Album } from "../types";
import { Comments } from "../components/Comments";

export const AlbumDetails = () => {
  const { idOrSlug } = useParams();
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const { playTrack } = usePlayerStore();
  const [coverVersion] = useState(Date.now()); // Cache buster
  const { isAdminAuthenticated: isAdmin, user } = useAuthStore();
  const { isPurchased, verifyAndGetCode } = usePurchases();
  const { address, externalAddress, useExternalWallet, isExternalConnected } = useWalletStore();
  const activeAddress = useExternalWallet && isExternalConnected ? externalAddress : address;
  const { ownedNFTs } = useOwnedNFTs(activeAddress);

  const isTrackUnlocked = (track: any) => {
    return isPurchased(track.id) || 
           ownedNFTs.some(n => n.trackId === Number(track.id)) ||
           (user?.artistId && (String(track.artistId) === String(user.artistId) || String(album?.artistId) === String(user.artistId)));
  };

  useEffect(() => {
    if (idOrSlug) {
      API.getAlbum(idOrSlug)
        .then(setAlbum)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [idOrSlug]);

  const [downloadFormat, setDownloadFormat] = useState("mp3");

  const handlePlay = () => {
    if (album?.tracks && album.tracks.length > 0) {
      playTrack(album.tracks[0], album.tracks);
    }
  };

  const handleUnlock = () => {
    if (!album) return;
    document.dispatchEvent(
      new CustomEvent("open-unlock-modal", {
        detail: { albumId: album.id, format: downloadFormat },
      }),
    );
  };

  const handlePromote = async () => {
    if (!album || !confirm("Promote this album to a public release?")) return;
    try {
      await API.promoteToRelease(album.id);
      // Refresh
      API.getAlbum(album.id).then(setAlbum);
    } catch (e) {
      console.error(e);
      alert("Failed to promote");
    }
  };

  // Parse external links safely
  const externalLinks = (() => {
    if (!album?.external_links) return [];
    try {
      return JSON.parse(album.external_links);
    } catch {
      return [];
    }
  })();

  const licenseInfo = (() => {
    if (!album?.license || album.license === 'copyright') return { name: 'All Rights Reserved', url: null };
    
    const mapping: Record<string, { name: string, url: string }> = {
        'cc-by': { name: 'CC BY 4.0 (Attribution)', url: 'https://creativecommons.org/licenses/by/4.0/' },
        'cc-by-sa': { name: 'CC BY-SA 4.0 (ShareAlike)', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
        'cc-by-nc': { name: 'CC BY-NC 4.0 (NonCommercial)', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
        'cc-by-nc-sa': { name: 'CC BY-NC-SA 4.0 (NonCommercial ShareAlike)', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
        'cc-by-nd': { name: 'CC BY-ND 4.0 (NoDerivs)', url: 'https://creativecommons.org/licenses/by-nd/4.0/' },
        'cc-by-nc-nd': { name: 'CC BY-NC-ND 4.0 (NonCommercial NoDerivs)', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
        'public-domain': { name: 'Public Domain / CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' }
    };

    return mapping[album.license] || { name: album.license, url: null };
  })();

  if (loading)
    return <div className="p-12 text-center opacity-50">Loading album...</div>;
  if (!album)
    return <div className="p-12 text-center opacity-50">Album not found.</div>;

  const totalDuration =
    album.tracks?.reduce((acc, t) => acc + t.duration, 0) || 0;
  const hasLossless = album.tracks?.some((t) => t.losslessPath);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-8 items-end md:items-center bg-white p-6 rounded-none border border-black relative overflow-hidden">
        {/* Background Blur */}
        <div className="absolute inset-0 z-0">
          {album.coverImage && (
            <img
              src={API.getAlbumCoverUrl(album.id, coverVersion)}
              className="w-full h-full object-cover opacity-[0.05] blur-3xl scale-110"
            />
          )}
        </div>

        <div className="relative z-10 shrink-0 group">
          <img
            src={API.getAlbumCoverUrl(album.id, coverVersion)}
            alt={album.title}
            className="w-48 h-48 md:w-64 md:h-64 rounded-none shadow-none object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "https://via.placeholder.com/500?text=No+Cover";
            }}
          />
        </div>

        <div className="relative z-10 flex-1 space-y-4">
          <div className="opacity-70 text-sm font-bold tracking-wider uppercase">
            {album.type}
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-none">
            {album.title}
          </h1>
          <div className="text-xl md:text-2xl font-medium opacity-80 flex items-center gap-2">
            {album.artistId ? (
              <Link
                to={`/artists/${album.artist_slug || album.artistSlug || album.artistId}`}
                className="hover:underline"
              >
                {album.artistName || album.artist_name}
              </Link>
            ) : (
              <span>{album.artistName}</span>
            )}
            <span className="opacity-40">•</span>
            <span className="text-base opacity-60 font-mono">{album.year}</span>
            <span className="opacity-40">•</span>
            <span className="text-base opacity-60">
              {album.tracks?.length} songs, {Math.floor(totalDuration / 60)} min
            </span>
          </div>

          <div className="flex flex-wrap gap-3 pt-4 items-center">
            <button
              className="btn bg-black text-white hover:bg-gray-800 border border-black rounded-none btn-lg gap-2 shadow-none hover:scale-105 transition-transform"
              onClick={handlePlay}
            >
              <Play fill="currentColor" /> Play
            </button>

            {(album.download === "free" || album.download === "codes") && (
              <div className="join shadow-none">
                {album.download === "free" && (
                  <a
                    href={`/api/albums/${album.slug || album.id}/download?format=${downloadFormat}`}
                    className="btn bg-white text-black hover:bg-gray-200 border border-black rounded-none btn-lg gap-2 join-item"
                    target="_blank"
                  >
                    <Download size={20} /> Free Download
                  </a>
                )}

                {album.download === "codes" && (
                  <button
                    className="btn bg-white text-black hover:bg-gray-200 border border-black rounded-none btn-lg gap-2 join-item"
                    onClick={handleUnlock}
                  >
                    <Unlock size={20} /> Unlock Download
                  </button>
                )}

                {hasLossless && (
                  <select
                    className="select bg-white text-black border border-black rounded-none select-lg join-item border-l-white/20 focus:outline-none"
                    value={downloadFormat}
                    onChange={(e) => setDownloadFormat(e.target.value)}
                  >
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV (Lossless)</option>
                  </select>
                )}
              </div>
            )}

            {externalLinks.map((link: any, i: number) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                className="btn bg-white text-black border border-black hover:bg-black hover:text-white rounded-none btn-lg gap-2"
              >
                <ExternalLink size={20} /> {link.label}
              </a>
            ))}

            {isAdmin && !album.is_release && (
              <button
                className="btn bg-white text-black border border-black hover:bg-black hover:text-white rounded-none bg-white text-black border border-black hover:bg-black hover:text-white rounded-none btn-lg gap-2"
                onClick={handlePromote}
              >
                <Shield size={20} /> Promote
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tracklist */}
      <div className="overflow-x-auto min-h-[400px]">
        <table className="table w-full">
          <thead>
            <tr className="border-b border-black text-xs uppercase opacity-50">
              <th className="w-12 text-center">#</th>
              <th>Title</th>
              <th className="hidden md:table-cell">Plays</th>
              <th className="w-16 text-right">
                <Clock size={16} />
              </th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {album.tracks?.map((track, i) => {
              if (!track) return null;
              return (
                <tr
                  key={track.id}
                  className="hover:bg-gray-100 group border-b border-black last:border-0 transition-colors"
                >
                  <td className="text-center opacity-50 font-mono w-12 group-hover:text-primary">
                    <span className="group-hover:hidden">{i + 1}</span>
                    <button
                      onClick={() => playTrack(track, album.tracks)}
                      className="hidden group-hover:flex items-center justify-center w-full"
                    >
                      <Play size={12} fill="currentColor" />
                    </button>
                  </td>
                  <td>
                    <div className="font-bold flex items-center gap-2">
                      {track.title}
                      {track.losslessPath ? (
                        <>
                          <span className="badge badge-outline badge-xs opacity-50 font-mono scale-90">
                            MP3
                          </span>
                          <span className="badge badge-secondary badge-outline badge-xs font-mono scale-90">
                            {track.losslessPath.toLowerCase().endsWith(".wav")
                              ? "WAV"
                              : "FLAC"}
                          </span>
                        </>
                      ) : (
                        <span className="badge badge-outline badge-xs opacity-50 font-mono scale-90 uppercase">
                          {track.format || "MP3"}
                        </span>
                      )}
                    </div>
                    <div className="md:hidden text-xs opacity-50">
                      {track.artistName}
                    </div>
                  </td>
                  <td className="hidden md:table-cell opacity-50 text-xs font-mono">
                    {track.playCount?.toLocaleString()}
                  </td>
                  <td className="text-right opacity-50 font-mono text-xs">
                    {new Date(track.duration * 1000)
                      .toISOString()
                      .substr(14, 5)}
                  </td>
                  <td>
                    <div className="dropdown dropdown-end dropdown-hover opacity-0 group-hover:opacity-100 transition-opacity">
                      <label
                        tabIndex={0}
                        className="btn bg-transparent text-black hover:bg-gray-200 rounded-none btn-xs btn-circle"
                      >
                        <MoreHorizontal size={16} />
                      </label>
                      <ul
                        tabIndex={0}
                        className="dropdown-content z-[1] menu p-2 shadow bg-base-300 rounded-box w-52 text-sm border border-black"
                      >
                        <li>
                          {isTrackUnlocked(track) ? (
                            <a
                              onClick={async (e) => {
                                e.preventDefault();
                                if (user?.artistId && (String(track.artistId) === String(user.artistId) || String(album?.artistId) === String(user.artistId))) {
                                  window.open(`/api/tracks/${track.id}/stream`, "_blank");
                                  return;
                                }

                                const code = await verifyAndGetCode(track.id);
                                if (code) {
                                  window.open(
                                    `/api/payments/download/${track.id}?code=${code}`,
                                    "_blank",
                                  );
                                } else {
                                  if (ownedNFTs.some(n => n.trackId === Number(track.id))) {
                                    // NFT owners direct download fallback (no GunDB code generated)
                                    window.open(`/api/tracks/${track.id}/stream`, "_blank");
                                  } else {
                                    alert(
                                      "Download code not found or could not be verified. Please try again or contact support.",
                                    );
                                  }
                                }
                              }}
                            >
                              <CheckCircle2
                                size={16}
                                className="text-success"
                              />{" "}
                              Download (Purchased)
                            </a>
                          ) : album.download === "free" ? (
                            <a
                              href={`/api/albums/${album.slug || album.id}/download?format=${downloadFormat}`}
                              target="_blank"
                            >
                              <Download size={16} className="text-primary" />{" "}
                              Download Track (Free)
                            </a>
                          ) : (
                            <a
                              onClick={(e) => {
                                e.preventDefault();
                                if (
                                  !isAdmin &&
                                  !useAuthStore.getState().isAuthenticated
                                )
                                  return window.dispatchEvent(
                                    new CustomEvent("open-auth-modal"),
                                  );
                                window.dispatchEvent(
                                  new CustomEvent("open-checkout-modal", {
                                    detail: {
                                      track: {
                                        ...track,
                                        albumId: album.id,
                                        artist:
                                          track.artistName ||
                                          (track as any).artist_name ||
                                          album.artistName ||
                                          (album as any).artist_name ||
                                          "Unknown Artist",
                                        priceEth:
                                          (track as any).price !== undefined &&
                                          (track as any).price !== null &&
                                          Number((track as any).price) > 0
                                            ? String((track as any).price)
                                            : album.price !== undefined &&
                                                album.price !== null &&
                                                Number(album.price) > 0
                                              ? String(album.price)
                                              : "0.005",
                                        walletAddress: (album as any).walletAddress,
                                      },
                                    },
                                  }),
                                );
                              }}
                            >
                              <Wallet size={16} className="text-secondary" />{" "}
                              Purchase Track
                            </a>
                          )}
                        </li>
                        {isAdmin && (
                          <li>
                            <a
                              onClick={(e) => {
                                e.preventDefault();
                                document.dispatchEvent(
                                  new CustomEvent("open-admin-track-modal", {
                                    detail: track,
                                  }),
                                );
                              }}
                              className="text-primary font-medium"
                            >
                              <Music size={16} /> Edit Metadata
                            </a>
                          </li>
                        )}
                      </ul>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* License and Footer Info */}
      <div className="bg-white p-6 rounded-none border border-black flex flex-col md:flex-row justify-between items-center gap-4 text-sm opacity-70">
        <div className="flex items-center gap-2">
            <Copyright size={16} />
            <span>
                {licenseInfo.url ? (
                    <a href={licenseInfo.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {licenseInfo.name}
                    </a>
                ) : (
                    licenseInfo.name
                )}
            </span>
        </div>
        <div className="font-mono text-xs">
            Published on Tunecamp • {album.year}
        </div>
      </div>

      {/* Comments */}
      <Comments
        trackId={
          album.tracks && album.tracks.length > 0
            ? String(album.tracks[0].id)
            : undefined
        }
        albumId={String(album.id)}
      />
    </div>
  );
};
