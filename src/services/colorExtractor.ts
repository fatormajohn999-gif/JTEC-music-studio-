import { ArtworkPalette } from '../types/music';

export const DEFAULT_PALETTES: ArtworkPalette[] = [
  {
    main: '#00f0ff',
    primary: '#00f0ff',
    secondary: '#a855f7',
    accent: '#ec4899',
    glow: 'rgba(0, 240, 255, 0.45)',
    darkBg: '#070b18',
    hasCover: false,
  },
  {
    main: '#a855f7',
    primary: '#a855f7',
    secondary: '#ec4899',
    accent: '#38bdf8',
    glow: 'rgba(168, 85, 247, 0.45)',
    darkBg: '#0d071a',
    hasCover: false,
  },
  {
    main: '#38bdf8',
    primary: '#38bdf8',
    secondary: '#818cf8',
    accent: '#00f0ff',
    glow: 'rgba(56, 189, 248, 0.45)',
    darkBg: '#060d1c',
    hasCover: false,
  },
];

// Helper: RGB to HSL
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h *= 60;
  }

  return [h, s, l];
}

// Helper: HSL to RGB
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

interface ColorBucket {
  count: number;
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  l: number;
}

/**
 * Extracts 3 vivid, glow-ready colors (main, secondary, accent) from an album cover.
 * 1. Draws image on a small 48x48 offscreen canvas.
 * 2. Filters out darks, whites, and grays.
 * 3. Boosts darkness if too dark, increases saturation if washed out.
 * 4. Yields vibrant, high-contrast colors that pop against a dark background.
 */
