import { ArtworkPalette } from '../types/music';

const DEFAULT_PALETTES: ArtworkPalette[] = [
  {
    primary: '#00f0ff',
    secondary: '#a855f7',
    accent: '#ec4899',
    glow: 'rgba(0, 240, 255, 0.45)',
    darkBg: '#070b18',
  },
  {
    primary: '#a855f7',
    secondary: '#ec4899',
    accent: '#38bdf8',
    glow: 'rgba(168, 85, 247, 0.45)',
    darkBg: '#0d071a',
  },
  {
    primary: '#38bdf8',
    secondary: '#818cf8',
    accent: '#00f0ff',
    glow: 'rgba(56, 189, 248, 0.45)',
    darkBg: '#060d1c',
  },
];

export async function extractPaletteFromImage(imageUrl?: string): Promise<ArtworkPalette> {
  if (!imageUrl) {
    return DEFAULT_PALETTES[0];
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const fallback = () => {
      resolve(DEFAULT_PALETTES[Math.floor(Math.random() * DEFAULT_PALETTES.length)]);
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
        const colorBuckets: { r: number; g: number; b: number; count: number; sat: number }[] = [];

        // Sample pixels
        for (let i = 0; i < imgData.length; i += 16) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          if (a < 128) continue; // skip transparent

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const brightness = (max + min) / 2;
          const sat = max === 0 ? 0 : (max - min) / max;

          // Prefer vivid and non-black non-white colors
          if (brightness > 20 && brightness < 240) {
            colorBuckets.push({ r, g, b, count: 1, sat });
          }
        }

        if (colorBuckets.length === 0) return fallback();

        // Sort by saturation & brightness balance
        colorBuckets.sort((a, b) => b.sat - a.sat);

        const p1 = colorBuckets[0] || { r: 0, g: 240, b: 255 };
        const p2 = colorBuckets[Math.floor(colorBuckets.length * 0.35)] || { r: 168, g: 85, b: 247 };
        const p3 = colorBuckets[Math.floor(colorBuckets.length * 0.7)] || { r: 236, g: 72, b: 153 };

        const toHex = (r: number, g: number, b: number) => {
          return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
        };

        const primaryHex = toHex(p1.r, p1.g, p1.b);
        const secondaryHex = toHex(p2.r, p2.g, p2.b);
        const accentHex = toHex(p3.r, p3.g, p3.b);

        // Dark background tint derived from primary
        const darkBgHex = toHex(
          Math.max(4, Math.floor(p1.r * 0.08)),
          Math.max(6, Math.floor(p1.g * 0.09)),
          Math.max(14, Math.floor(p1.b * 0.15))
        );

        const glow = `rgba(${p1.r}, ${p1.g}, ${p1.b}, 0.5)`;

        resolve({
          primary: primaryHex,
          secondary: secondaryHex,
          accent: accentHex,
          glow,
          darkBg: darkBgHex,
        });
      } catch (err) {
        fallback();
      }
    };

    img.onerror = fallback;
    img.src = imageUrl;

    // Safety timeout
    setTimeout(fallback, 1500);
  });
}
