const fs = require('fs');
let content = fs.readFileSync('src/server/routes/activitypub.ts', 'utf8');

if (content.includes("db.updatePost(post.id, post.content, 'private');")) {
    content = content.replace(
        "db.updatePost(post.id, post.content, 'private');",
        "db.updatePostVisibility(post.id, 'private');"
    );
    fs.writeFileSync('src/server/routes/activitypub.ts', content);
    console.log("Patched activitypub.ts");
} else {
    console.log("Not found or already patched");
}
