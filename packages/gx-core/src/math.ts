/** Minimal scalar / 2-D helpers. Allocation-free where it matters. */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Move `cur` toward `target` by at most `maxDelta`. */
export function approach(cur: number, target: number, maxDelta: number): number {
  if (cur < target) return Math.min(cur + maxDelta, target);
  return Math.max(cur - maxDelta, target);
}

/** Piecewise-linear interpolation over sorted (x, y) points, clamped at the ends. */
export function interpTable(table: ReadonlyArray<readonly [number, number]>, x: number): number {
  const n = table.length;
  const first = table[0]!;
  if (x <= first[0]) return first[1];
  const last = table[n - 1]!;
  if (x >= last[0]) return last[1];
  for (let i = 1; i < n; i++) {
    const b = table[i]!;
    if (x <= b[0]) {
      const a = table[i - 1]!;
      return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    }
  }
  return last[1];
}

export function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
}
