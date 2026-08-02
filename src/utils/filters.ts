/**
 * 1 Euro Filter for smoothing pose landmarks.
 * https://cristal.univ-lille.fr/~casiez/1euro/
 */

export class OneEuroFilter {
  private freq: number;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  private xPrev: number | null = null;
  private dxPrev: number | null = null;
  private tPrev: number | null = null;

  constructor(freq: number, minCutoff: number = 1.0, beta: number = 0.0, dCutoff: number = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const te = 1.0 / this.freq;
    return 1.0 / (1.0 + tau / te);
  }

  filter(x: number, timestamp?: number): number {
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = x;
      this.tPrev = timestamp ?? performance.now() / 1000;
      return x;
    }

    const t = timestamp ?? performance.now() / 1000;
    let dt = t - this.tPrev;
    if (dt <= 0) dt = 1e-5;

    // Update frequency
    this.freq = 1.0 / dt;
    this.tPrev = t;

    // Estimate velocity
    const dx = (x - this.xPrev) / dt;

    // Filter velocity
    const edx = this.alpha(this.dCutoff) * dx + (1 - this.alpha(this.dCutoff)) * (this.dxPrev ?? dx);
    this.dxPrev = edx;

    // Filter position
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const ex = this.alpha(cutoff) * x + (1 - this.alpha(cutoff)) * this.xPrev;
    this.xPrev = ex;

    return ex;
  }
}

export class LandmarkFilter {
  private filters: { x: OneEuroFilter; y: OneEuroFilter; z: OneEuroFilter };

  constructor(freq: number, minCutoff: number, beta: number) {
    this.filters = {
      x: new OneEuroFilter(freq, minCutoff, beta),
      y: new OneEuroFilter(freq, minCutoff, beta),
      z: new OneEuroFilter(freq, minCutoff, beta),
    };
  }

  filter(lm: { x: number; y: number; z?: number; visibility?: number }, timestamp: number) {
    return {
      x: this.filters.x.filter(lm.x, timestamp),
      y: this.filters.y.filter(lm.y, timestamp),
      z: lm.z ? this.filters.z.filter(lm.z, timestamp) : lm.z,
      visibility: lm.visibility,
    };
  }
}

export class PoseFilter {
  private filters: LandmarkFilter[] | null = null;

  filter(landmarks: { x: number; y: number; z?: number; visibility?: number }[], timestamp: number) {
    if (!this.filters) {
      // Very light smoothing for minimum latency: minCutoff=0.8, beta=0.01
      this.filters = landmarks.map(() => new LandmarkFilter(30, 0.8, 0.01));
    }

    return landmarks.map((lm, i) => this.filters![i].filter(lm, timestamp));
  }
}
