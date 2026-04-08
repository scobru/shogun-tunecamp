import TorrentSearchApi from 'torrent-search-api';

async function test() {
    console.log("Enabling public providers...");
    TorrentSearchApi.enablePublicProviders();
    
    // Explicitly enable some others
    try { TorrentSearchApi.enableProvider('1337x'); } catch(e) {}
    try { TorrentSearchApi.enableProvider('ThePirateBay'); } catch(e) {}
    
    const active = TorrentSearchApi.getActiveProviders().map(p => p.name);
    console.log("Active providers:", active);
    
    console.log("Searching for 'nirvana' in 'Music'...");
    let results = await TorrentSearchApi.search('nirvana', 'Music', 10);
    console.log(`Music Results: ${results.length}`);
    
    if (results.length === 0) {
        console.log("Searching for 'nirvana' in 'All'...");
        results = await TorrentSearchApi.search('nirvana', 'All', 10);
        console.log(`All Results: ${results.length}`);
    }
    
    if (results.length > 0) {
        console.log("First result:", results[0].title);
    }
}

test();