export async function extractPaletteFromImage(imageUrl?: string): Promise<ArtworkPalette> {
  if (!imageUrl) {
    return { ...DEFAULT_PALETTES[0], hasCover: false };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const fallback = () => {
      resolve({ ...DEFAULT_PALETTES[0], hasCover: false });
    };

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return fallback();

        const size = 48;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imgData = ctx.getImageData(0, 0, size, size).data;
        const buckets: Map<string, ColorBucket> = new Map();

        // Sample pixels across 48x48 canvas
        for (let i = 0; i < imgData.length; i += 4) {
          const a = imgData[i + 3];
          if (a < 128) continue; // Skip transparent

          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];

          const [h, s, l] = rgbToHsl(r, g, b);

          // Ignore pixels that are almost black, almost white, or almost gray so colors stay vivid
          if (l < 0.12 || l > 0.88) continue;
          if (s < 0.18) continue;

          // Quantize into hue and lightness bins
          const hueBin = Math.floor(h / 15) * 15;
          const lightBin = Math.floor(l * 5) * 0.2;
          const key = `${hueBin}_${lightBin}`;

          const existing = buckets.get(key);
          if (existing) {
            existing.count += 1;
            existing.r = (existing.r * (existing.count - 1) + r) / existing.count;
            existing.g = (existing.g * (existing.count - 1) + g) / existing.count;
            existing.b = (existing.b * (existing.count - 1) + b) / existing.count;
            existing.h = (existing.h * (existing.count - 1) + h) / existing.count;
            existing.s = (existing.s * (existing.count - 1) + s) / existing.count;
            existing.l = (existing.l * (existing.count - 1) + l) / existing.count;
          } else {
            buckets.set(key, { count: 1, r, g, b, h, s, l });
          }
        }

        const bucketList = Array.from(buckets.values());
        if (bucketList.length === 0) {
          // If no saturated pixels passed, allow lower saturation
          for (let i = 0; i < imgData.length; i += 4) {
            if (imgData[i + 3] < 128) continue;
            const r = imgData[i];
            const g = imgData[i + 1];
            const b = imgData[i + 2];
            const [h, s, l] = rgbToHsl(r, g, b);
            if (l > 0.08 && l < 0.92) {
              bucketList.push({ count: 1, r, g, b, h, s, l });
            }
          }
        }

        if (bucketList.length === 0) return fallback();

        // Sort by popularity weighted with saturation
        bucketList.sort((a, b) => b.count * (1 + b.s) - a.count * (1 + a.s));

        // Helper to adjust color so it glows brightly on dark backgrounds:
        // - If too dark, brighten it.
        // - If too washed out, increase its saturation.
        const makeVividGlow = (bucket: ColorBucket, targetL = 0.55, targetS = 0.85): [number, number, number] => {
          let h = bucket.h;
          // Saturation boost
          let s = Math.max(bucket.s, targetS);
          s = Math.min(1.0, Math.max(0.65, s));
          // Lightness boost (never too dark so it glows)
          let l = Math.max(bucket.l, targetL);
          l = Math.min(0.75, Math.max(0.48, l));

          return hslToRgb(h, s, l);
        };

        // 1. Pick Main Color (most dominant vivid cluster)
        const mainBucket = bucketList[0];
        const [mr, mg, mb] = makeVividGlow(mainBucket, 0.52, 0.85);
        const mainHex = toHex(mr, mg, mb);

        // 2. Pick Secondary Color (distinct hue / harmonic)
        let secBucket: ColorBucket | null = null;
        for (let i = 1; i < bucketList.length; i++) {
          const candidate = bucketList[i];
          const hueDiff = Math.abs(candidate.h - mainBucket.h);
          const circDiff = Math.min(hueDiff, 360 - hueDiff);
          if (circDiff > 28) {
            secBucket = candidate;
            break;
          }
        }

        // If monochromatic or no distinct secondary found, synthesize harmonic shift
        let sr: number, sg: number, sb: number;
        if (secBucket) {
          [sr, sg, sb] = makeVividGlow(secBucket, 0.48, 0.80);
        } else {
          // Analogous harmonic shift (+38 degrees)
          const harmonicH = (mainBucket.h + 38) % 360;
          [sr, sg, sb] = hslToRgb(harmonicH, Math.min(1, mainBucket.s * 1.1 + 0.2), 0.50);
        }
        const secondaryHex = toHex(sr, sg, sb);

        // 3. Pick Accent Color (sparkling high-contrast highlight)
        let accBucket: ColorBucket | null = null;
        for (let i = 1; i < bucketList.length; i++) {
          const candidate = bucketList[i];
          if (candidate === secBucket) continue;
          const diffMain = Math.min(Math.abs(candidate.h - mainBucket.h), 360 - Math.abs(candidate.h - mainBucket.h));
          const diffSec = secBucket ? Math.min(Math.abs(candidate.h - secBucket.h), 360 - Math.abs(candidate.h - secBucket.h)) : 40;
          if (diffMain > 25 && diffSec > 25) {
            accBucket = candidate;
            break;
          }
        }

        let ar: number, ag: number, ab: number;
        if (accBucket) {
          [ar, ag, ab] = makeVividGlow(accBucket, 0.62, 0.95);
        } else {
          // Triadic / complementary high-energy sparkle (+120 degrees or +180 degrees)
          const accentH = (mainBucket.h + 130) % 360;
          [ar, ag, ab] = hslToRgb(accentH, 0.95, 0.65);
        }
        const accentHex = toHex(ar, ag, ab);

        // Deep background tint derived from secondary/main
        const darkBgHex = toHex(
          Math.max(3, Math.floor(sr * 0.06)),
          Math.max(4, Math.floor(sg * 0.06)),
          Math.max(10, Math.floor(sb * 0.09))
        );

        const glow = `rgba(${mr}, ${mg}, ${mb}, 0.55)`;

        resolve({
          main: mainHex,
          primary: mainHex,
          secondary: secondaryHex,
          accent: accentHex,
          glow,
          darkBg: darkBgHex,
          hasCover: true,
        });
      } catch {
        fallback();
      }
    };

    img.onerror = fallback;
    img.src = imageUrl;

    // Safety timeout
    setTimeout(fallback, 2000);
  });
}
