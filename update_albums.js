import fs from "fs";

const file = "src/server/routes/albums.ts";
let content = fs.readFileSync(file, "utf-8");

if (!content.includes("resolveSafePath")) {
    content = content.replace(
        `import { getPlaceholderSVG } from "../../utils/audioUtils.js";`,
        `import { getPlaceholderSVG } from "../../utils/audioUtils.js";\nimport { resolveSafePath } from "../../utils/fileUtils.js";`
    );
}

const oldStr = `            // Verify file existence
            let resolvedPath = path.join(musicDir, album.cover_path);

            // Fix for potential double-prefixing or absolute paths stored in DB
            // If the path implies double nesting (e.g. /music/music/...) or is absolute, try to fix it
            if (!await fs.pathExists(resolvedPath)) {
                // Check if paths behaves like "/music/music/..."
                if (album.cover_path.startsWith("/music/") || album.cover_path.startsWith("music/")) {
                    const stripped = album.cover_path.replace(/^[\\/\\\\]?music[\\/\\\\]/, "");
                    const tryPath = path.join(musicDir, stripped);
                    if (await fs.pathExists(tryPath)) {
                        console.log(\`🔧 [Debug] Fixed double path: \${resolvedPath} -> \${tryPath}\`);
                        resolvedPath = tryPath;
                    }
                }
                // Fallback: Check if cover_path itself is absolute and exists
                if (path.isAbsolute(album.cover_path) && await fs.pathExists(album.cover_path)) {
                    console.log(\`🔧 [Debug] Using absolute path directly: \${album.cover_path}\`);
                    resolvedPath = album.cover_path;
                }
            }

            console.log(\`🖼️ [Debug] Serving album cover: \${resolvedPath}\`);
            if (!await fs.pathExists(resolvedPath)) {`;

const newStr = `            // Verify file existence
            let resolvedPath = resolveSafePath(musicDir, album.cover_path);

            // Fix for potential double-prefixing or absolute paths stored in DB
            // If the path implies double nesting (e.g. /music/music/...) try to fix it securely
            if (!resolvedPath || !await fs.pathExists(resolvedPath)) {
                // Check if paths behaves like "/music/music/..."
                if (album.cover_path.startsWith("/music/") || album.cover_path.startsWith("music/")) {
                    const stripped = album.cover_path.replace(/^[\\/\\\\]?music[\\/\\\\]/, "");
                    const tryPath = resolveSafePath(musicDir, stripped);
                    if (tryPath && await fs.pathExists(tryPath)) {
                        console.log(\`🔧 [Debug] Fixed double path: \${album.cover_path} -> \${tryPath}\`);
                        resolvedPath = tryPath;
                    }
                }

                // Fallback: Check if cover_path itself is absolute and exists securely within musicDir
                if ((!resolvedPath || !await fs.pathExists(resolvedPath)) && path.isAbsolute(album.cover_path)) {
                    // Check if it's securely inside musicDir
                    const relative = path.relative(path.resolve(musicDir), album.cover_path);
                    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
                        if (await fs.pathExists(album.cover_path)) {
                            console.log(\`🔧 [Debug] Using absolute path securely: \${album.cover_path}\`);
                            resolvedPath = album.cover_path;
                        }
                    }
                }
            }

            console.log(\`🖼️ [Debug] Serving album cover: \${resolvedPath}\`);
            if (!resolvedPath || !await fs.pathExists(resolvedPath)) {`;

if (content.indexOf(oldStr) === -1) {
  console.log("Could not find block. Trying more flexible replacement.");
} else {
  content = content.replace(oldStr, newStr);
  fs.writeFileSync(file, content);
  console.log("Updated albums.ts successfully.");
}
