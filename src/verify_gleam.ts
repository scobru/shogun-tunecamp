import {
    formatAudioFilename,
    formatAlbumDirectory,
    getStandardCoverFilename
} from "./utils/audioUtils.js";

async function runTests() {
    console.log("Testing Gleam-based naming logic:");

    // formatAudioFilename(trackNum, title, ext)
    const audioName = formatAudioFilename(1, "Song Title", "mp3");
    console.log(`Audio: ${audioName} (expected: 01-song-title.mp3)`);

    // formatAlbumDirectory(artist, album, year?)
    const albumDir = formatAlbumDirectory("The Artist", "The Album");
    console.log(`Album: ${albumDir} (expected: the-artist/the-album)`);

    // getStandardCoverFilename(ext)
    const coverName = getStandardCoverFilename("png");
    console.log(`Cover: ${coverName} (expected: cover.png)`);

    const success = audioName === "01-song-title.mp3" &&
        albumDir === "the-artist/the-album" &&
        coverName === "cover.png";

    if (success) {
        console.log("\n✅ Verification SUCCESS");
    } else {
        console.log("\n❌ Verification FAILED");
    }
}

runTests().catch(console.error);
