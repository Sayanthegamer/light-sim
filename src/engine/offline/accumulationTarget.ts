/**
 * High-Precision 32-Bit Floating Point (RGBA32F) Accumulation Target
 *
 * Accumulates continuous spectral CIE XYZ radiant flux, provides bilinear
 * sub-pixel splatting, multi-thread tile merging, and progressive tonemapped
 * 8-bit/16-bit display resolution.
 */

import { xyzToLinearRGB, linearToSRGBGamma } from '../optics/cie1931';
import { clamp } from '../math/vec2';

export interface ITonemapOptions {
  exposure?: number;
  gamma?: number;
  tonemap?: 'reinhard' | 'aces' | 'linear';
  whitePoint?: number;
}

export class AccumulationTarget {
  public readonly width: number;
  public readonly height: number;
  public readonly buffer: Float32Array; // [X, Y, Z, Weight]
  public readonly sampleCountMap: Uint32Array;

  constructor(width: number, height: number) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.buffer = new Float32Array(this.width * this.height * 4);
    this.sampleCountMap = new Uint32Array(this.width * this.height);
  }

  /**
   * Resets all accumulated float samples and hit counters.
   */
  public reset(): void {
    this.buffer.fill(0);
    this.sampleCountMap.fill(0);
  }

  /**
   * Returns the total sum of all photon hits recorded in the target.
   */
  public getTotalSamples(): number {
    let total = 0;
    const len = this.sampleCountMap.length;
    for (let i = 0; i < len; i++) {
      total += this.sampleCountMap[i];
    }
    return total;
  }

  /**
   * Directly splats a continuous CIE XYZ sample into an integer pixel location.
   */
  public splat(
    x: number,
    y: number,
    xyz: { x: number; y: number; z: number },
    weight: number = 1.0
  ): void {
    const px = Math.floor(x);
    const py = Math.floor(y);

    if (px < 0 || px >= this.width || py < 0 || py >= this.height) {
      return;
    }

    const pixelIdx = py * this.width + px;
    const bufIdx = pixelIdx * 4;

    this.buffer[bufIdx + 0] += xyz.x * weight;
    this.buffer[bufIdx + 1] += xyz.y * weight;
    this.buffer[bufIdx + 2] += xyz.z * weight;
    this.buffer[bufIdx + 3] += weight;
    this.sampleCountMap[pixelIdx]++;
  }

  /**
   * Bilinearly splats a continuous XYZ sample across 4 adjacent sub-pixels.
   */
  public splatBilinear(
    x: number,
    y: number,
    xyz: { x: number; y: number; z: number },
    weight: number = 1.0
  ): void {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const u = x - fx;
    const v = y - fy;

    const w00 = (1.0 - u) * (1.0 - v) * weight;
    const w10 = u * (1.0 - v) * weight;
    const w01 = (1.0 - u) * v * weight;
    const w11 = u * v * weight;

    if (w00 > 1e-5) this.splat(fx, fy, xyz, w00);
    if (w10 > 1e-5) this.splat(fx + 1, fy, xyz, w10);
    if (w01 > 1e-5) this.splat(fx, fy + 1, xyz, w01);
    if (w11 > 1e-5) this.splat(fx + 1, fy + 1, xyz, w11);
  }

  /**
   * Splats a continuous line segment of radiant flux into the buffer (e.g. volumetric ray step).
   */
  public splatLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    xyz: { x: number; y: number; z: number },
    totalWeight: number = 1.0
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) {
      this.splatBilinear(x0, y0, xyz, totalWeight);
      return;
    }

    const steps = Math.max(1, Math.ceil(dist * 2.0)); // 0.5px subpixel steps
    const stepWeight = totalWeight / steps;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x0 + t * dx;
      const py = y0 + t * dy;
      this.splatBilinear(px, py, xyz, stepWeight);
    }
  }

  /**
   * Merges an incoming tile packet from a background worker thread into the master accumulation target.
   */
  public mergeTile(
    tileX: number,
    tileY: number,
    tileWidth: number,
    tileHeight: number,
    tileBuffer: Float32Array
  ): void {
    for (let ty = 0; ty < tileHeight; ty++) {
      const my = tileY + ty;
      if (my < 0 || my >= this.height) continue;

      for (let tx = 0; tx < tileWidth; tx++) {
        const mx = tileX + tx;
        if (mx < 0 || mx >= this.width) continue;

        const tileIdx = (ty * tileWidth + tx) * 4;
        const masterIdx = (my * this.width + mx) * 4;
        const masterPixel = my * this.width + mx;

        const tw = tileBuffer[tileIdx + 3];
        if (tw > 0) {
          this.buffer[masterIdx + 0] += tileBuffer[tileIdx + 0];
          this.buffer[masterIdx + 1] += tileBuffer[tileIdx + 1];
          this.buffer[masterIdx + 2] += tileBuffer[tileIdx + 2];
          this.buffer[masterIdx + 3] += tw;
          this.sampleCountMap[masterPixel]++;
        }
      }
    }
  }

  /**
   * Resolves the HDR accumulation buffer into 8-bit sRGB pixels with exposure and tonemapping.
   */
  public resolveToImageData(
    outBytes: Uint8ClampedArray,
    options?: ITonemapOptions
  ): void {
    const exposure = options?.exposure ?? 1.0;
    const tonemap = options?.tonemap ?? 'reinhard';
    const whitePoint = options?.whitePoint ?? 4.0;
    const lWhiteSq = whitePoint * whitePoint;

    const numPixels = this.width * this.height;

    for (let i = 0; i < numPixels; i++) {
      const bIdx = i * 4;

      const rawX = this.buffer[bIdx + 0];
      const rawY = this.buffer[bIdx + 1];
      const rawZ = this.buffer[bIdx + 2];

      if (rawX <= 0 && rawY <= 0 && rawZ <= 0) {
        outBytes[bIdx + 0] = 0;
        outBytes[bIdx + 1] = 0;
        outBytes[bIdx + 2] = 0;
        outBytes[bIdx + 3] = 255;
        continue;
      }

      // 1. Convert to Linear sRGB
      const linearRgb = xyzToLinearRGB(rawX * exposure, rawY * exposure, rawZ * exposure);

      let r = linearRgb.r;
      let g = linearRgb.g;
      let b = linearRgb.b;

      // 2. Apply Tonemapping
      if (tonemap === 'reinhard') {
        // Luminance-weighted extended Reinhard
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (lum > 1e-6) {
          const tonemappedLum = (lum * (1.0 + lum / lWhiteSq)) / (1.0 + lum);
          const scale = tonemappedLum / lum;
          r *= scale;
          g *= scale;
          b *= scale;
        }
      } else if (tonemap === 'aces') {
        // Narkowicz ACES fit
        r = (r * (2.51 * r + 0.03)) / (r * (2.43 * r + 0.59) + 0.14);
        g = (g * (2.51 * g + 0.03)) / (g * (2.43 * g + 0.59) + 0.14);
        b = (b * (2.51 * b + 0.03)) / (b * (2.43 * b + 0.59) + 0.14);
      }

      // 3. Apply Gamma & Clamp into [0, 255]
      const srgbR = clamp(linearToSRGBGamma(r), 0.0, 1.0);
      const srgbG = clamp(linearToSRGBGamma(g), 0.0, 1.0);
      const srgbB = clamp(linearToSRGBGamma(b), 0.0, 1.0);

      outBytes[bIdx + 0] = Math.round(srgbR * 255);
      outBytes[bIdx + 1] = Math.round(srgbG * 255);
      outBytes[bIdx + 2] = Math.round(srgbB * 255);
      outBytes[bIdx + 3] = 255; // Fully opaque
    }
  }
}
