process.on('uncaughtException', (err) => {
  console.log("Uncaught Exception intercepted:", err.message);
});

import WebTorrent from 'webtorrent';
const client = new WebTorrent();

const uri = 'magnet:?xt=foo';
client.add(uri);

setTimeout(() => {
  console.log("Alive");
  process.exit(0);
}, 2000);
