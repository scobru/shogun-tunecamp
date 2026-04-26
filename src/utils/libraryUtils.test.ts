import { LibraryUtils } from './libraryUtils.js';

describe('LibraryUtils.formatAudioFilename', () => {
    test('should format filename with single digit track number', () => {
        expect(LibraryUtils.formatAudioFilename(1, 'Song Title', 'mp3')).toBe('01-song-title.mp3');
    });

    test('should format filename with double digit track number', () => {
        expect(LibraryUtils.formatAudioFilename(12, 'Song Title', 'flac')).toBe('12-song-title.flac');
    });

    test('should format filename with triple digit track number', () => {
        expect(LibraryUtils.formatAudioFilename(123, 'Song Title', 'wav')).toBe('123-song-title.wav');
    });

    test('should omit track number if it is 0 or negative', () => {
        expect(LibraryUtils.formatAudioFilename(0, 'Song Title', 'mp3')).toBe('song-title.mp3');
        expect(LibraryUtils.formatAudioFilename(-1, 'Song Title', 'mp3')).toBe('song-title.mp3');
    });

    test('should slugify the title', () => {
        expect(LibraryUtils.formatAudioFilename(1, 'Song & Title!', 'mp3')).toBe('01-song-title.mp3');
        expect(LibraryUtils.formatAudioFilename(5, 'My Awesome Track 100%', 'ogg')).toBe('05-my-awesome-track-100.ogg');
    });

    test('should handle extensions with dots and different casing', () => {
        expect(LibraryUtils.formatAudioFilename(1, 'Song', '.mp3')).toBe('01-song.mp3');
        expect(LibraryUtils.formatAudioFilename(1, 'Song', 'MP3')).toBe('01-song.mp3');
        expect(LibraryUtils.formatAudioFilename(1, 'Song', '.WAV')).toBe('01-song.wav');
    });
});

describe('LibraryUtils.formatAlbumDirectory', () => {
    test('should format directory path correctly', () => {
        expect(LibraryUtils.formatAlbumDirectory('Artist Name', 'Album Title')).toBe('artist-name/album-title');
    });

    test('should slugify artist and album names', () => {
        expect(LibraryUtils.formatAlbumDirectory('Artist & Co.', 'Best Of! 2023')).toBe('artist-co/best-of-2023');
    });
});

describe('LibraryUtils.getStandardCoverFilename', () => {
    test('should return cover.png for png extension', () => {
        expect(LibraryUtils.getStandardCoverFilename('png')).toBe('cover.png');
        expect(LibraryUtils.getStandardCoverFilename('PNG')).toBe('cover.png');
        expect(LibraryUtils.getStandardCoverFilename('.png')).toBe('cover.png');
    });

    test('should return cover.jpg for other extensions', () => {
        expect(LibraryUtils.getStandardCoverFilename('jpg')).toBe('cover.jpg');
        expect(LibraryUtils.getStandardCoverFilename('jpeg')).toBe('cover.jpg');
        expect(LibraryUtils.getStandardCoverFilename('JPG')).toBe('cover.jpg');
        expect(LibraryUtils.getStandardCoverFilename('webp')).toBe('cover.jpg');
    });
});
