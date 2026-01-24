
import { parseFile } from 'music-metadata';
import path from 'path';

const filePath = 'D:\\shogun-2\\tunecamp\\examples\\homologo\\releases\\fantasie\\tracks\\Homologo_-_Fantasie.wav';

async function run() {
    try {
        const metadata = await parseFile(filePath);
        console.log('Duration:', metadata.format.duration);
        console.log('Format:', metadata.format);
        console.log('Common:', metadata.common);
    } catch (e) {
        console.error('Error:', e);
    }
}

run();
