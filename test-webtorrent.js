process.on('uncaughtException', (err) => {
  console.log("Uncaught Exception intercepted:", err.message);
});

import WebTorrent from 'webtorrent';
const client = new WebTorrent();

const uri = 'magnet:?xt=urn:btih:61bef5b736c3fefc0c1536bc673876391cff4920';

const t = client.add(uri, { path: './' });

setTimeout(() => {
  console.log("Before destroy, torrents length:", client.torrents.length);
  t.destroy(() => {
    console.log("After destroy, torrents length:", client.torrents.length);
    process.exit(0);
  });
}, 1000);
