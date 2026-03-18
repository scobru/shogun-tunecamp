const fs = require('fs');

let dbFile = fs.readFileSync('src/server/database.ts', 'utf8');

if (!dbFile.includes('updatePostVisibility(id: number, visibility:')) {
    dbFile = dbFile.replace(
        "updatePost(id: number, content: string, visibility?: 'public' | 'private' | 'unlisted'): void;",
        "updatePost(id: number, content: string, visibility?: 'public' | 'private' | 'unlisted'): void;\n    updatePostVisibility(id: number, visibility: 'public' | 'private' | 'unlisted'): void;"
    );

    dbFile = dbFile.replace(
        "updatePost(id: number, content: string, visibility?: 'public' | 'private' | 'unlisted'): void {",
        "updatePostVisibility(id: number, visibility: 'public' | 'private' | 'unlisted'): void {\n            const publishedAt = visibility === 'public' || visibility === 'unlisted' ? new Date().toISOString() : null;\n            if (publishedAt) {\n                db.prepare(\"UPDATE posts SET visibility = ?, published_at = ? WHERE id = ?\").run(visibility, publishedAt, id);\n            } else {\n                db.prepare(\"UPDATE posts SET visibility = ? WHERE id = ?\").run(visibility, id);\n            }\n        },\n\n        updatePost(id: number, content: string, visibility?: 'public' | 'private' | 'unlisted'): void {"
    );

    fs.writeFileSync('src/server/database.ts', dbFile);
    console.log('Patched database.ts');
} else {
    console.log('Already patched');
}
