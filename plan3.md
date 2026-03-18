Plan:
1. In `src/server/routes/metadata.ts`, `dir` is obtained from `tracks[0].file_path` or `album.cover_path`. It represents a relative path within `musicDir`.
   ```typescript
                if (dir) {
                    const fullDir = resolveSafePath(musicDir, dir);
                    if (fullDir && await fs.pathExists(fullDir)) {
                        const dest = path.join(fullDir, "cover.jpg");

                        const response = await fetch(coverUrl);
                        if (response.ok) {
                            const buffer = await response.buffer();
                            await fs.writeFile(dest, buffer);
                            console.log(`Downloaded cover to ${dest}`);

                            // Update DB with a relative path
                            const dbPath = getRelativePath(musicDir, dest);
                            database.updateAlbumCover(albumId, dbPath);
                            coverUpdated = true;
                        }
                    }
                }
   ```
2. In `src/server/routes/albums.ts`, replace the messy fallback logic with `resolveSafePath` but still handle the legacy `music/` prefix if present, as old databases might have it. Actually, the ticket says "Fix for potential double-prefixing or absolute paths stored in DB", and since we're fixing the root cause, maybe we should also improve the read workaround.
   Wait, let's keep the read workaround simple but safer:
   ```typescript
            let resolvedPath = resolveSafePath(musicDir, album.cover_path);

            if (!resolvedPath || !await fs.pathExists(resolvedPath)) {
                // Try fixing the legacy double-prefixing bug
                let tryPath = album.cover_path.replace(/^[\/\\]?music[\/\\]/, "");
                resolvedPath = resolveSafePath(musicDir, tryPath);

                if (!resolvedPath || !await fs.pathExists(resolvedPath)) {
                    // Fallback to absolute paths if for some reason they exist and are within musicDir
                    if (path.isAbsolute(album.cover_path)) {
                        // Check if it's securely inside musicDir
                        const relative = path.relative(path.resolve(musicDir), album.cover_path);
                        if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
                            resolvedPath = album.cover_path;
                        } else {
                            resolvedPath = null;
                        }
                    } else {
                        resolvedPath = null;
                    }
                }
            }

            if (!resolvedPath || !await fs.pathExists(resolvedPath)) {
                console.warn(`⚠️ [Debug] Album cover not found at: ${album.cover_path}`);
                const svg = getPlaceholderSVG(album.title);
                res.setHeader("Content-Type", "image/svg+xml");
                res.setHeader("Cache-Control", "public, max-age=0");
                return res.send(svg);
            }
   ```
   Actually, `resolveSafePath` automatically ignores leading slashes, so `resolveSafePath(musicDir, "/music/album/cover.jpg")` resolves to `/path/to/musicDir/music/album/cover.jpg`.
   If we strip `^[\/\\]?music[\/\\]` then `album/cover.jpg` resolves to `/path/to/musicDir/album/cover.jpg`.

   Let's check `metadata.ts` closely.
