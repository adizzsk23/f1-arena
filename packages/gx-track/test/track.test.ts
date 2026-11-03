import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TRACK_LIST,
  createLapTimer,
  isOutsideTrackEdge,
  loadBuiltinTrack,
  poseAt,
  project,
  updateLapTimer,
} from '../src';

describe('tracks', () => {
  it('load and have plausible lengths', () => {
    const tt1 = loadBuiltinTrack('tt1');
    const main = loadBuiltinTrack('inovx');
    expect(tt1.length).toBeGreaterThan(2400);
    expect(main.length).toBeGreaterThan(5300);
    expect(main.length).toBeLessThan(5700);
    expect(main.sectorS).toHaveLength(2);
    expect(main.json.corners.length).toBeGreaterThanOrEqual(15);
    expect(BUILTIN_TRACK_LIST).toHaveLength(2);
  });

  it('projects points onto the centerline with signed lateral offset', () => {
    const t = loadBuiltinTrack('tt1');
    const p = poseAt(t, 300);
    const nx = -Math.sin(p.heading);
    const ny = Math.cos(p.heading);
    const r = project(t, p.x + nx * 3, p.y + ny * 3);
    expect(r.s).toBeCloseTo(300, 0);
    expect(r.lateral).toBeCloseTo(3, 1);
    expect(isOutsideTrackEdge(t, p.x + nx * 3, p.y + ny * 3)).toBe(false);
    expect(isOutsideTrackEdge(t, p.x + nx * 9, p.y + ny * 9)).toBe(true);
  });

  it('times laps and sectors with sub-step interpolation', () => {
    const t = loadBuiltinTrack('tt1');
    const lt = createLapTimer(t);
    const v = 50; // m/s constant
    const dt = 1 / 120;
    let s = t.length - 10;
    let time = 0;
    for (let k = 0; k < 120 * 140; k++) {
      const sN = (s + v * dt) % t.length;
      updateLapTimer(lt, t, s, sN, time, time + dt);
      s = sN;
      time += dt;
    }
    expect(lt.lapsCompleted).toBeGreaterThanOrEqual(1);
    expect(lt.lastLapT).toBeCloseTo(t.length / v, 3);
    const sum = lt.lastSectors.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(lt.lastLapT, 6);
  });
});
