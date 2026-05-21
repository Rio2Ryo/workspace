import fs from 'node:fs';
import zlib from 'node:zlib';

export function screenshotInspectOptional(filePath) {
  if (!fs.existsSync(filePath)) return { present: false, errors: [] };
  const buffer = fs.readFileSync(filePath);
  const errors = [];
  const info = {
    present: true,
    bytes: buffer.length,
    width: 0,
    height: 0,
    errors,
  };
  if (buffer.length < 33) {
    errors.push(`HTML screenshot QA failed: PNG too small or truncated: ${filePath}`);
    return info;
  }
  if (!buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    errors.push(`HTML screenshot QA failed: invalid PNG signature: ${filePath}`);
    return info;
  }
  const chunkType = buffer.subarray(12, 16).toString('ascii');
  if (chunkType !== 'IHDR') {
    errors.push(`HTML screenshot QA failed: missing PNG IHDR chunk: ${filePath}`);
    return info;
  }
  info.width = buffer.readUInt32BE(16);
  info.height = buffer.readUInt32BE(20);
  if (info.width < 640 || info.height < 360) {
    errors.push(`HTML screenshot QA failed: dimensions ${info.width}x${info.height} below 640x360: ${filePath}`);
  }
  try {
    info.uniqueSampledColors = screenshotPixelDiversity(buffer, info.width, info.height);
    if (info.uniqueSampledColors < 4) {
      errors.push(`HTML screenshot QA failed: pixel diversity too low (${info.uniqueSampledColors} unique sampled colors): ${filePath}`);
    }
  } catch (error) {
    errors.push(`HTML screenshot QA failed: cannot inspect PNG pixels: ${error.message}: ${filePath}`);
  }
  return info;
}

export function screenshotPixelDiversity(buffer, width, height) {
  const png = parsePng(buffer);
  if (png.bitDepth !== 8) throw new Error(`unsupported bit depth ${png.bitDepth}`);
  const bytesPerPixel = pngBytesPerPixel(png.colorType);
  const channels = pngChannels(png.colorType);
  const stride = width * bytesPerPixel;
  const inflated = zlib.inflateSync(Buffer.concat(png.idat));
  const expected = height * (1 + stride);
  if (inflated.length < expected) throw new Error('truncated image data');

  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  const colors = new Set();
  const sampleEvery = Math.max(1, Math.floor((width * height) / 5000));
  let pixelIndex = 0;
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[offset];
    offset += 1;
    const raw = inflated.subarray(offset, offset + stride);
    offset += stride;
    unfilterScanline(filter, raw, current, previous, bytesPerPixel);
    for (let x = 0; x < width; x += 1) {
      if (pixelIndex % sampleEvery === 0) {
        const base = x * bytesPerPixel;
        colors.add(colorKey(current, base, channels));
        if (colors.size >= 4) return colors.size;
      }
      pixelIndex += 1;
    }
    previous.set(current);
  }
  return colors.size;
}

function parsePng(buffer) {
  const idat = [];
  let bitDepth = 0;
  let colorType = 0;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error(`truncated ${type} chunk`);
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!idat.length) throw new Error('missing IDAT chunk');
  return { bitDepth, colorType, idat };
}

function pngChannels(colorType) {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 6) return 4;
  throw new Error(`unsupported color type ${colorType}`);
}

function pngBytesPerPixel(colorType) {
  return pngChannels(colorType);
}

function unfilterScanline(filter, raw, current, previous, bytesPerPixel) {
  for (let i = 0; i < raw.length; i += 1) {
    const left = i >= bytesPerPixel ? current[i - bytesPerPixel] : 0;
    const up = previous[i] || 0;
    const upperLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] || 0 : 0;
    if (filter === 0) current[i] = raw[i];
    else if (filter === 1) current[i] = (raw[i] + left) & 0xff;
    else if (filter === 2) current[i] = (raw[i] + up) & 0xff;
    else if (filter === 3) current[i] = (raw[i] + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) current[i] = (raw[i] + paeth(left, up, upperLeft)) & 0xff;
    else throw new Error(`unsupported PNG filter ${filter}`);
  }
}

function paeth(left, up, upperLeft) {
  const p = left + up - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upperLeft;
}

function colorKey(scanline, base, channels) {
  if (channels === 1) return `${scanline[base]},${scanline[base]},${scanline[base]}`;
  return `${scanline[base]},${scanline[base + 1]},${scanline[base + 2]}`;
}
