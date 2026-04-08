import WebTorrent from 'webtorrent';
const client = new WebTorrent({ torrentPort: 6882, dht: { port: 6882 } });

const magnet = 'magnet:?xt=urn:btih:61BEF5B736C3FEFC0C1536BC673876391CFF4920';
client.add(magnet, (t) => {
    console.log('Torrent added!', t.infoHash);
});

setInterval(() => {
    try {
        const statuses = client.torrents.map(t => ({
            infoHash: t.infoHash,
            name: t.name,
            progress: t.progress,
            downloadSpeed: t.downloadSpeed,
            uploadSpeed: t.uploadSpeed,
            numPeers: t.numPeers,
            ready: t.ready,
            files: t.files ? t.files.map(f => f.name) : []
        }));
        console.log('Status count:', statuses.length);
    } catch(e) {
        console.error('Error in status:', e);
    }
}, 1000);

setTimeout(() => { console.log('Done after 15s'); process.exit(0); }, 15000);
