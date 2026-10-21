import { Song } from '../types/music';
import { StorageService } from './storage';
import { downloadAndConvertCover } from './imageUtils';
import { extractCoverFromAudioBlob, generateProceduralArtwork } from './id3Parser';
import { extractPaletteFromImage } from './colorExtractor';

// Track songs that have already been evaluated during this application session
const evaluatedSongIds = new Set<string>();
let isMigrating = false;

/**
 * Repairs existing songs in the background without blocking app startup:
 * 1. If artworkUrl starts with 'http', download and convert to JPEG data URL when online.
 * 2. If artworkUrl starts with 'blob:', re-extract the cover from the stored audio file.
 * 3. If neither works, generate procedural neon vinyl artwork.
 * 4. Extracts cover color palette for offline atmospheric lighting.
 * 5. Operates once per song.
 */
export async function repairExistingSongCovers(
  onUpdate?: (updatedSongs: Song[]) => void
): Promise<void> {
  if (isMigrating) return;
  isMigrating = true;

  try {
    const allSongs = await StorageService.getAllSongs();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    let anyRepaired = false;

    for (const song of allSongs) {
      if (evaluatedSongIds.has(song.id)) {
        continue;
      }

      const art = song.artworkUrl || '';
      let songChanged = false;

      // CASE 1: Dead 'blob:' URL from prior session
      if (art.startsWith('blob:')) {
        let extractedCover: string | null = null;
        try {
          const audioBlob = await StorageService.getSongBlob(song.id);
          if (audioBlob && audioBlob.size > 0) {
            extractedCover = await extractCoverFromAudioBlob(audioBlob);
          }
        } catch (err) {
          console.warn(`Could not re-extract cover from audio blob for ${song.title}:`, err);
        }

        if (extractedCover) {
          song.artworkUrl = extractedCover;
          try {
            song.palette = await extractPaletteFromImage(extractedCover);
          } catch {
            // ignore palette fallback
          }
          songChanged = true;
        } else {
          // If re-extraction fails, use procedural artwork
          const procedural = generateProceduralArtwork(song.title, song.artist);
          song.artworkUrl = procedural;
          try {
            song.palette = await extractPaletteFromImage(procedural);
          } catch {
            // ignore
          }
          songChanged = true;
        }
        evaluatedSongIds.add(song.id);
      }
      // CASE 2: Remote HTTP/HTTPS URL
      else if (art.startsWith('http://') || art.startsWith('https://')) {
        if (!song.coverUrl) {
          song.coverUrl = art; // Preserve original web address
          songChanged = true;
        }

        if (isOnline) {
          try {
            const dataUrl = await downloadAndConvertCover(art, 512, 0.85);
            song.artworkUrl = dataUrl;
            try {
              song.palette = await extractPaletteFromImage(dataUrl);
            } catch {
              // ignore
            }
            songChanged = true;
            evaluatedSongIds.add(song.id);
          } catch (err) {
            console.warn(`Could not download remote cover for ${song.title}:`, err);
            // Will retry when connection improves; keep coverUrl
          }
        }
      }
      // CASE 3: Cloud song with coverUrl that previously failed to download
      else if (song.coverUrl && isOnline && (!art || art.startsWith('data:image/svg'))) {
        try {
          const dataUrl = await downloadAndConvertCover(song.coverUrl, 512, 0.85);
          song.artworkUrl = dataUrl;
          try {
            song.palette = await extractPaletteFromImage(dataUrl);
          } catch {
            // ignore
          }
          songChanged = true;
          evaluatedSongIds.add(song.id);
        } catch (err) {
          console.warn(`Could not retry cloud cover for ${song.title}:`, err);
        }
      }
      // CASE 4: Missing artworkUrl completely
      else if (!art) {
        let extractedCover: string | null = null;
        if (song.hasStoredBlob) {
          try {
            const audioBlob = await StorageService.getSongBlob(song.id);
            if (audioBlob && audioBlob.size > 0) {
              extractedCover = await extractCoverFromAudioBlob(audioBlob);
            }
          } catch {
            // ignore
          }
        }

        if (extractedCover) {
          song.artworkUrl = extractedCover;
          try {
            song.palette = await extractPaletteFromImage(extractedCover);
          } catch {
            // ignore
          }
          songChanged = true;
        } else {
          const procedural = generateProceduralArtwork(song.title, song.artist);
          song.artworkUrl = procedural;
          try {
            song.palette = await extractPaletteFromImage(procedural);
          } catch {
            // ignore
          }
          songChanged = true;
        }
        evaluatedSongIds.add(song.id);
      }
      // CASE 5: Has persistent data URL but missing palette for offline colors
      else if (art.startsWith('data:') && !song.palette) {
        try {
          song.palette = await extractPaletteFromImage(art);
          songChanged = true;
        } catch {
          // ignore
        }
        evaluatedSongIds.add(song.id);
      } else {
        evaluatedSongIds.add(song.id);
      }

      if (songChanged) {
        anyRepaired = true;
        await StorageService.saveSong(song);
      }
    }

    if (anyRepaired && onUpdate) {
      const refreshed = await StorageService.getAllSongs();
      onUpdate(refreshed);
    }
  } catch (err) {
    console.warn('Background cover migration error:', err);
  } finally {
    isMigrating = false;
  }
}
