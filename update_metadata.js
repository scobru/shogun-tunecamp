import fs from "fs";

const file = "src/server/routes/metadata.ts";
let content = fs.readFileSync(file, "utf-8");

if (!content.includes("resolveSafePath")) {
    content = content.replace(
        `import { isSafeUrl } from "../../utils/networkUtils.js";`,
        `import { isSafeUrl } from "../../utils/networkUtils.js";\nimport { resolveSafePath, getRelativePath } from "../../utils/fileUtils.js";`
    );
}

content = content.replace(
    `                if (dir && await fs.pathExists(dir)) {
                    const dest = path.join(dir, "cover.jpg");

                    const response = await fetch(coverUrl);
                    if (response.ok) {
                        const buffer = await response.buffer();
                        await fs.writeFile(dest, buffer);
                        console.log(\`Downloaded cover to \${dest}\`);

                        // Update DB
                        database.updateAlbumCover(albumId, dest);
                        coverUpdated = true;
                    }
                }`,
    `                if (dir) {
                    const fullDir = resolveSafePath(musicDir, dir);
                    if (fullDir && await fs.pathExists(fullDir)) {
                        const dest = path.join(fullDir, "cover.jpg");

                        const response = await fetch(coverUrl);
                        if (response.ok) {
                            const buffer = await response.buffer();
                            await fs.writeFile(dest, buffer);
                            console.log(\`Downloaded cover to \${dest}\`);

                            // Update DB
                            const dbPath = getRelativePath(musicDir, dest);
                            database.updateAlbumCover(albumId, dbPath);
                            coverUpdated = true;
                        }
                    }
                }`
);

fs.writeFileSync(file, content);
console.log("Updated metadata.ts");
