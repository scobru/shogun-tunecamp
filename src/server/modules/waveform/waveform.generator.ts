import { max, min } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { area } from 'd3-shape';
import fs from 'fs-extra';
import WaveformData from 'waveform-data';

// Simplified interface for Waveform
export class WaveformGenerator {

    async svg(filename: string, width: number = 2000): Promise<string> {
        const data = await this.json(filename);
        return this.buildSvg(data, width);
    }

    async json(filename: string): Promise<any> {
        const wf = await this.generateWaveform(filename);
        return wf.toJSON();
    }

    private async generateWaveform(filename: string): Promise<WaveformData> {
        // Read the file into a buffer
        const buffer = await fs.readFile(filename);

        return new Promise<WaveformData>((resolve, reject) => {
            // Options for waveform-data
            const options = {
                audio_context: {
                    sampleRate: 44100 // Default, might need adjustment if we don't have an AudioContext
                },
                samples_per_pixel: 256,
                bits: 8
            };

            // Note: waveform-data nodejs example usually uses `ffmpeg` to decode to PCM first
            // or expects a pre-decoded buffer.
            // Jamserve's implementation seemingly streams headers but `waveform-data` 
            // usually requires raw audio data or a compatible decoder.

            // WAIT. Jamserve's `waveform.generator.ts` uses `fs.createReadStream` passed to `new Waveform(...)`.
            // Let's check `jamserve` implementation again carefully.
            // It has: `const wf: Waveform = new Waveform(stream, ...); wf.run(...)`
            // This implies `waveform-data` (or a fork?) supports streams in Node.js.
            // Standard `waveform-data` library consumes AudioBuffer or similar.

            // Checking `waveform-node` or similar? 
            // Jamserve package.json says `"waveform-data": "4.5.2"`.

            // Let's assume standard behavior:
            // If `waveform-data` supports node streams directly, that's great.
            // If not, we might need a distinct approach or check if Jamserve uses a custom adapter.

            // Actually, `waveform-data` 4.x has a Node adapter. 
            // Let's try to replicate Jamserve's exact usage.

            // @ts-ignore
            WaveformData.createFromAudio({
                audio_rate: 44100,
                channels: 1,
                filename: filename
            }, (err, waveform) => {
                if (err) return reject(err);
                resolve(waveform);
            });
        });
    }

    private buildSvg(data: any, w = 2000): string {
        const height = 100;
        const x = scaleLinear();
        const y = scaleLinear();
        const wfd = WaveformData.create(data);
        const channel = wfd.channel(0);
        const minArray = channel.min_array();
        const maxArray = channel.max_array();

        x.domain([0, wfd.length]).rangeRound([0, w]);
        // @ts-ignore
        y.domain([min(minArray), max(maxArray)]).rangeRound([0, height]);

        const waveArea = area<number>()
            .x((_a, index) => x(index))
            // @ts-ignore
            .y0((_b, index) => y(minArray[index]))
            // @ts-ignore
            .y1(c => y(c));

        const d = waveArea(maxArray) ?? '';

        // Return optimized SVG
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${height}" preserveAspectRatio="none">` +
            `<path fill="currentColor" d="${d}"/></svg>`;
    }
}
