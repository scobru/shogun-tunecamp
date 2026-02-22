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

export function createBrowserRoutes(musicDir: string): Router {
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

            // Bolt ⚡: Optimized to fetch stats in parallel
            const results = await Promise.all(entries.map(async (entry) => {
                const entryPath = path.join(absPath, entry.name);
                try {
                    const entryStats = await fs.stat(entryPath);
                    const itemRelPath = path.relative(musicDir, entryPath).replace(/\\/g, "/");

                    if (entry.isDirectory()) {
                        return {
                            type: 'directory',
                            data: {
                                name: entry.name,
                                path: itemRelPath,
                                type: "directory",
                                mtime: entryStats.mtime
                            }
                        };
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
                            return { type: 'file', data: { ...item, type: "file" } };
                        } else if (IMAGE_EXTENSIONS.includes(ext)) {
                            return { type: 'image', data: { ...item, type: "image" } };
                        }
                    }
                } catch (e) {
                    // File might have been deleted or inaccessible
                    return null;
                }
                return null;
            }));

            const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);

            const dirs = validResults
                .filter(r => r.type === 'directory')
                .map(r => r.data);

            const files = validResults
                .filter(r => r.type === 'file' || r.type === 'image')
                .map(r => r.data);

            // Reconstruct relative path for response
            const responseRelPath = path.relative(musicDir, absPath).replace(/\\/g, "/");

            // Sort: Directories first, then files
            dirs.sort((a: any, b: any) => a.name.localeCompare(b.name));
            files.sort((a: any, b: any) => a.name.localeCompare(b.name));

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
     * PUT /api/browser
     * Rename a file or directory
     * Body:
     * - oldPath: Relative path from musicDir
     * - newPath: Relative path from musicDir
     */
    router.put("/", async (req, res) => {
        try {
            const { oldPath, newPath } = req.body;

            if (!oldPath || !newPath) {
                return res.status(400).json({ error: "Missing oldPath or newPath" });
            }

            const absOldPath = resolveSafePath(musicDir, oldPath);
            const absNewPath = resolveSafePath(musicDir, newPath);

            // Block invalid paths AND root directory protection
            if (!absOldPath || absOldPath === path.resolve(musicDir)) {
                return res.status(400).json({ error: "Invalid oldPath or root directory protection" });
            }
            if (!absNewPath || absNewPath === path.resolve(musicDir)) {
                return res.status(400).json({ error: "Invalid newPath or root directory protection" });
            }

            if (!(await fs.pathExists(absOldPath))) {
                return res.status(404).json({ error: "Source path not found" });
            }

            if (await fs.pathExists(absNewPath)) {
                return res.status(409).json({ error: "Destination path already exists" });
            }

            await fs.move(absOldPath, absNewPath);
            console.log(`✏️ Renamed via browser: ${oldPath} -> ${newPath}`);

            res.json({ message: "Renamed successfully" });
        } catch (error) {
            console.error("Error renaming path:", error);
            res.status(500).json({ error: "Failed to rename" });
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
