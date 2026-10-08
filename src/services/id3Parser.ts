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

export async function extractAudioMetadata(file: File): Promise<ExtractedMetadata> {
  const defaultTitle = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
  let title = defaultTitle;
  let artist = 'Unknown Artist';
  let album = 'Local Device';
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
    const buffer = await file.slice(0, 512 * 1024).arrayBuffer(); // read first 512KB
    const view = new DataView(buffer);

    // Check ID3 header ("ID3")
    if (view.byteLength > 10 &&
        view.getUint8(0) === 0x49 &&
        view.getUint8(1) === 0x44 &&
        view.getUint8(2) === 0x33) {
      
      const majorVersion = view.getUint8(3); // 3 for ID3v2.3, 4 for ID3v2.4
      let offset = 10;
      const tagSize = ((view.getUint8(6) & 0x7f) << 21) |
                      ((view.getUint8(7) & 0x7f) << 14) |
                      ((view.getUint8(8) & 0x7f) << 7) |
                      (view.getUint8(9) & 0x7f);

      const maxOffset = Math.min(buffer.byteLength, 10 + tagSize);

      while (offset < maxOffset - 10) {
        // Read 4-character Frame ID
        let frameId = '';
        for (let i = 0; i < 4; i++) {
          const charCode = view.getUint8(offset + i);
          if (charCode === 0) break;
          frameId += String.fromCharCode(charCode);
        }

        if (frameId.length < 4) break;

        let frameSize = 0;
        if (majorVersion === 4) {
          frameSize = ((view.getUint8(offset + 4) & 0x7f) << 21) |
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
            // ISO-8859-1 or UTF-8
            const decoder = new TextDecoder(encoding === 3 ? 'utf-8' : 'iso-8859-1');
            text = decoder.decode(rawBytes).replace(/\0/g, '').trim();
          } else if (encoding === 1 || encoding === 2) {
            // UTF-16
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
        if (frameId === 'APIC') {
          try {
            let p = frameDataOffset;
            const picEncoding = view.getUint8(p++);
            // MIME type is null-terminated ASCII string
            let mimeType = '';
            while (p < frameDataOffset + frameSize && view.getUint8(p) !== 0) {
              mimeType += String.fromCharCode(view.getUint8(p++));
            }
            p++; // skip null terminator
            if (!mimeType || mimeType === '-->') mimeType = 'image/jpeg';

            // Picture type (1 byte)
            p++;

            // Description (null terminated)
            if (picEncoding === 1 || picEncoding === 2) {
              // 2 null bytes for utf-16
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

            // Remainder is picture data
            const imgDataSize = frameDataOffset + frameSize - p;
            if (imgDataSize > 0) {
              const imgBytes = new Uint8Array(buffer, p, imgDataSize);
              const blob = new Blob([imgBytes], { type: mimeType });
              artworkBlob = blob;
              artworkUrl = URL.createObjectURL(blob);
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
      // timeout fallback
      setTimeout(() => {
        cleanup();
        resolve(0);
      }, 3000);
    });
  } catch {
    duration = 0;
  }

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
