import WebTorrent from 'webtorrent';
const client = new WebTorrent({ torrentPort: 6881, dht: { port: 6881 } });
client.on('error', (err) => console.error('GLOBAL WT ERR:', err));
console.log('Adding torrent...');
const magnet = 'magnet:?xt=urn:btih:61BEF5B736C3FEFC0C1536BC673876391CFF4920';
client.add(magnet, (t) => {
    console.log('Torrent added!', t.infoHash);
});
setTimeout(() => { console.log('Still alive after 15s'); process.exit(0); }, 15000);
