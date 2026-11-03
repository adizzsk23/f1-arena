import type { TrackModel } from './model';

export interface TrackProjection {
  /** Index of the segment start sample. */
  index: number;
  /** Arc length along the centerline (m), in [0, length). */
  s: number;
  /** Signed lateral offset (m), positive = left of the driving direction. */
  lateral: number;
  /** Squared distance to the centerline (m²). */
  dist2: number;
}

const GLOBAL_STRIDE = 4;

/**
 * Closest point on the centerline polyline. If hintIndex >= 0 only a ±window segment
 * neighbourhood is searched (O(window)); otherwise a coarse global scan + local refine.
 */
export function project(
  track: TrackModel,
  px: number,
  py: number,
  hintIndex = -1,
  window = 24,
  out?: TrackProjection,
): TrackProjection {
  const res = out ?? { index: 0, s: 0, lateral: 0, dist2: 0 };
  const n = track.n;
  let center = hintIndex;
  let w = window;
  if (center < 0) {
    let best = Infinity;
    for (let i = 0; i < n; i += GLOBAL_STRIDE) {
      const ex = px - track.x[i]!;
      const ey = py - track.y[i]!;
      const d2 = ex * ex + ey * ey;
      if (d2 < best) {
        best = d2;
        center = i;
      }
    }
    w = GLOBAL_STRIDE * 2;
  }
  let bestD2 = Infinity;
  let bestI = center;
  let bestT = 0;
  for (let o = -w; o <= w; o++) {
    const i = (((center + o) % n) + n) % n;
    const k = (i + 1) % n;
    const ax = track.x[i]!;
    const ay = track.y[i]!;
    const sx = track.x[k]! - ax;
    const sy = track.y[k]! - ay;
    const len2 = sx * sx + sy * sy;
    let t = len2 > 0 ? ((px - ax) * sx + (py - ay) * sy) / len2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = ax + sx * t - px;
    const cy = ay + sy * t - py;
    const d2 = cx * cx + cy * cy;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestI = i;
      bestT = t;
    }
  }
  const k = (bestI + 1) % n;
  const sx = track.x[k]! - track.x[bestI]!;
  const sy = track.y[k]! - track.y[bestI]!;
  const len = Math.hypot(sx, sy) || 1;
  const rx = px - track.x[bestI]!;
  const ry = py - track.y[bestI]!;
  res.index = bestI;
  let s = track.s[bestI]! + bestT * track.ds;
  if (s >= track.length) s -= track.length;
  res.s = s;
  res.lateral = (sx * ry - sy * rx) / len;
  res.dist2 = bestD2;
  return res;
}

/** Linear interpolation of a per-sample array at segment index + arc length. */
export function sampleAt(track: TrackModel, arr: Float64Array, s: number): number {
  const fi = s / track.ds;
  const i = Math.floor(fi) % track.n;
  const k = (i + 1) % track.n;
  const f = fi - Math.floor(fi);
  return arr[i]! + (arr[k]! - arr[i]!) * f;
}

/** True when a point (e.g. a tyre contact patch) is fully beyond the white line. */
export function isOutsideTrackEdge(
  track: TrackModel,
  px: number,
  py: number,
  hintIndex = -1,
): boolean {
  const p = project(track, px, py, hintIndex);
  const hw = sampleAt(track, track.halfWidth, p.s);
  return Math.abs(p.lateral) > hw;
}

/** Signed forward distance from sA to sB along the lap, in (-L/2, L/2]. */
export function deltaS(track: TrackModel, sA: number, sB: number): number {
  let d = sB - sA;
  const L = track.length;
  if (d > L / 2) d -= L;
  else if (d <= -L / 2) d += L;
  return d;
}
