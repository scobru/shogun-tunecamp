1. **Understand the problem**:
   In `src/server/routes/albums.ts`, the cover image for an album is retrieved using `album.cover_path`. Sometimes this path might be double-prefixed with `/music/` (or `music/`) or it could be an absolute path instead of being strictly relative to the `musicDir`.
   There is already a workaround in place:
   ```typescript
            let resolvedPath = path.join(musicDir, album.cover_path);

            // Fix for potential double-prefixing or absolute paths stored in DB
            // If the path implies double nesting (e.g. /music/music/...) or is absolute, try to fix it
            if (!await fs.pathExists(resolvedPath)) {
                // Check if paths behaves like "/music/music/..."
                if (album.cover_path.startsWith("/music/") || album.cover_path.startsWith("music/")) {
                    const stripped = album.cover_path.replace(/^[\/\\]?music[\/\\]/, "");
                    const tryPath = path.join(musicDir, stripped);
                    if (await fs.pathExists(tryPath)) {
                        console.log(`🔧 [Debug] Fixed double path: ${resolvedPath} -> ${tryPath}`);
                        resolvedPath = tryPath;
                    }
                }
                // Fallback: Check if cover_path itself is absolute and exists
                if (path.isAbsolute(album.cover_path) && await fs.pathExists(album.cover_path)) {
                    console.log(`🔧 [Debug] Using absolute path directly: ${album.cover_path}`);
                    resolvedPath = album.cover_path;
                }
            }
   ```
   However, this is only a temporary workaround, and also a potential security risk if `album.cover_path` points to sensitive files outside of `musicDir`. We should ideally replace this block with `resolveSafePath`, which securely resolves relative paths against a root directory, preventing directory traversal attacks.

   Furthermore, `resolveSafePath` properly handles absolute paths and directory traversals (`..`), returning `null` if the path escapes the root directory. However, to maintain the "double prefixing" bug workaround, we should maybe first strip the leading `/music/` or `music/` prefix from `album.cover_path`, or modify how the path is evaluated, and then pass it to `resolveSafePath`. Let's actually check how `resolveSafePath` deals with absolute paths.

2. **Analysis of `resolveSafePath`**:
   ```typescript
export function resolveSafePath(rootDir: string, userPath: string): string | null {
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
  ...
   ```
   If `userPath` is `music/album/cover.jpg` and `rootDir` is `/var/music`, `resolveSafePath` will produce `/var/music/music/album/cover.jpg`.
   If we strip the `music/` prefix if present, we could just do `userPath.replace(/^[\/\\]?music[\/\\]/, "")`.

   But what if `album.cover_path` is an absolute path like `/var/music/album/cover.jpg`?
   In `resolveSafePath`:
   ```typescript
  let relativePath = userPath;
  while (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
    relativePath = relativePath.substring(1);
  }
   ```
   It strips the leading slash, so it becomes `var/music/album/cover.jpg`.
   Then it resolves against `resolvedRoot` (`/var/music`): `/var/music/var/music/album/cover.jpg`. This will likely fail the `pathExists` check.

   So we need to make sure the resolution correctly handles paths that are already absolute or double-prefixed.

   Wait, why are these paths double-prefixed or absolute in the first place?
   It seems when `album.cover_path` is written to the DB, it's occasionally written as `/music/...` instead of just a relative path. This could happen in the scanner or API routes.
   Actually, the best fix for double-nesting is to fix the read path, but it's even better if we fix the `album.cover_path` handling at the root.

   Let's see how `resolveSafePath` is used in `subsonic.ts`:
   ```typescript
        if (imagePath) {
            const fullPath = resolveSafePath(context.musicDir, imagePath);
            if (fullPath) {
                if (await fs.pathExists(fullPath)) {
                    return res.sendFile(fullPath);
                }
            } else {
                 return sendError(res, req, 70, 'Cover art not found'); // Prevent fallback logic
            }
        }
   ```
   It just uses `resolveSafePath`. If `imagePath` is `/var/music/...`, `resolveSafePath` might fail.

   Let's replace the block in `src/server/routes/albums.ts` with a safe resolution, maybe handling the `music/` prefix removal explicitly, and using `resolveSafePath`.

   Wait, the issue states "root cause might still need fixing".
   The root cause is likely in `src/server/scanner.ts` or somewhere else where `cover_path` is written.

   Let's check `src/server/scanner.ts`:
   ```typescript
            // Resolve cover path to be relative to the music root
            let coverPath: string | null = null;
            if (config.cover) {
                const absoluteCoverPath = path.resolve(dir, config.cover);
                if (await fs.pathExists(absoluteCoverPath)) {
                    coverPath = this.normalizePath(absoluteCoverPath, musicDir);
                }
            } else {
                // Try common cover names
                const standardCoverJpg = getStandardCoverFilename("jpg");
                const standardCoverPng = getStandardCoverFilename("png");
                const coverNames = [standardCoverJpg, standardCoverPng, "cover.jpg", "cover.png", "folder.jpg", "folder.png", "artwork/cover.jpg", "artwork/cover.png"];
                for (const name of coverNames) {
                    const p = path.resolve(dir, name);
                    if (await fs.pathExists(p)) {
                        coverPath = this.normalizePath(p, musicDir);
                        break;
                    }
                }
            }
   ```

   And `normalizePath`:
   ```typescript
    private normalizePath(filePath: string, musicDir: string): string {
        return path.relative(musicDir, filePath).replace(/\\/g, "/");
    }
   ```
   If `musicDir` is `/music` and `filePath` is `/music/album/cover.jpg`, `path.relative("/music", "/music/album/cover.jpg")` returns `album/cover.jpg`.
   But what if `musicDir` and `filePath` don't align properly? For example if `filePath` is resolved outside, or if someone manually inputs it?
