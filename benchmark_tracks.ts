import { performance } from "perf_hooks";

const mapTrack = (t: any) => ({
    ...t,
    albumId: t.album_id,
    artistId: t.artist_id,
    losslessPath: t.lossless_path,
    externalArtwork: t.external_artwork,
    albumName: t.album_title,
    albumDownload: t.album_download,
    albumVisibility: t.album_visibility,
    albumPrice: t.album_price,
    artistName: t.artist_name,
    path: t.file_path,
    filename: t.file_path ? t.file_path + "_filename" : undefined
});

function generateTracks(count: number, startId = 0) {
    const tracks = [];
    for (let i = 0; i < count; i++) {
        tracks.push({
            id: startId + i,
            album_id: i % 10,
            artist_id: i % 5,
            lossless_path: "lossless/path/" + i,
            external_artwork: "artwork/" + i,
            album_title: "Album " + i,
            album_download: true,
            album_visibility: "public",
            album_price: 10,
            artist_name: "Artist " + i,
            file_path: "file/path/" + i,
            extra_field_1: "data1",
            extra_field_2: "data2",
            extra_field_3: "data3",
        });
    }
    return tracks;
}

const myTracksRaw = generateTracks(100, 0); // IDs 0-99
const publicTracksRaw = generateTracks(10000, 50); // IDs 50-10049, overlap is 50-99 (50 tracks)

function runBaseline() {
    const myTracks = myTracksRaw.map(mapTrack);
    const publicTracks = publicTracksRaw.map(mapTrack);
    const seenIds = new Set(myTracks.map(t => t.id));
    const combined = [...myTracks];
    for (const t of publicTracks) {
        if (!seenIds.has(t.id)) {
            combined.push(t);
        }
    }
    return combined.length;
}

function runOptimized() {
    const myTracks = myTracksRaw.map(mapTrack);
    const seenIds = new Set(myTracksRaw.map(t => t.id));
    const combined = [...myTracks];
    for (const t of publicTracksRaw) {
        if (!seenIds.has(t.id)) {
            combined.push(mapTrack(t));
        }
    }
    return combined.length;
}

console.log("Warming up...");
for(let i=0; i<100; i++) { runBaseline(); runOptimized(); }

let start = performance.now();
for (let i = 0; i < 1000; i++) {
    runBaseline();
}
let end = performance.now();
console.log(`Baseline: ${end - start} ms`);

start = performance.now();
for (let i = 0; i < 1000; i++) {
    runOptimized();
}
end = performance.now();
console.log(`Optimized: ${end - start} ms`);
