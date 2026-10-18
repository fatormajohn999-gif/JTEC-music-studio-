const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function createPNG(width, height, r, g, b) {
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      // Slight radial gradient / vignette
      const dx = (x - width / 2) / (width / 2);
      const dy = (y - height / 2) / (height / 2);
      const dist = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const factor = 1 - 0.4 * dist;

      rawData[pxOffset] = Math.round(r * factor);
      rawData[pxOffset + 1] = Math.round(g * factor);
      rawData[pxOffset + 2] = Math.round(b * factor);
      rawData[pxOffset + 3] = 255;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crcBuf = Buffer.alloc(4 + len);
  buf.copy(crcBuf, 0, 4, 8 + len);
  const crcVal = crc32(crcBuf);
  buf.writeUInt32BE(crcVal, 8 + len);
  return buf;
}

const iconsDir = path.resolve(__dirname, '../public/icons');
const imagesDir = path.resolve(__dirname, '../public/images/cloud');
const resourcesDir = path.resolve(__dirname, '../resources');

fs.mkdirSync(iconsDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });
fs.mkdirSync(resourcesDir, { recursive: true });

// Cyan theme for JTEC App Icon
const icon192 = createPNG(192, 192, 0, 240, 255);
const icon512 = createPNG(512, 512, 0, 240, 255);
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), icon192);
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), icon512);
fs.writeFileSync(path.join(resourcesDir, 'icon.png'), icon512);

// Category images (Nasheed: Emerald, Love/Chill: Pink/Purple, JTEC: Cyan/Indigo)
fs.writeFileSync(path.join(imagesDir, 'nasheed.jpg'), createPNG(640, 400, 16, 185, 129));
fs.writeFileSync(path.join(imagesDir, 'love_chill.jpg'), createPNG(640, 400, 236, 72, 153));
fs.writeFileSync(path.join(imagesDir, 'jtec_main.jpg'), createPNG(640, 400, 6, 182, 212));

console.log('[generate-assets] Successfully created all icons and category image assets.');
