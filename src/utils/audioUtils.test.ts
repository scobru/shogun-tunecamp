import { expect, test, mock } from "bun:test";

// Mock music-metadata before importing audioUtils
mock.module("music-metadata", () => ({
  parseFile: () => Promise.resolve({}),
}));

// Use dynamic import to ensure the mock is applied before audioUtils is loaded
// Also use .js extension to satisfy TSC requirements
const { getAudioFormat } = await import('./audioUtils.js');

test('getAudioFormat - known extensions', () => {
  expect(getAudioFormat('test.mp3')).toBe('MP3');
  expect(getAudioFormat('test.flac')).toBe('FLAC');
  expect(getAudioFormat('test.ogg')).toBe('OGG Vorbis');
  expect(getAudioFormat('test.wav')).toBe('WAV');
  expect(getAudioFormat('test.m4a')).toBe('M4A/AAC');
  expect(getAudioFormat('test.aac')).toBe('AAC');
  expect(getAudioFormat('test.opus')).toBe('OPUS');
});

test('getAudioFormat - unknown extensions', () => {
  expect(getAudioFormat('test.wma')).toBe('WMA');
  expect(getAudioFormat('test.XYZ')).toBe('XYZ');
  expect(getAudioFormat('test.mkv')).toBe('MKV');
});

test('getAudioFormat - no extension', () => {
  expect(getAudioFormat('test')).toBe('');
  expect(getAudioFormat('')).toBe('');
});

test('getAudioFormat - dots in path/filename', () => {
  expect(getAudioFormat('my.awesome.song.mp3')).toBe('MP3');
  expect(getAudioFormat('/path.to/file.flac')).toBe('FLAC');
  expect(getAudioFormat('.hidden.ogg')).toBe('OGG Vorbis');
  expect(getAudioFormat('trailing.dot.')).toBe('');
});

test('getAudioFormat - case sensitivity', () => {
  expect(getAudioFormat('test.MP3')).toBe('MP3');
  expect(getAudioFormat('test.FlAc')).toBe('FLAC');
  expect(getAudioFormat('test.oGG')).toBe('OGG Vorbis');
});

test('getAudioFormat - edge cases', () => {
  // @ts-ignore
  expect(getAudioFormat(null)).toBe('');
  // @ts-ignore
  expect(getAudioFormat(undefined)).toBe('');
});
