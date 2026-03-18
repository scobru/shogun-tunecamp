From `src/server/routes/metadata.ts`:
```typescript
                if (dir && await fs.pathExists(dir)) {
                    const dest = path.join(dir, "cover.jpg");

                    const response = await fetch(coverUrl);
                    if (response.ok) {
                        const buffer = await response.buffer();
                        await fs.writeFile(dest, buffer);
                        console.log(`Downloaded cover to ${dest}`);

                        // Update DB
                        database.updateAlbumCover(albumId, dest);
                        coverUpdated = true;
                    }
                }
```
Here, `dest` is an absolute path (`path.join(dir, "cover.jpg")` where `dir` comes from `album.cover_path` or `tracks[0].file_path` which might be absolute if `tracks[0].file_path` is absolute... wait, `tracks[0].file_path` is supposed to be relative to `musicDir`. But `dir = path.dirname(tracks[0].file_path)` returns a relative path if `file_path` is relative. Wait, if `dir` is relative, `dest` is relative... but wait, `fs.pathExists(dir)` is checking the relative path against `process.cwd()`. This is definitely a bug in `metadata.ts`!
Wait, `dir` might be relative to `musicDir`, but `fs.pathExists(dir)` expects an absolute path or relative to `cwd`.
If `dir` is relative to `musicDir`, `pathExists(dir)` might fail unless `cwd` is `musicDir`, which is not necessarily true.
Wait, let's look closer at `metadata.ts`:
```typescript
                const tracks = database.getTracks(albumId);
                let dir = "";
                if (tracks.length > 0 && tracks[0].file_path) {
                    dir = path.dirname(tracks[0].file_path);
                } else if (album.cover_path) {
                    dir = path.dirname(album.cover_path);
                }

                if (dir && await fs.pathExists(dir)) {
```
If `tracks[0].file_path` is `library/album/track.mp3`, `dir` is `library/album`.
`fs.pathExists(dir)` will check `library/album` from `process.cwd()`. That's a bug in `metadata.ts`!
It should be:
```typescript
                const fullDir = resolveSafePath(musicDir, dir);
                if (fullDir && await fs.pathExists(fullDir)) {
                    const dest = path.join(fullDir, "cover.jpg");
```
And then the DB update should be:
```typescript
                        const dbPath = path.relative(musicDir, dest).replace(/\\/g, "/");
                        database.updateAlbumCover(albumId, dbPath);
```
Ah! So `metadata.ts` was saving an ABSOLUTE path or a bad path to `album.cover_path`?
Yes, `dest` was being saved as an absolute path in `database.updateAlbumCover(albumId, dest)`.
Wait, let's look at `dest`. If `fs.pathExists(dir)` succeeded, it might be because `cwd` is the project root, and `musicDir` is `music`. So `dir` was `music/album`. `dest` was `music/album/cover.jpg`.
Then `database.updateAlbumCover(albumId, dest)` saves `music/album/cover.jpg`.
This is exactly the double-prefix bug!
If the DB has `music/album/cover.jpg`, and then `albums.ts` does `path.join(musicDir, album.cover_path)`, it results in `musicDir + "/music/album/cover.jpg"` -> `/var/music/music/album/cover.jpg`.

Let's fix `src/server/routes/metadata.ts` and `src/server/routes/albums.ts`.

In `metadata.ts`:
1. Fix the directory resolution using `resolveSafePath(musicDir, dir)`.
2. Generate the relative path `const dbPath = path.relative(musicDir, dest).replace(/\\/g, "/");` and save that instead.

In `albums.ts`:
1. Strip `music/` or `/music/` prefixes from `album.cover_path` just in case, or maybe just replace the whole workaround with a clean fallback. Since the DB might still contain broken paths (`music/...`), we need to parse them.
2. But the instructions say: "Path double nesting or absolute paths need to be fixed." And "Clear workaround implemented, but root cause might still need fixing."

So fixing `metadata.ts` is the *root cause*.

Let's check if there are other root causes.
In `src/server/scanner.ts`:
```typescript
            if (config.cover) {
                const absoluteCoverPath = path.resolve(dir, config.cover);
                if (await fs.pathExists(absoluteCoverPath)) {
                    coverPath = this.normalizePath(absoluteCoverPath, musicDir);
                }
            }
```
This is correct. `normalizePath` produces `library/album/cover.jpg`.

Are there any other places `updateAlbumCover` is called?
In `upload.ts`:
```typescript
                // 4. Update database (relative to musicDir)
                if (targetAlbum) {
                    const dbPath = path.relative(musicDir, targetPath).replace(/\\/g, "/");
                    database.updateAlbumCover(targetAlbum.id, dbPath);
```
This looks correct.

So the root cause of the "double prefixing or absolute paths stored in DB" was exactly `metadata.ts`.

Let's fix `metadata.ts` first.
