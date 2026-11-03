import type { TrackModel, TrackProjection } from '@gx/track';
import { project, sampleAt } from '@gx/track';
import { WALL_FRICTION, WALL_RESTITUTION } from '../config/physics';
import type { CarParams, CarState } from './vehicle';

const proj: TrackProjection = { index: 0, s: 0, lateral: 0, dist2: 0 };

/**
 * Phase 1 analytic car↔wall contact (walls = offsets from the centerline). For each hull
 * point beyond a wall: positional correction + impulse with restitution e and Coulomb
 * friction μ:  jn = −(1+e)·vn / (1/m + (r×n)²/Iz),  |jt| ≤ μ·jn.
 * Rapier takes over car↔car (and may take walls) in Phase 5.
 */
export function resolveWalls(
  p: CarParams,
  st: CarState,
  track: TrackModel,
  hintIndex: number,
): number {
  const m = p.massKg;
  const Iz = p.spec.yawInertiaKgM2;
  let maxImpact = 0;
  for (let k = 0; k < p.hullX.length; k++) {
    const cy = Math.cos(st.yaw);
    const sy = Math.sin(st.yaw);
    const bx = p.hullX[k]!;
    const by = p.hullY[k]!;
    const rx = bx * cy - by * sy;
    const ry = bx * sy + by * cy;
    project(track, st.x + rx, st.y + ry, hintIndex, 10, proj);
    const wl = sampleAt(track, track.wallL, proj.s);
    const wr = sampleAt(track, track.wallR, proj.s);
    const ti = proj.index;
    const tx = track.tx[ti]!;
    const ty = track.ty[ti]!;
    let pen = 0;
    let nx = 0;
    let ny = 0;
    if (proj.lateral > wl) {
      pen = proj.lateral - wl;
      nx = ty; // right-pointing normal (back toward the track)
      ny = -tx;
    } else if (proj.lateral < -wr) {
      pen = -wr - proj.lateral;
      nx = -ty;
      ny = tx;
    } else continue;

    st.x += nx * pen;
    st.y += ny * pen;
    // world-frame velocity
    let vwx = st.vx * cy - st.vy * sy;
    let vwy = st.vx * sy + st.vy * cy;
    let w = st.yawRate;
    const vpx = vwx - w * ry;
    const vpy = vwy + w * rx;
    const vn = vpx * nx + vpy * ny;
    if (vn < 0) {
      maxImpact = Math.max(maxImpact, -vn);
      const rn = rx * ny - ry * nx;
      const jn = (-(1 + WALL_RESTITUTION) * vn) / (1 / m + (rn * rn) / Iz);
      vwx += (jn * nx) / m;
      vwy += (jn * ny) / m;
      w += (rn * jn) / Iz;
      // friction along the wall tangent
      const tnx = -ny;
      const tny = nx;
      const vtx = vwx - w * ry;
      const vty = vwy + w * rx;
      const vt = vtx * tnx + vty * tny;
      const rt = rx * tny - ry * tnx;
      let jt = -vt / (1 / m + (rt * rt) / Iz);
      const jmax = WALL_FRICTION * jn;
      if (jt > jmax) jt = jmax;
      else if (jt < -jmax) jt = -jmax;
      vwx += (jt * tnx) / m;
      vwy += (jt * tny) / m;
      w += (rt * jt) / Iz;
      st.vx = vwx * cy + vwy * sy;
      st.vy = -vwx * sy + vwy * cy;
      st.yawRate = w;
    }
  }
  return maxImpact;
}
