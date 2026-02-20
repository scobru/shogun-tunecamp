import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock fluent-ffmpeg
const mockFfmpegInstance: any = {
    outputOptions: jest.fn().mockReturnThis(),
    save: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation(((event: any, callback: any) => {
        if (event === 'end') {
            setTimeout(callback, 10);
        }
        return mockFfmpegInstance;
    }) as any),
};

const mockFfmpeg = jest.fn(() => mockFfmpegInstance);
// @ts-ignore
mockFfmpeg.setFfmpegPath = jest.fn();
// @ts-ignore
mockFfmpeg.setFfprobePath = jest.fn();
// @ts-ignore
mockFfmpeg.ffprobe = jest.fn();

jest.unstable_mockModule('fluent-ffmpeg', () => ({
    __esModule: true,
    default: mockFfmpeg,
}));

// Mock fs-extra
const mockFs = {
    move: jest.fn(),
    remove: jest.fn().mockImplementation(() => Promise.resolve()),
    existsSync: jest.fn(),
    statSync: jest.fn().mockReturnValue({ size: 1000 }),
};

jest.unstable_mockModule('fs-extra', () => ({
    __esModule: true,
    default: mockFs
}));

// @ts-ignore
const { writeMetadata } = await import('./ffmpeg.js');

describe('ffmpeg.ts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('writeMetadata', () => {
        it('should call ffmpeg with correct arguments for FLAC', async () => {
            const filePath = '/path/to/song.flac';
            const metadata = {
                title: 'Test Title',
                artist: 'Test Artist',
                album: 'Test Album',
                track: '1'
            };

            await writeMetadata(filePath, metadata);

            expect(mockFfmpeg).toHaveBeenCalledWith(filePath);

            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-c', 'copy');
            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-map_metadata', '0');
            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-metadata', 'title=Test Title');
            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-metadata', 'artist=Test Artist');
            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-metadata', 'album=Test Album');
            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-metadata', 'track=1');

            expect(mockFfmpegInstance.save).toHaveBeenCalled();
        });

        it('should handle partial metadata', async () => {
            const filePath = '/path/to/song.ogg';
            const metadata = {
                title: 'Just Title'
            };

            await writeMetadata(filePath, metadata);

            expect(mockFfmpegInstance.outputOptions).toHaveBeenCalledWith('-metadata', 'title=Just Title');

            const calls = mockFfmpegInstance.outputOptions.mock.calls;
            const artistCall = calls.find((call: any[]) => call[0] === '-metadata' && typeof call[1] === 'string' && call[1].startsWith('artist='));
            expect(artistCall).toBeUndefined();
        });
    });
});
