
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs-extra";

// Set ffmpeg path
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

export class WaveformService {
    /**
     * Generates a waveform data array from an audio file.
     * Returns an array of numbers representing audio peaks.
     * @param inputPath Path to the audio file
     * @param samples Number of samples to generate (default 100)
     */
    static async generateWaveform(inputPath: string, samples: number = 100): Promise<number[]> {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(inputPath)) {
                return reject(new Error(`File not found: ${inputPath}`));
            }

            const data: number[] = [];

            // This is a simplified waveform generation strategy using the 'showwavespic' filter might be too heavy or exact.
            // Instead, we'll use 'volumedetect' or a custom filter chain to read raw audio data.
            // HOWEVER, reading raw PCM data and calculating peaks is the most robust way.

            // Strategy: Convert audio to raw PCM, read stream, calculate RMS/Peaks.
            // For a "visual" waveform (like SoundCloud), we want peaks over time.

            // Let's use a faster, simpler approximation:
            // We can ask ffmpeg to output a custom textual representation or just downmix to a low sample rate 
            // and read every Nth sample.

            // Better approach for speed: use 'loudnorm' or similar to get stats? No, that gives overall stats.

            // Let's try reading raw PCM data.
            // Downsample to something manageable like 4000Hz (low quality but enough for peaks)
            // Mono channel.

            const command = ffmpeg(inputPath)
                .audioFrequency(4000)
                .audioChannels(1)
                .format('s16le'); // Signed 16-bit Little Endian PCM

            const stream = command.pipe();
            
            // We'll calculate peaks by dividing the stream into 'samples' number of buckets.
            // But since we don't know the total length upfront, we'll collect the peaks in a more dynamic way
            // or use a temporary buffer if it's small enough.
            // Actually, for 4000Hz mono, 1 minute is ~480KB. 10 minutes is 4.8MB.
            // The OOM was likely caused by MANY of these requests being active or not GC'd.

            // Let's improve the memory handling by using a simpler accumulation.
            const peaks = new Array(samples).fill(0);
            const bucketSize = 4000 * 2; // Process in chunks of 1 second (4000 samples * 2 bytes)
            let totalBytesRead = 0;
            const chunks: Buffer[] = [];
            let bytesRead = 0;

            stream.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
                bytesRead += chunk.length;
                
                // Safety limit: 100MB of raw PCM is ~3.5 hours of audio at 4000Hz mono.
                // Enough for any reasonable track while protecting memory.
                if (bytesRead > 100 * 1024 * 1024) {
                    console.warn(`[Waveform] Track too large for memory-based waveform, truncating: ${inputPath}`);
                    stream.destroy();
                }
            });

            stream.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const totalSamples = Math.floor(buffer.length / 2);

                if (totalSamples === 0) {
                    return resolve(new Array(samples).fill(0));
                }

                const step = Math.floor(totalSamples / samples);
                const result: number[] = [];

                for (let i = 0; i < samples; i++) {
                    let start = i * step * 2;
                    let max = 0;
                    const windowSize = Math.min(step, 1000);

                    for (let j = 0; j < windowSize; j++) {
                        const offset = start + (j * 2);
                        if (offset + 1 >= buffer.length) break;
                        const val = Math.abs(buffer.readInt16LE(offset));
                        if (val > max) max = val;
                    }

                    result.push(parseFloat((max / 32768).toFixed(4)));
                }

                resolve(result);
            });

            stream.on('error', (err) => {
                console.error("FFmpeg error:", err);
                reject(err);
            });
        });
    }
}
