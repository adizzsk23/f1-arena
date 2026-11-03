import type { TrackJson } from './schema';

/** Resampled, query-ready track. Arrays are indexed by sample i at arc length s[i] = i * ds. */
export interface TrackModel {
  id: string;
  name: string;
  /** Total centerline length (m). */
  length: number;
  /** Sample spacing (m). */
  ds: number;
  n: number;
  x: Float64Array;
  y: Float64Array;
  /** Unit tangent. Left normal is (-ty, tx). */
  tx: Float64Array;
  ty: Float64Array;
  s: Float64Array;
  /** Signed curvature (1/m), positive = turning left. */
  curvature: Float64Array;
  halfWidth: Float64Array;
  wallL: Float64Array;
  wallR: Float64Array;
  kerbL: Uint8Array;
  kerbR: Uint8Array;
  /** Sector boundary arc lengths (m), excluding 0. */
  sectorS: number[];
  json: TrackJson;
}

const DENSE_PER_SEGMENT = 24;
const DEFAULT_DS_M = 2;

/**
 * Centripetal Catmull-Rom (alpha = 0.5) through closed control points,
 * then arc-length resampled at uniform spacing ds.
 */
export function buildTrack(json: TrackJson, dsTarget = DEFAULT_DS_M): TrackModel {
  const pts = json.points;
  const m = pts.length;
  // Dense sampling
  const dx: number[] = [];
  const dy: number[] = [];
  const dAttr: { seg: number; t: number }[] = [];
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % m]!;
    const p3 = pts[(i + 2) % m]!;
    const t0 = 0;
    const t1 = t0 + Math.sqrt(Math.hypot(p1.x - p0.x, p1.y - p0.y)) + 1e-9;
    const t2 = t1 + Math.sqrt(Math.hypot(p2.x - p1.x, p2.y - p1.y)) + 1e-9;
    const t3 = t2 + Math.sqrt(Math.hypot(p3.x - p2.x, p3.y - p2.y)) + 1e-9;
    for (let k = 0; k < DENSE_PER_SEGMENT; k++) {
      const u = k / DENSE_PER_SEGMENT;
      const t = t1 + (t2 - t1) * u;
      const [x, y] = catmullRom(p0, p1, p2, p3, t0, t1, t2, t3, t);
      dx.push(x);
      dy.push(y);
      dAttr.push({ seg: i, t: u });
    }
  }
  const nd = dx.length;
  const cum = new Float64Array(nd + 1);
  for (let i = 0; i < nd; i++) {
    const j = (i + 1) % nd;
    cum[i + 1] = cum[i]! + Math.hypot(dx[j]! - dx[i]!, dy[j]! - dy[i]!);
  }
  const length = cum[nd]!;
  const n = Math.max(8, Math.round(length / dsTarget));
  const ds = length / n;

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const s = new Float64Array(n);
  const halfWidth = new Float64Array(n);
  const wallL = new Float64Array(n);
  const wallR = new Float64Array(n);
  const kerbL = new Uint8Array(n);
  const kerbR = new Uint8Array(n);

  let j = 0;
  for (let i = 0; i < n; i++) {
    const si = i * ds;
    while (j < nd - 1 && cum[j + 1]! < si) j++;
    const segLen = cum[j + 1]! - cum[j]!;
    const f = segLen > 0 ? (si - cum[j]!) / segLen : 0;
    const jn = (j + 1) % nd;
    x[i] = dx[j]! + (dx[jn]! - dx[j]!) * f;
    y[i] = dy[j]! + (dy[jn]! - dy[j]!) * f;
    s[i] = si;
    const a = dAttr[j]!;
    const pA = pts[a.seg]!;
    const pB = pts[(a.seg + 1) % m]!;
    const u = a.t + f / DENSE_PER_SEGMENT;
    halfWidth[i] = 0.5 * (pA.width + (pB.width - pA.width) * u);
    wallL[i] = pA.wallL + (pB.wallL - pA.wallL) * u;
    wallR[i] = pA.wallR + (pB.wallR - pA.wallR) * u;
    kerbL[i] = (u < 0.5 ? pA.kerbL : pB.kerbL) ? 1 : 0;
    kerbR[i] = (u < 0.5 ? pA.kerbR : pB.kerbR) ? 1 : 0;
  }

  const tx = new Float64Array(n);
  const ty = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ip = (i + 1) % n;
    const im = (i - 1 + n) % n;
    const ex = x[ip]! - x[im]!;
    const ey = y[ip]! - y[im]!;
    const l = Math.hypot(ex, ey) || 1;
    tx[i] = ex / l;
    ty[i] = ey / l;
  }
  const curvature = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ip = (i + 1) % n;
    const im = (i - 1 + n) % n;
    // κ = dθ/ds, central difference of heading
    const a0 = Math.atan2(ty[im]!, tx[im]!);
    const a1 = Math.atan2(ty[ip]!, tx[ip]!);
    curvature[i] = wrapAngle(a1 - a0) / (2 * ds);
  }

  return {
    id: json.id,
    name: json.name,
    length,
    ds,
    n,
    x,
    y,
    tx,
    ty,
    s,
    curvature,
    halfWidth,
    wallL,
    wallR,
    kerbL,
    kerbR,
    sectorS: json.sectors.map((f) => f * length),
    json,
  };
}

function catmullRom(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  t: number,
): [number, number] {
  const lerp = (a: number, b: number, ta: number, tb: number) => {
    const w = (t - ta) / (tb - ta);
    return a + (b - a) * w;
  };
  const a1x = lerp(p0.x, p1.x, t0, t1);
  const a1y = lerp(p0.y, p1.y, t0, t1);
  const a2x = lerp(p1.x, p2.x, t1, t2);
  const a2y = lerp(p1.y, p2.y, t1, t2);
  const a3x = lerp(p2.x, p3.x, t2, t3);
  const a3y = lerp(p2.y, p3.y, t2, t3);
  const b1x = lerp(a1x, a2x, t0, t2);
  const b1y = lerp(a1y, a2y, t0, t2);
  const b2x = lerp(a2x, a3x, t1, t3);
  const b2y = lerp(a2y, a3y, t1, t3);
  return [lerp(b1x, b2x, t1, t2), lerp(b1y, b2y, t1, t2)];
}

export function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

/** Wrap an arc length into [0, length). */
export function wrapS(track: TrackModel, s: number): number {
  let r = s % track.length;
  if (r < 0) r += track.length;
  return r;
}

/** Interpolated pose on the centerline at arc length s. */
export function poseAt(
  track: TrackModel,
  sIn: number,
): { x: number; y: number; heading: number; i: number } {
  const s = wrapS(track, sIn);
  const fi = s / track.ds;
  const i = Math.floor(fi) % track.n;
  const k = (i + 1) % track.n;
  const f = fi - Math.floor(fi);
  const x = track.x[i]! + (track.x[k]! - track.x[i]!) * f;
  const y = track.y[i]! + (track.y[k]! - track.y[i]!) * f;
  return { x, y, heading: Math.atan2(track.ty[i]!, track.tx[i]!), i };
}
