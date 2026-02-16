import { Router } from "express";
import fs from "fs-extra";
import path from "path";

const AUDIO_EXTENSIONS = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

/**
 * Robustly resolves a relative path against a root directory, ensuring no traversal.
 * Returns null if the path is invalid, tries to traverse out of root, or contains null bytes.
 */
function resolveSafePath(rootDir: string, userPath: string): string | null {
    // Prevent null byte injection
    if (userPath.indexOf('\0') !== -1) {
        return null;
    }

    const resolvedRoot = path.resolve(rootDir);

    // Normalize user path by removing leading slashes to treat it as relative
    let relativePath = userPath;
    while (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
        relativePath = relativePath.substring(1);
    }

    const absPath = path.resolve(resolvedRoot, relativePath);

    // Check if path is within root
    const relative = path.relative(resolvedRoot, absPath);

    // path.relative returns strings like '..' if outside, or absolute path if different drive
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return null;
    }

    return absPath;
}

export function createBrowserRoutes(musicDir: string) {
    const router = Router();

    /**
     * GET /api/browser
     * List files and folders in a directory
     * Query params:
     * - path: Relative path from musicDir (default: root)
     */
    router.get("/", async (req, res) => {
        try {
            const relPath = (req.query.path as string) || "";
            const absPath = resolveSafePath(musicDir, relPath);

            if (!absPath) {
                return res.status(400).json({ error: "Invalid path" });
            }

            if (!(await fs.pathExists(absPath))) {
                return res.status(404).json({ error: "Path not found" });
            }

            const stats = await fs.stat(absPath);
            if (!stats.isDirectory()) {
                return res.status(400).json({ error: "Not a directory" });
            }

            const entries = await fs.readdir(absPath, { withFileTypes: true });

            const dirs = [];
            const files = [];

            // Reconstruct relative path for response
            const responseRelPath = path.relative(musicDir, absPath).replace(/\\/g, "/");

            for (const entry of entries) {
                const entryPath = path.join(absPath, entry.name);
                const entryStats = await fs.stat(entryPath);

                // Construct relative path for the item
                const itemRelPath = path.relative(musicDir, entryPath).replace(/\\/g, "/");

                if (entry.isDirectory()) {
                    dirs.push({
                        name: entry.name,
                        path: itemRelPath,
                        type: "directory",
                        mtime: entryStats.mtime
                    });
                } else {
                    const ext = path.extname(entry.name).toLowerCase();
                    const item = {
                        name: entry.name,
                        path: itemRelPath,
                        size: entryStats.size,
                        mtime: entryStats.mtime,
                        ext: ext
                    };

                    if (AUDIO_EXTENSIONS.includes(ext)) {
                        files.push({ ...item, type: "file" });
                    } else if (IMAGE_EXTENSIONS.includes(ext)) {
                        files.push({ ...item, type: "image" });
                    }
                }
            }

            // Sort: Directories first, then files
            dirs.sort((a, b) => a.name.localeCompare(b.name));
            files.sort((a, b) => a.name.localeCompare(b.name));

            res.json({
                path: responseRelPath === "" ? "" : responseRelPath, // Empty string for root
                parent: responseRelPath ? path.dirname(responseRelPath).replace(/\\/g, "/") : null,
                entries: [...dirs, ...files]
            });
        } catch (error) {
            console.error("Error listing directory:", error);
            res.status(500).json({ error: "Failed to list directory" });
        }
    });

    /**
     * GET /api/browser/file
     * Stream a file from the music directory
     * Query params:
     * - path: Relative path from musicDir
     */
    router.get("/file", async (req, res) => {
        try {
            const relPath = (req.query.path as string) || "";
            const absPath = resolveSafePath(musicDir, relPath);

            if (!absPath) {
                return res.status(400).json({ error: "Invalid path" });
            }

            if (!(await fs.pathExists(absPath))) {
                return res.status(404).json({ error: "File not found" });
            }

            const stats = await fs.stat(absPath);
            if (!stats.isFile()) {
                return res.status(400).json({ error: "Not a file" });
            }

            res.sendFile(absPath);
        } catch (error) {
            console.error("Error serving file:", error);
            res.status(500).json({ error: "Failed to serve file" });
        }
    });

    /**
     * DELETE /api/browser
     * Delete a file or directory
     * Query params:
     * - path: Relative path from musicDir
     */
    router.delete("/", async (req, res) => {
        try {
            const relPath = (req.query.path as string) || "";
            const absPath = resolveSafePath(musicDir, relPath);

            // Block invalid paths AND root directory deletion
            if (!absPath || absPath === path.resolve(musicDir)) {
                return res.status(400).json({ error: "Invalid path or root directory protection" });
            }

            if (!(await fs.pathExists(absPath))) {
                return res.status(404).json({ error: "Path not found" });
            }

            await fs.remove(absPath);
            console.log(`🗑️ Deleted via browser: ${path.relative(musicDir, absPath)}`);

            res.json({ message: "Deleted successfully" });
        } catch (error) {
            console.error("Error deleting path:", error);
            res.status(500).json({ error: "Failed to delete" });
        }
    });

    return router;
}
