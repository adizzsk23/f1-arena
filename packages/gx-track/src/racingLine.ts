import type { TrackModel } from './model';
import { wrapAngle } from './model';

export interface RacingLine {
  /** Lateral offset from centerline per track sample (m, + = left). */
  offset: Float64Array;
  x: Float64Array;
  y: Float64Array;
  /** Arc length along the racing line itself (m), monotonic. */
  sLine: Float64Array;
  /** Signed curvature of the racing line (1/m). */
  curvature: Float64Array;
  length: number;
}

export interface RacingLineOptions {
  /** Distance kept from the white line (m). */
  edgeMarginM?: number;
  iterations?: number;
  /** Coarse spacing used for the relaxation (m). */
  coarseDsM?: number;
}

/**
 * Approximate minimum-curvature line: an elastic band relaxed along the track normals.
 * Each iteration moves every point toward the midpoint of its neighbours (which reduces
 * Σ|P[i-1] - 2P[i] + P[i+1]|², i.e. curvature) and clamps it inside the track edges.
 */
export function computeRacingLine(track: TrackModel, opts: RacingLineOptions = {}): RacingLine {
  const margin = opts.edgeMarginM ?? 1.6;
  const iters = opts.iterations ?? 6000;
  const stride = Math.max(1, Math.round((opts.coarseDsM ?? 6) / track.ds));
  const m = Math.floor(track.n / stride);
  const cx = new Float64Array(m);
  const cy = new Float64Array(m);
  const nx = new Float64Array(m);
  const ny = new Float64Array(m);
  const lim = new Float64Array(m);
  const off = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    const i = j * stride;
    cx[j] = track.x[i]!;
    cy[j] = track.y[i]!;
    nx[j] = -track.ty[i]!;
    ny[j] = track.tx[i]!;
    lim[j] = Math.max(0, track.halfWidth[i]! - margin);
  }
  const alpha = 0.5;
  for (let it = 0; it < iters; it++) {
    for (let j = 0; j < m; j++) {
      const a = (j - 1 + m) % m;
      const b = (j + 1) % m;
      const pax = cx[a]! + nx[a]! * off[a]!;
      const pay = cy[a]! + ny[a]! * off[a]!;
      const pbx = cx[b]! + nx[b]! * off[b]!;
      const pby = cy[b]! + ny[b]! * off[b]!;
      const px = cx[j]! + nx[j]! * off[j]!;
      const py = cy[j]! + ny[j]! * off[j]!;
      const mx = 0.5 * (pax + pbx) - px;
      const my = 0.5 * (pay + pby) - py;
      let o = off[j]! + alpha * (mx * nx[j]! + my * ny[j]!);
      const l = lim[j]!;
      if (o > l) o = l;
      else if (o < -l) o = -l;
      off[j] = o;
    }
  }
  // Upsample offsets to full resolution (linear)
  const offset = new Float64Array(track.n);
  for (let i = 0; i < track.n; i++) {
    const fj = i / stride;
    const j0 = Math.floor(fj) % m;
    const j1 = (j0 + 1) % m;
    const f = fj - Math.floor(fj);
    offset[i] = off[j0]! + (off[j1]! - off[j0]!) * f;
  }
  return racingLineFromOffsets(track, offset);
}

export function racingLineFromOffsets(track: TrackModel, offset: Float64Array): RacingLine {
  const n = track.n;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = track.x[i]! - track.ty[i]! * offset[i]!;
    y[i] = track.y[i]! + track.tx[i]! * offset[i]!;
  }
  const sLine = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    sLine[i] = sLine[i - 1]! + Math.hypot(x[i]! - x[i - 1]!, y[i]! - y[i - 1]!);
  }
  const length = sLine[n - 1]! + Math.hypot(x[0]! - x[n - 1]!, y[0]! - y[n - 1]!);
  const curvature = new Float64Array(n);
  // Curvature over a ±2-sample stencil to suppress resampling noise.
  const k = 2;
  for (let i = 0; i < n; i++) {
    const a = (i - k + n) % n;
    const b = (i + k) % n;
    const ia = (i - 1 + n) % n;
    const ib = (i + 1) % n;
    const h0 = Math.atan2(y[i]! - y[a]!, x[i]! - x[a]!);
    const h1 = Math.atan2(y[b]! - y[i]!, x[b]! - x[i]!);
    const segA = Math.hypot(x[i]! - x[ia]!, y[i]! - y[ia]!);
    const segB = Math.hypot(x[ib]! - x[i]!, y[ib]! - y[i]!);
    // chord midpoints are ~k samples apart: κ ≈ Δheading / (k · ds)
    curvature[i] = wrapAngle(h1 - h0) / (0.5 * k * (segA + segB) + 1e-9);
  }
  return { offset, x, y, sLine, curvature, length };
}
