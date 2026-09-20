/**
 * Minimal, dependency-free PNG decode + Windows ICO encode/parse.
 *
 * Why hand-rolled: the icon assets are generated once from the monogram SVG and
 * committed, so packaging must not need a rasterizer, a native module, or
 * ImageMagick on the CI runner that builds the Windows installer. PNG decode +
 * DIB/BMP ICO writing is a small, fully testable amount of code — and the test
 * suite round-trips it (decode the .ico back and compare with the PNGs) so a
 * placeholder or half-transparent icon can never ship silently.
 *
 * PNG support is deliberately narrow: 8-bit RGBA (colour type 6), non-interlaced,
 * no palette — exactly what resvg emits for these assets. Anything else throws
 * instead of producing a wrong icon.
 */
import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decode an 8-bit RGBA PNG into { width, height, rgba }. */
export function decodePngRgba(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG (bad signature)');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length; // length + type + data + CRC
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace})`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = Buffer.alloc(stride * height);
  let previous = Buffer.alloc(stride);
  let cursor = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++];
    const line = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? line[x - 4] : 0;
      const b = previous[x];
      const c = x >= 4 ? previous[x - 4] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 0xff;
      else if (filter === 2) line[x] = (line[x] + b) & 0xff;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[x] = (line[x] + predictor) & 0xff;
      } else if (filter !== 0) {
        throw new Error(`unsupported PNG filter ${filter}`);
      }
    }
    line.copy(rgba, y * stride);
    previous = line;
  }
  return { width, height, rgba };
}

/** 1-bit AND mask Windows expects next to the 32-bit colour data (0 = opaque). */
function andMask(width, height, rgba) {
  const rowBytes = Math.ceil(width / 32) * 4;
  const mask = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      if (alpha === 0) mask[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return mask;
}

/** Encode [{ size, rgba }] as a multi-size .ico with 32-bit DIB entries. */
export function encodeIco(entries) {
  const images = entries.map(({ size, rgba }) => {
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0); // BITMAPINFOHEADER
    header.writeInt32LE(size, 4);
    header.writeInt32LE(size * 2, 8); // XOR + AND halves
    header.writeUInt16LE(1, 12); // planes
    header.writeUInt16LE(32, 14); // bits per pixel
    header.writeUInt32LE(size * size * 4, 20);
    const pixels = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      // DIB rows run bottom-up and channels are BGRA.
      for (let x = 0; x < size; x++) {
        const src = (y * size + x) * 4;
        const dst = ((size - 1 - y) * size + x) * 4;
        pixels[dst] = rgba[src + 2];
        pixels[dst + 1] = rgba[src + 1];
        pixels[dst + 2] = rgba[src];
        pixels[dst + 3] = rgba[src + 3];
      }
    }
    return Buffer.concat([header, pixels, andMask(size, size, rgba)]);
  });

  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2); // ICO
  directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  const sorted = entries
    .map((entry, index) => ({ entry, image: images[index] }))
    .sort((a, b) => a.entry.size - b.entry.size);
  sorted.forEach(({ entry, image }, index) => {
    const at = 6 + index * 16;
    directory[at] = entry.size >= 256 ? 0 : entry.size; // 256 is encoded as 0
    directory[at + 1] = entry.size >= 256 ? 0 : entry.size;
    directory[at + 2] = 0; // palette
    directory[at + 3] = 0;
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(image.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += image.length;
  });
  return Buffer.concat([directory, ...sorted.map((s) => s.image)]);
}

/** Parse an .ico back into [{ size, width, height, rgba, isDib }] (for tests). */
export function parseIco(buffer) {
  if (buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) throw new Error('not an ICO file');
  const count = buffer.readUInt16LE(4);
  const out = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    const declared = buffer[at] === 0 ? 256 : buffer[at];
    const bytes = buffer.readUInt32LE(at + 8);
    const offset = buffer.readUInt32LE(at + 12);
    const image = buffer.subarray(offset, offset + bytes);
    const dibSize = image.readUInt32LE(0);
    const width = image.readInt32LE(4);
    const height = image.readInt32LE(8) / 2;
    const bpp = image.readUInt16LE(14);
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const src = 40 + ((height - 1 - y) * width + x) * 4;
        const dst = (y * width + x) * 4;
        rgba[dst] = image[src + 2];
        rgba[dst + 1] = image[src + 1];
        rgba[dst + 2] = image[src];
        rgba[dst + 3] = image[src + 3];
      }
    }
    out.push({ size: declared, width, height, bpp, isDib: dibSize === 40, rgba });
  }
  return out;
}
