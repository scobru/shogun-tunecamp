import WebTorrent from 'webtorrent';
const client = new WebTorrent();
const t = client.add('magnet:?xt=urn:btih:4C59AB02ABE586374D2A9C18012C78D940828FD1&dn=Nirvana%20-%20Nevermind%20(1991)');
console.log('Synchronous infoHash:', t.infoHash);
client.destroy();
