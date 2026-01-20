import { Router } from "express";
import type { DatabaseService } from "../database.js";

export function createPlaylistsRoutes(database: DatabaseService) {
    const router = Router();

    /**
     * GET /api/playlists
     * List all playlists
     */
    router.get("/", (req, res) => {
        try {
            const playlists = database.getPlaylists();
            res.json(playlists);
        } catch (error) {
            console.error("Error getting playlists:", error);
            res.status(500).json({ error: "Failed to get playlists" });
        }
    });

    /**
     * POST /api/playlists
     * Create new playlist
     */
    router.post("/", (req, res) => {
        try {
            const { name, description } = req.body;

            if (!name || typeof name !== "string") {
                return res.status(400).json({ error: "Name is required" });
            }

            const id = database.createPlaylist(name, description);
            res.status(201).json({ id, name, description });
        } catch (error) {
            console.error("Error creating playlist:", error);
            res.status(500).json({ error: "Failed to create playlist" });
        }
    });

    /**
     * GET /api/playlists/:id
     * Get playlist with tracks
     */
    router.get("/:id", (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const playlist = database.getPlaylist(id);

            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
            }

            const tracks = database.getPlaylistTracks(id);

            res.json({
                ...playlist,
                tracks,
            });
        } catch (error) {
            console.error("Error getting playlist:", error);
            res.status(500).json({ error: "Failed to get playlist" });
        }
    });

    /**
     * DELETE /api/playlists/:id
     * Delete playlist
     */
    router.delete("/:id", (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const playlist = database.getPlaylist(id);

            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
            }

            database.deletePlaylist(id);
            res.json({ message: "Playlist deleted" });
        } catch (error) {
            console.error("Error deleting playlist:", error);
            res.status(500).json({ error: "Failed to delete playlist" });
        }
    });

    /**
     * POST /api/playlists/:id/tracks
     * Add track to playlist
     */
    router.post("/:id/tracks", (req, res) => {
        try {
            const playlistId = parseInt(req.params.id, 10);
            const { trackId } = req.body;

            if (!trackId || typeof trackId !== "number") {
                return res.status(400).json({ error: "trackId is required" });
            }

            const playlist = database.getPlaylist(playlistId);
            if (!playlist) {
                return res.status(404).json({ error: "Playlist not found" });
            }

            const track = database.getTrack(trackId);
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            database.addTrackToPlaylist(playlistId, trackId);
            res.json({ message: "Track added to playlist" });
        } catch (error) {
            console.error("Error adding track to playlist:", error);
            res.status(500).json({ error: "Failed to add track" });
        }
    });

    /**
     * DELETE /api/playlists/:id/tracks/:trackId
     * Remove track from playlist
     */
    router.delete("/:id/tracks/:trackId", (req, res) => {
        try {
            const playlistId = parseInt(req.params.id, 10);
            const trackId = parseInt(req.params.trackId, 10);

            database.removeTrackFromPlaylist(playlistId, trackId);
            res.json({ message: "Track removed from playlist" });
        } catch (error) {
            console.error("Error removing track from playlist:", error);
            res.status(500).json({ error: "Failed to remove track" });
        }
    });

    return router;
}
