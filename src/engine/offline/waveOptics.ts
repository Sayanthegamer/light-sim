/**
 * Wave-Optics & Huygens-Fresnel Field Superposition Engine
 *
 * Implements complex wave phase tracking (\phi = \vec{k}\cdot\vec{r} - \omega t),
 * aperture/slit secondary wavelet arrays, coherent field superposition (\tilde{E} = \sum A_k e^{i \phi_k}),
 * and Fraunhofer/Fresnel diffraction envelope evaluators.
 */

export interface IWaveletSource {
  origin: { x: number; y: number };
  phase: number;
  amplitude: number;
}

export interface IComplexSuperposition {
  real: number;
  imag: number;
  intensity: number;
  phase: number;
}

/**
 * Advances the optical phase of a wave over physical path length.
 *
 * @param currentPhase Initial phase \in [0, 2\pi)
 * @param opticalDistance Path distance in same unit as wavelength (e.g. nm)
 * @param wavelength Wavelength in same unit (e.g. nm)
 * @returns Updated phase \in [0, 2\pi)
 */
export function advanceWavePhase(
  currentPhase: number,
  opticalDistance: number,
  wavelength: number
): number {
  if (wavelength <= 0.0) return currentPhase;
  const k = (2.0 * Math.PI) / wavelength;
  const deltaPhase = k * opticalDistance;
  const totalPhase = currentPhase + deltaPhase;
  const twoPi = 2.0 * Math.PI;
  return ((totalPhase % twoPi) + twoPi) % twoPi;
}

/**
 * Discretizes a 2D aperture or slit opening [p1, p2] into N coherent Huygens-Fresnel secondary wavelets.
 *
 * @param p1 Start coordinate of aperture slit
 * @param p2 End coordinate of aperture slit
 * @param count Number of secondary wavelet point sources to generate
 * @param incidentPhase Coherent phase of incoming wavefront across the aperture
 * @param incidentAmplitude Total incident field amplitude
 */
export function discretizeApertureToWavelets(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  count: number,
  incidentPhase: number = 0.0,
  incidentAmplitude: number = 1.0
): IWaveletSource[] {
  const n = Math.max(1, count);
  const wavelets: IWaveletSource[] = [];
  const ampPerWavelet = incidentAmplitude / n;

  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = p1.x + t * (p2.x - p1.x);
    const y = p1.y + t * (p2.y - p1.y);

    wavelets.push({
      origin: { x, y },
      phase: incidentPhase,
      amplitude: ampPerWavelet
    });
  }

  return wavelets;
}

/**
 * Superposes multiple complex harmonic wavefields at a target observation point.
 * \tilde{E}_{\text{total}} = \sum_k A_k e^{i (\phi_{0,k} + k \cdot d_k)}
 */
export function superposeComplexFields(
  wavelets: Array<{
    distance: number;
    wavelengthNm: number;
    initialPhase: number;
    amplitude: number;
  }>
): IComplexSuperposition {
  let realSum = 0.0;
  let imagSum = 0.0;

  for (let i = 0; i < wavelets.length; i++) {
    const w = wavelets[i];
    if (w.wavelengthNm <= 0.0 || w.amplitude <= 0.0) continue;

    const k = (2.0 * Math.PI) / w.wavelengthNm;
    const phase = w.initialPhase + k * w.distance;

    realSum += w.amplitude * Math.cos(phase);
    imagSum += w.amplitude * Math.sin(phase);
  }

  const intensity = realSum * realSum + imagSum * imagSum;
  const phase = Math.atan2(imagSum, realSum);

  return {
    real: realSum,
    imag: imagSum,
    intensity,
    phase
  };
}

/**
 * Evaluates the analytic Fraunhofer Single-Slit diffraction intensity profile:
 * I(\theta) = I_0 \left( \frac{\sin \beta}{\beta} \right)^2, \quad \beta = \frac{\pi b}{\lambda} \sin\theta
 *
 * @param slitWidth Width of slit opening b
 * @param wavelengthNm Light wavelength \lambda
 * @param screenDistance Distance from slit to sensor screen L
 * @param screenOffset Transverse position on sensor screen y
 */
export function evaluateSingleSlitDiffraction(
  slitWidth: number,
  wavelengthNm: number,
  screenDistance: number,
  screenOffset: number
): number {
  if (screenDistance <= 0.0 || slitWidth <= 0.0 || wavelengthNm <= 0.0) return 1.0;
  const sinTheta = screenOffset / Math.hypot(screenDistance, screenOffset);
  const beta = ((Math.PI * slitWidth) / wavelengthNm) * sinTheta;

  if (Math.abs(beta) < 1e-6) {
    return 1.0;
  }
  const sinc = Math.sin(beta) / beta;
  return sinc * sinc;
}

/**
 * Evaluates the analytic Fraunhofer Double-Slit diffraction & interference pattern:
 * I(\theta) = I_0 \left( \frac{\sin \beta}{\beta} \right)^2 \cos^2 \alpha
 * where \beta = \frac{\pi b}{\lambda} \sin\theta, \quad \alpha = \frac{\pi d}{\lambda} \sin\theta
 *
 * @param slitDistance Center-to-center slit separation d
 * @param slitWidth Individual slit width b
 * @param wavelengthNm Light wavelength \lambda
 * @param screenDistance Distance from slit to sensor screen L
 * @param screenOffset Transverse position on sensor screen y
 */
export function evaluateDoubleSlitInterference(
  slitDistance: number,
  slitWidth: number,
  wavelengthNm: number,
  screenDistance: number,
  screenOffset: number
): number {
  if (screenDistance <= 0.0 || wavelengthNm <= 0.0) return 1.0;
  const sinTheta = screenOffset / Math.hypot(screenDistance, screenOffset);

  // Single slit diffraction envelope
  const beta = ((Math.PI * slitWidth) / wavelengthNm) * sinTheta;
  let sincSq = 1.0;
  if (Math.abs(beta) >= 1e-6) {
    const sinc = Math.sin(beta) / beta;
    sincSq = sinc * sinc;
  }

  // Double slit interference fringe term
  const alpha = ((Math.PI * slitDistance) / wavelengthNm) * sinTheta;
  const cosAlpha = Math.cos(alpha);
  const cosSq = cosAlpha * cosAlpha;

  return sincSq * cosSq;
}
