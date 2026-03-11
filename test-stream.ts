import https from 'https';
import crypto from 'crypto';

const baseUrl = 'https://sudorecords.scobrudot.dev/rest';
const user = 'admin';
const pass = 'francos88'; // As seen in test-subsonic.ts

function md5(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex');
}

async function requestJson(url: string): Promise<any> {
    const options = { rejectUnauthorized: false };
    return new Promise((resolve, reject) => {
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data); 
                }
            });
        }).on('error', reject);
    });
}

import fs from 'fs';
async function requestStream(url: string, prefix: string): Promise<any> {
    const options = { rejectUnauthorized: false };
    return new Promise((resolve, reject) => {
        https.get(url, options, (res) => {
            const data = {
                prefix: prefix,
                status: res.statusCode,
                headers: res.headers
            };
            fs.appendFileSync('results.json', JSON.stringify(data, null, 2) + '\n');
            res.destroy(); // We don't want to actually download the track
            resolve(res.headers);
        }).on('error', reject);
    });
}


async function run() {
    try {
        const salt = Math.random().toString(36).substring(7);
        const token = md5(pass + salt);
        const authParams = `u=${user}&t=${token}&s=${salt}&v=1.16.1&c=test-cli&f=json`;

        console.log("Fetching random song...");
        const resList = await requestJson(`${baseUrl}/getRandomSongs.view?size=1&${authParams}`);
        const songInfo = resList['subsonic-response'].randomSongs.song[0];
        console.log("Got song:", songInfo);
        
        const trackId = songInfo.id || songInfo['@id'];
        console.log("Using trackId:", trackId);

        console.log(`Fetching stream endpoint...`);
        const streamUrl = `${baseUrl}/stream.view?id=${trackId}&${authParams}`;
        await requestStream(streamUrl, 'stream');

        console.log(`\nFetching download endpoint...`);
        const downloadUrl = `${baseUrl}/download.view?id=${trackId}&${authParams}`;
        await requestStream(downloadUrl, 'download');

    } catch (e) {
        console.error(e);
    }
}

run();
