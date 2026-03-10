
import https from 'https';
import crypto from 'crypto';

const baseUrl = 'https://sudorecords.scobrudot.dev/rest';
const user = 'admin';
const pass = 'francos88'; // <--- METTI LA TUA PASSWORD REALE QUI

function md5(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex');
}

async function request(url: string): Promise<any> {
    const options = {
        rejectUnauthorized: false // 🔓 IGNORA ERRORI CERTIFICATO (SOLO PER TEST)
    };

    return new Promise((resolve, reject) => {
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    resolve(data); 
                }
            });
        }).on('error', reject);
    });
}

async function testSubsonic() {
    console.log(`\n🚀 Testing Subsonic API (SSL-Bypass Version)`);
    console.log(`🌍 URL: ${baseUrl}`);
    console.log(`👤 User: ${user}`);

    if (pass === 'LATUAPASSWORD') {
        console.log('⚠️  ERRORE: Devi modificare il file e mettere la tua password reale!');
        return;
    }

    // 1. Test Password Standard
    try {
        console.log('\n--- Test 1: Password Auth (Standard) ---');
        const url = `${baseUrl}/ping.view?u=${user}&p=${pass}&v=1.16.1&c=test-cli&f=json`;
        const res = await request(url);
        console.log('Response:', JSON.stringify(res, null, 2));
    } catch (e: any) {
        console.error('❌ Test 1 failed:', e.message);
    }

    // 2. Test Token/Salt
    try {
        console.log('\n--- Test 2: Token/Salt Auth ---');
        const salt = Math.random().toString(36).substring(7);
        const token = md5(pass + salt);
        const url = `${baseUrl}/ping.view?u=${user}&t=${token}&s=${salt}&v=1.16.1&c=test-cli&f=json`;
        const res = await request(url);
        console.log('Response:', JSON.stringify(res, null, 2));
    } catch (e: any) {
        console.error('❌ Test 2 failed:', e.message);
    }

    // 3. Test Browsing
    try {
        console.log('\n--- Test 3: Get Artists (Indexes) ---');
        const url = `${baseUrl}/getIndexes.view?u=${user}&p=${pass}&v=1.16.1&c=test-cli&f=json`;
        const res = await request(url);
        if (res['subsonic-response']?.status === 'ok') {
            console.log('✅ Auth OK! Libreria accessibile.');
            const indexes = res['subsonic-response'].indexes;
            console.log('Contenuti trovati:', JSON.stringify(indexes, null, 2));
        } else {
            console.log('❌ Subsonic Error:', res['subsonic-response']?.error);
        }
    } catch (e: any) {
        console.error('❌ Test 3 failed:', e.message);
    }
}

testSubsonic();
