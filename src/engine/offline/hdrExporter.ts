/**
 * Radiance 32-Bit HDR Binary Encoder & Export Pipeline
 *
 * Implements Greg Ward's 32-bit RGBE (.hdr) format encoding and browser file download triggers.
 */

import { xyzToLinearRGB } from '../optics/cie1931';
import { clamp } from '../math/vec2';

/**
 * Encodes a linear floating-point RGB triplet into 32-bit Radiance RGBE bytes.
 */
export function encodeRGBE(
  r: number,
  g: number,
  b: number
): [number, number, number, number] {
  const v = Math.max(r, g, b);
  if (v < 1e-32) {
    return [0, 0, 0, 0];
  }

  // Find exponent: v = m * 2^(e - 128) where m \in [0.5, 1)
  const e = Math.floor(Math.log2(v)) + 1;
  const scale = Math.pow(2.0, 8 - e); // 256 / 2^e

  const re = clamp(Math.floor(r * scale), 0, 255);
  const ge = clamp(Math.floor(g * scale), 0, 255);
  const be = clamp(Math.floor(b * scale), 0, 255);
  const ee = clamp(e + 128, 0, 255);

  return [re, ge, be, ee];
}

/**
 * Decodes 32-bit Radiance RGBE bytes back to linear floating-point RGB.
 */
export function decodeRGBE(
  re: number,
  ge: number,
  be: number,
  ee: number
): [number, number, number] {
  if (ee === 0) {
    return [0, 0, 0];
  }
  const scale = Math.pow(2.0, ee - 128 - 8);
  return [re * scale, ge * scale, be * scale];
}

/**
 * Encodes an entire RGBA32F XYZ accumulation buffer into a standard Radiance .hdr binary file.
 */
export function encodeHDR(
  buffer: Float32Array,
  width: number,
  height: number,
  exposure: number = 1.0
): Uint8Array {
  const headerStr =
    `#?RADIANCE\n` +
    `FORMAT=32-bit_rle_rgbe\n` +
    `EXPOSURE=${exposure.toFixed(4)}\n\n` +
    `-Y ${height} +X ${width}\n`;

  const headerBytes = new TextEncoder().encode(headerStr);
  const pixelBytes = new Uint8Array(width * height * 4);

  let byteOffset = 0;
  for (let i = 0; i < width * height; i++) {
    const bufIdx = i * 4;
    const rawX = buffer[bufIdx + 0];
    const rawY = buffer[bufIdx + 1];
    const rawZ = buffer[bufIdx + 2];

    const rgb = xyzToLinearRGB(rawX * exposure, rawY * exposure, rawZ * exposure);
    const [re, ge, be, ee] = encodeRGBE(rgb.r, rgb.g, rgb.b);

    pixelBytes[byteOffset++] = re;
    pixelBytes[byteOffset++] = ge;
    pixelBytes[byteOffset++] = be;
    pixelBytes[byteOffset++] = ee;
  }

  const out = new Uint8Array(headerBytes.length + pixelBytes.length);
  out.set(headerBytes, 0);
  out.set(pixelBytes, headerBytes.length);
  return out;
}

/**
 * Creates a downloadable Radiance .hdr Blob.
 */
export function exportHDRBlob(
  buffer: Float32Array,
  width: number,
  height: number,
  exposure: number = 1.0
): Blob {
  const bytes = encodeHDR(buffer, width, height, exposure);
  return new Blob([bytes.buffer], { type: 'image/vnd.radiance' });
}

/**
 * Triggers a browser download of a given Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports canvas content directly as a PNG file download.
 */
export function exportCanvasPNG(canvas: HTMLCanvasElement, filename: string): void {
  if (!canvas || typeof canvas.toBlob !== 'function') return;
  canvas.toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, filename);
    }
  }, 'image/png');
}
