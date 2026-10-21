import { resizeImageToJpegDataUrl } from './imageUtils';

export interface ExtractedMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  artworkUrl?: string;
  artworkBlob?: Blob;
  year?: string;
}

// Generate stylized neon vinyl artwork for songs without embedded cover art
export function generateProceduralArtwork(title: string, artist: string): string {
  const hash = (title + artist).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue1 = hash % 360;
  const hue2 = (hue1 + 60 + (hash % 120)) % 360;
  
  const initials = (title.trim().slice(0, 2) || 'JT').toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="hsl(${hue1}, 80%, 12%)"/>
        <stop offset="50%" stop-color="#090d1f"/>
        <stop offset="100%" stop-color="hsl(${hue2}, 90%, 15%)"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="hsl(${hue1}, 100%, 65%)"/>
        <stop offset="100%" stop-color="hsl(${hue2}, 100%, 65%)"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" fill="url(#bg)"/>
    <circle cx="150" cy="150" r="110" fill="none" stroke="#1f293d" stroke-width="8"/>
    <circle cx="150" cy="150" r="85" fill="none" stroke="#2a3854" stroke-width="2"/>
    <circle cx="150" cy="150" r="60" fill="none" stroke="url(#accent)" stroke-width="4" stroke-opacity="0.8"/>
    <circle cx="150" cy="150" r="32" fill="#070a14" stroke="url(#accent)" stroke-width="2"/>
    <circle cx="150" cy="150" r="10" fill="url(#accent)"/>
    <text x="150" y="245" font-family="system-ui, sans-serif" font-weight="700" font-size="20" fill="#ffffff" opacity="0.9" text-anchor="middle" letter-spacing="2">${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Extracts embedded ID3 cover artwork from an audio Blob or File,
 * shrinks it to at most 512x512, and returns a JPEG data URL.
 * Never uses or returns a temporary blob: URL.
 */
export async function extractCoverFromAudioBlob(fileOrBlob: Blob | File): Promise<string | null> {
  try {
    // Read the first 10 bytes to check ID3 header and calculate total tag size
    const headerBuffer = await fileOrBlob.slice(0, 10).arrayBuffer();
    const headerView = new DataView(headerBuffer);

    if (
      headerView.byteLength >= 10 &&
      headerView.getUint8(0) === 0x49 &&
      headerView.getUint8(1) === 0x44 &&
      headerView.getUint8(2) === 0x33
    ) {
      const majorVersion = headerView.getUint8(3);
      const tagSize =
        ((headerView.getUint8(6) & 0x7f) << 21) |
        ((headerView.getUint8(7) & 0x7f) << 14) |
        ((headerView.getUint8(8) & 0x7f) << 7) |
        (headerView.getUint8(9) & 0x7f);

      // Read up to 8MB max of ID3 tag data to find the APIC frame
      const readLength = Math.min(fileOrBlob.size, 10 + tagSize, 8 * 1024 * 1024);
      const buffer = await fileOrBlob.slice(0, readLength).arrayBuffer();
      const view = new DataView(buffer);

      let offset = 10;
      const maxOffset = buffer.byteLength;

      while (offset < maxOffset - 10) {
        let frameId = '';
        for (let i = 0; i < 4; i++) {
          const charCode = view.getUint8(offset + i);
          if (charCode === 0) break;
          frameId += String.fromCharCode(charCode);
        }

        if (frameId.length < 4) break;

        let frameSize = 0;
        if (majorVersion === 4) {
          frameSize =
            ((view.getUint8(offset + 4) & 0x7f) << 21) |
            ((view.getUint8(offset + 5) & 0x7f) << 14) |
            ((view.getUint8(offset + 6) & 0x7f) << 7) |
            (view.getUint8(offset + 7) & 0x7f);
        } else {
          frameSize = view.getUint32(offset + 4, false);
        }

        if (frameSize <= 0 || offset + 10 + frameSize > maxOffset) {
          break;
        }

        const frameDataOffset = offset + 10;

        if (frameId === 'APIC' || frameId === 'PIC') {
          try {
            let p = frameDataOffset;
            const picEncoding = view.getUint8(p++);
            let mimeType = '';
            while (p < frameDataOffset + frameSize && view.getUint8(p) !== 0) {
              mimeType += String.fromCharCode(view.getUint8(p++));
            }
            p++; // skip null terminator
            if (!mimeType || mimeType === '-->') mimeType = 'image/jpeg';

            p++; // skip picture type

            // Description
            if (picEncoding === 1 || picEncoding === 2) {
              while (p < frameDataOffset + frameSize - 1) {
                if (view.getUint8(p) === 0 && view.getUint8(p + 1) === 0) {
                  p += 2;
                  break;
                }
                p += 2;
              }
            } else {
              while (p < frameDataOffset + frameSize && view.getUint8(p) !== 0) {
                p++;
              }
              p++;
            }

            const imgDataSize = frameDataOffset + frameSize - p;
            if (imgDataSize > 0) {
              const imgBytes = new Uint8Array(buffer, p, imgDataSize);
              const blob = new Blob([imgBytes], { type: mimeType });
              return await resizeImageToJpegDataUrl(blob, 512, 0.85);
            }
          } catch (e) {
            console.warn('APIC parse error', e);
          }
        }

        offset += 10 + frameSize;
      }
    }
  } catch (err) {
    console.warn('Could not extract cover from audio blob', err);
  }
  return null;
}

export async function extractAudioMetadata(
  file: File | Blob,
  fallbackName?: string
): Promise<ExtractedMetadata> {
  const rawName = (file instanceof File ? file.name : fallbackName || 'track.mp3');
  const defaultTitle = rawName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
  let title = defaultTitle;
  let artist = 'Unknown Artist';
  let album = 'Local Library';
  let artworkUrl: string | undefined = undefined;
  let artworkBlob: Blob | undefined = undefined;
  let year: string | undefined = undefined;

  // Try parsing filename if structured like "Artist - Title"
  if (defaultTitle.includes(' - ')) {
    const parts = defaultTitle.split(' - ');
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }
  }

  // Parse ID3 from buffer
  try {
    const headerBuffer = await file.slice(0, 10).arrayBuffer();
    const headerView = new DataView(headerBuffer);

    if (
      headerView.byteLength >= 10 &&
      headerView.getUint8(0) === 0x49 &&
      headerView.getUint8(1) === 0x44 &&
      headerView.getUint8(2) === 0x33
    ) {
      const majorVersion = headerView.getUint8(3);
      let offset = 10;
      const tagSize =
        ((headerView.getUint8(6) & 0x7f) << 21) |
        ((headerView.getUint8(7) & 0x7f) << 14) |
        ((headerView.getUint8(8) & 0x7f) << 7) |
        (headerView.getUint8(9) & 0x7f);

      // Read up to 8MB max of ID3 tag data
      const readLength = Math.min(file.size, 10 + tagSize, 8 * 1024 * 1024);
      const buffer = await file.slice(0, readLength).arrayBuffer();
      const view = new DataView(buffer);

      const maxOffset = buffer.byteLength;

      while (offset < maxOffset - 10) {
        let frameId = '';
        for (let i = 0; i < 4; i++) {
          const charCode = view.getUint8(offset + i);
          if (charCode === 0) break;
          frameId += String.fromCharCode(charCode);
        }

        if (frameId.length < 4) break;

        let frameSize = 0;
        if (majorVersion === 4) {
          frameSize =
            ((view.getUint8(offset + 4) & 0x7f) << 21) |
            ((view.getUint8(offset + 5) & 0x7f) << 14) |
            ((view.getUint8(offset + 6) & 0x7f) << 7) |
            (view.getUint8(offset + 7) & 0x7f);
        } else {
          frameSize = view.getUint32(offset + 4, false);
        }

        if (frameSize <= 0 || offset + 10 + frameSize > maxOffset) {
          break;
        }

        const frameDataOffset = offset + 10;

        // Extract Text frames
        if (['TIT2', 'TPE1', 'TALB', 'TYER', 'TDRC'].includes(frameId)) {
          const encoding = view.getUint8(frameDataOffset);
          const rawBytes = new Uint8Array(buffer, frameDataOffset + 1, frameSize - 1);
          let text = '';

          if (encoding === 0 || encoding === 3) {
            const decoder = new TextDecoder(encoding === 3 ? 'utf-8' : 'iso-8859-1');
            text = decoder.decode(rawBytes).replace(/\0/g, '').trim();
          } else if (encoding === 1 || encoding === 2) {
            const decoder = new TextDecoder('utf-16');
            text = decoder.decode(rawBytes).replace(/\0/g, '').trim();
          }

          if (text) {
            if (frameId === 'TIT2') title = text;
            else if (frameId === 'TPE1') artist = text;
            else if (frameId === 'TALB') album = text;
            else if (frameId === 'TYER' || frameId === 'TDRC') year = text.slice(0, 4);
          }
        }

        // Extract APIC (Attached Picture)
        if (frameId === 'APIC' || frameId === 'PIC') {
          try {
            let p = frameDataOffset;
            const picEncoding = view.getUint8(p++);
            let mimeType = '';
            while (p < frameDataOffset + frameSize && view.getUint8(p) !== 0) {
              mimeType += String.fromCharCode(view.getUint8(p++));
            }
            p++; // skip null terminator
            if (!mimeType || mimeType === '-->') mimeType = 'image/jpeg';

            p++; // picture type

            if (picEncoding === 1 || picEncoding === 2) {
              while (p < frameDataOffset + frameSize - 1) {
                if (view.getUint8(p) === 0 && view.getUint8(p + 1) === 0) {
                  p += 2;
                  break;
                }
                p += 2;
              }
            } else {
              while (p < frameDataOffset + frameSize && view.getUint8(p) !== 0) {
                p++;
              }
              p++;
            }

            const imgDataSize = frameDataOffset + frameSize - p;
            if (imgDataSize > 0) {
              const imgBytes = new Uint8Array(buffer, p, imgDataSize);
              const blob = new Blob([imgBytes], { type: mimeType });
              artworkBlob = blob;
              // Resize and convert directly to JPEG data URL. NEVER save blob: URL!
              try {
                artworkUrl = await resizeImageToJpegDataUrl(blob, 512, 0.85);
              } catch (e) {
                console.warn('Failed to resize APIC cover to JPEG data URL', e);
                artworkUrl = undefined;
              }
            }
          } catch (e) {
            console.warn('APIC parse error', e);
          }
        }

        offset += 10 + frameSize;
      }
    }
  } catch (err) {
    console.warn('Could not parse ID3 tags', err);
  }

  // Get duration by briefly probing audio element
  let duration = 0;
  try {
    const objectUrl = URL.createObjectURL(file);
    duration = await new Promise<number>((resolve) => {
      const audio = new Audio();
      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', onLoaded);
        audio.removeEventListener('error', onError);
        URL.revokeObjectURL(objectUrl);
      };
      const onLoaded = () => {
        const d = audio.duration;
        cleanup();
        resolve(isFinite(d) ? d : 0);
      };
      const onError = () => {
        cleanup();
        resolve(0);
      };
      audio.addEventListener('loadedmetadata', onLoaded);
      audio.addEventListener('error', onError);
      audio.src = objectUrl;
      setTimeout(() => {
        cleanup();
        resolve(0);
      }, 3000);
    });
  } catch {
    duration = 0;
  }

  // If no artwork was extracted from APIC, generate procedural neon vinyl SVG data URL
  if (!artworkUrl) {
    artworkUrl = generateProceduralArtwork(title, artist);
  }

  return {
    title,
    artist,
    album,
    duration,
    artworkUrl,
    artworkBlob,
    year,
  };
}
