const https = require('https');

const options = {
    hostname: 'sudorecords.scobrudot.dev',
    port: 443,
    path: '/api/albums/10',
    method: 'GET',
    rejectUnauthorized: false
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const album = JSON.parse(data);
            console.log('Album:', album.title);
            album.tracks.forEach(t => {
                console.log(`Track ${t.track_num || '?'}: ${t.title}`);
                console.log(`  file_path: ${t.file_path}`);
                console.log(`  lossless_path: ${t.lossless_path}`);
                console.log(`  format: ${t.format}`);
            });
        } catch (e) {
            console.log('Error parsing JSON:', e.message);
            console.log('Raw data snippet:', data.substring(0, 200));
        }
    });
});

req.on('error', (e) => {
    console.error('Request error:', e.message);
});

req.end();
