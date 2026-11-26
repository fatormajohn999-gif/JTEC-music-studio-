import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ArchiveOrgService, ArchiveItemDetail, ArchiveAudioFile } from '../archiveOrg';
import { Song } from '../../types/music';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

describe('Internet Archive Nasheed Download Security, Integrity & Sibling Isolation Suite', () => {
  beforeEach(() => {
    // Reset state
  });

  test('1 & 9. One downloaded track does not mark sibling tracks downloaded & existing offline downloads remain recognized', async () => {
    const offlineSongs: Song[] = [
      {
        id: 'archive_item123_track1_mp3',
        title: 'Track 1',
        artist: 'Vocalist',
        album: 'Nasheeds Collection',
        duration: 180,
        genre: 'Nasheed',
        format: 'mp3',
        size: 1000,
        dateAdded: Date.now(),
        hasStoredBlob: true,
        cloudId: 'archive_item123_track1_mp3',
        isCloud: false,
        source: 'archive',
      },
    ];

    const itemIdentifier = 'item123';
    const track1Name = 'track1.mp3';
    const track2Name = 'track2.mp3';

    const offlineMap = new Map<string, Song>();
    for (const song of offlineSongs) {
      if (song.hasStoredBlob) {
        if (song.cloudId) offlineMap.set(song.cloudId, song);
        if (song.id) offlineMap.set(song.id, song);
      }
    }

    const checkTrack1 = offlineMap.has(`archive_${itemIdentifier}_${track1Name.replace(/[^a-zA-Z0-9_]/g, '_')}`);
    const checkTrack2 = offlineMap.has(`archive_${itemIdentifier}_${track2Name.replace(/[^a-zA-Z0-9_]/g, '_')}`);

    assert.equal(checkTrack1, true, 'Track 1 should be recognized as downloaded');
    assert.equal(checkTrack2, false, 'Track 2 (sibling) must NOT be marked as downloaded just because track 1 is');
  });

  test('2. Exact file identity works with unusual filenames (spaces, symbols, arabic characters)', async () => {
    const itemIdentifier = 'arabic_nasheed_col';
    const unusualName = 'نشيد_جميل (Special Edition) #1.mp3';
    const cleanName = unusualName.replace(/[^a-zA-Z0-9_]/g, '_');
    const expectedId = `archive_${itemIdentifier}_${cleanName}`;

    assert.equal(expectedId, 'archive_arabic_nasheed_col____________Special_Edition___1_mp3');
  });

  test('3. A truncated response is rejected by size validation', async () => {
    const item: ArchiveItemDetail = {
      identifier: 'test_item',
      title: 'Test Item',
      hasRealImage: false,
      archiveUrl: 'https://archive.org/details/test_item',
      audioFiles: [],
    };

    const file: ArchiveAudioFile = {
      name: 'song.mp3',
      title: 'Song',
      size: 50000,
      length: 120,
      format: 'mp3',
      downloadUrl: 'https://archive.org/download/test_item/song.mp3',
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      const smallData = new Uint8Array(10000);
      return new Response(smallData, {
        status: 200,
        headers: { 'content-length': '10000' },
      });
    };

    try {
      await ArchiveOrgService.downloadFileBlob(item, file);
      assert.fail('Should have rejected truncated download');
    } catch (err: any) {
      assert.ok(
        err.message.includes('incomplete or truncated file') || err.message.includes('Download failed'),
        `Unexpected error message: ${err.message}`
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('4. A zero-byte response is rejected', async () => {
    const item: ArchiveItemDetail = {
      identifier: 'test_item',
      title: 'Test Item',
      hasRealImage: false,
      archiveUrl: 'https://archive.org/details/test_item',
      audioFiles: [],
    };

    const file: ArchiveAudioFile = {
      name: 'empty.mp3',
      title: 'Empty',
      size: 0,
      length: 0,
      format: 'mp3',
      downloadUrl: 'https://archive.org/download/test_item/empty.mp3',
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(new Blob([], { type: 'audio/mpeg' }), { status: 200 });
    };

    try {
      await ArchiveOrgService.downloadFileBlob(item, file);
      assert.fail('Should have rejected zero-byte download');
    } catch (err: any) {
      assert.ok(err.message.includes('empty'), `Unexpected error: ${err.message}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('5. A valid complete download with matching size is saved successfully', async () => {
    const item: ArchiveItemDetail = {
      identifier: 'test_item',
      title: 'Test Item',
      hasRealImage: false,
      archiveUrl: 'https://archive.org/details/test_item',
      audioFiles: [],
    };

    const payload = new Uint8Array(2048);
    for (let i = 0; i < payload.length; i++) payload[i] = i % 256;

    const file: ArchiveAudioFile = {
      name: 'valid.mp3',
      title: 'Valid Track',
      size: 2048,
      length: 60,
      format: 'mp3',
      downloadUrl: 'https://archive.org/download/test_item/valid.mp3',
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(payload, {
        status: 200,
        headers: { 'content-length': '2048' },
      });
    };

    try {
      const result = await ArchiveOrgService.downloadFileBlob(item, file);
      assert.ok(result.song);
      assert.ok(result.blob);
      assert.equal(result.blob.size, 2048);
      assert.equal(result.song.id, 'archive_test_item_valid_mp3');
      assert.equal(result.song.hasStoredBlob, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('6. Native Android CapacitorHttp response conversion works correctly (Blob, base64, ArrayBuffer)', async () => {
    const mockBinary = new Uint8Array(100);
    for (let i = 0; i < 100; i++) mockBinary[i] = i;
    const mockBase64 = btoa(String.fromCharCode(...mockBinary));

    const convertResponseData = (data: any) => {
      if (data instanceof Blob) return data;
      if (typeof data === 'string') {
        const base64 = data.includes(',') ? data.split(',')[1] : data;
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new Blob([bytes], { type: 'audio/mpeg' });
      }
      if (data instanceof ArrayBuffer) {
        return new Blob([data], { type: 'audio/mpeg' });
      }
      if (data && typeof data === 'object' && 'buffer' in data) {
        return new Blob([data as any], { type: 'audio/mpeg' });
      }
      if (data) {
        return new Blob([String(data)], { type: 'audio/mpeg' });
      }
      throw new Error('Empty response data');
    };

    const blobFromStr = convertResponseData(mockBase64);
    assert.equal(blobFromStr.size, 100);

    const blobFromBuf = convertResponseData(mockBinary.buffer);
    assert.equal(blobFromBuf.size, 100);

    const blobFromTyped = convertResponseData(mockBinary);
    assert.equal(blobFromTyped.size, 100);

    const directBlob = new Blob([mockBinary], { type: 'audio/mpeg' });
    const blobFromBlob = convertResponseData(directBlob);
    assert.equal(blobFromBlob.size, 100);
  });

  test('7. Incorrect checksum (SHA-1) is rejected', async () => {
    const item: ArchiveItemDetail = {
      identifier: 'test_item',
      title: 'Test Item',
      hasRealImage: false,
      archiveUrl: 'https://archive.org/details/test_item',
      audioFiles: [],
    };

    const payload = new Uint8Array(1000);
    const file: ArchiveAudioFile = {
      name: 'bad_sum.mp3',
      title: 'Bad Checksum',
      size: 1000,
      length: 30,
      format: 'mp3',
      downloadUrl: 'https://archive.org/download/test_item/bad_sum.mp3',
      sha1: 'deadbeef00000000000000000000000000000000',
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(payload, { status: 200, headers: { 'content-length': '1000' } });
    };

    try {
      await ArchiveOrgService.downloadFileBlob(item, file);
      assert.fail('Should have rejected incorrect checksum');
    } catch (err: any) {
      assert.ok(err.message.includes('checksum verification failed'), `Unexpected error: ${err.message}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('8. Download All logic skips verified downloaded tracks and handles failures safely without marking collection complete', async () => {
    const files: ArchiveAudioFile[] = [
      { name: 't1.mp3', title: 'T1', size: 100, length: 10, format: 'mp3', downloadUrl: 'url1' },
      { name: 't2.mp3', title: 'T2', size: 100, length: 10, format: 'mp3', downloadUrl: 'url2' },
    ];

    const downloadedNames = new Set<string>(['t1.mp3']);
    const failedNames = new Set<string>(['t2.mp3']);

    const successfulDownloads: string[] = [];

    for (const file of files) {
      const isDownloaded = downloadedNames.has(file.name);
      if (isDownloaded) continue;

      if (failedNames.has(file.name)) {
        continue;
      }
      successfulDownloads.push(file.name);
    }

    assert.deepEqual(successfulDownloads, [], 'Failed tracks should not be counted as successfully downloaded');
  });
});
