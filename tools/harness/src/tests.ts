import type { CarSpec, RawInputFrame, Sim } from '@gx/core';
import {
  createPrng,
  createSim,
  GRAVITY_MPS2,
  kphToMps,
  mpsToKph,
  neutralInput,
  prngNext,
  setCarSpeed,
  SIM_DT_S,
  standardCarSpec,
} from '@gx/core';
import type { TrackModel } from '@gx/track';
import { buildLayout, buildTrack, loadBuiltinTrack, parseTrackJson } from '@gx/track';
import { autoShift, LineBot, PedalSkill } from './bot';

// ---------------------------------------------------------------------------------------
// Test tracks
// ---------------------------------------------------------------------------------------

let strip: TrackModel | null = null;
/** 5 km straight with wide walls (top speed, accel, braking, skidpad area). */
export function dragStrip(): TrackModel {
  if (strip) return strip;
  const res = buildLayout({
    id: 'strip',
    name: 'Drag strip',
    defaultWidth: 40,
    defaultRunoff: 400,
    segments: [
      { kind: 'straight', length: 5000, adjustable: true },
      { kind: 'arc', angleDeg: 90, radius: 900 },
      { kind: 'straight', length: 100, adjustable: true },
      { kind: 'arc', angleDeg: 90, radius: 900 },
      { kind: 'straight', length: 5000 },
      { kind: 'arc', angleDeg: 90, radius: 900 },
      { kind: 'straight', length: 100 },
      { kind: 'arc', angleDeg: 90, radius: 900 },
    ],
    gridSlotsM: [10],
  });
  strip = buildTrack(parseTrackJson(res.json), 4);
  return strip;
}

function stripSim(spec: CarSpec, seed = 1): Sim {
  const t = dragStrip();
  const sim = createSim(seed, spec, t, { gridOffsetM: 0 });
  sim.placeAt(50);
  return sim;
}

const speedOf = (sim: Sim) => Math.hypot(sim.getState().car.vx, sim.getState().car.vy);

// ---------------------------------------------------------------------------------------
// 1. Top speed
// ---------------------------------------------------------------------------------------
export function topSpeed(
  clA: number,
  ers: boolean,
  distanceM = 3000,
): { vmaxKph: number; terminalKph: number } {
  const sim = stripSim(standardCarSpec({ clA }));
  const pedals = new PedalSkill(sim.params.tyre.p.slipRatioPeak);
  if (!ers) sim.getState().car.ersDeployEnabled = false;
  const x0 = sim.getState().car.x;
  let vmax = 0;
  while (sim.getState().car.x - x0 < distanceM) {
    const inp = neutralInput('wheel');
    inp.throttle = pedals.throttleFor(sim, 1, SIM_DT_S);
    autoShift(sim, inp);
    sim.step(inp);
    vmax = Math.max(vmax, speedOf(sim));
  }
  // terminal: keep going (energy permitting) to see the asymptote
  const st = sim.getState();
  st.car.ersStoreJ = sim.spec.ersStoreMaxJ;
  for (let k = 0; k < 120 * 40; k++) {
    const inp = neutralInput('wheel');
    inp.throttle = 1;
    autoShift(sim, inp);
    sim.step(inp);
  }
  return { vmaxKph: mpsToKph(vmax), terminalKph: mpsToKph(speedOf(sim)) };
}

// ---------------------------------------------------------------------------------------
// 2. Acceleration
// ---------------------------------------------------------------------------------------
export function acceleration(): { t100: number; t200: number } {
  const sim = stripSim(standardCarSpec());
  const pedals = new PedalSkill(sim.params.tyre.p.slipRatioPeak);
  let t100 = NaN;
  let t200 = NaN;
  let t = 0;
  while (t < 20 && Number.isNaN(t200)) {
    const inp = neutralInput('wheel');
    inp.throttle = pedals.throttleFor(sim, 1, SIM_DT_S);
    autoShift(sim, inp);
    sim.step(inp);
    t += SIM_DT_S;
    const v = speedOf(sim);
    if (Number.isNaN(t100) && v >= kphToMps(100)) t100 = t;
    if (Number.isNaN(t200) && v >= kphToMps(200)) t200 = t;
  }
  return { t100, t200 };
}

// ---------------------------------------------------------------------------------------
// 3. Braking
// ---------------------------------------------------------------------------------------
export interface BrakeResult {
  distanceM: number;
  peakG: number;
  avgG: number;
  timeS: number;
  /** Mean decel while passing 100→80 km/h (the slow-corner-entry regime). */
  lowSpeedG: number;
}
export function braking(fromKph: number, toKph: number, clA = 4.0): BrakeResult {
  const sim = stripSim(standardCarSpec({ clA }));
  setCarSpeed(sim.params, sim.getState().car, kphToMps(fromKph));
  // settle loads at speed (coast one step so aero load transfer is consistent)
  const pedals = new PedalSkill(sim.params.tyre.p.slipRatioPeak);
  const x0 = sim.getState().car.x;
  const v0 = speedOf(sim);
  const vEnd = Math.max(kphToMps(toKph), 0.3);
  let t = 0;
  let peak = 0;
  // 0.1 s moving average of decel for the peak (filters single-step spikes)
  const win: number[] = [];
  let lowSum = 0;
  let lowN = 0;
  while (speedOf(sim) > vEnd && t < 30) {
    const inp = neutralInput('wheel');
    inp.brake = pedals.brakeFor(sim, 1, SIM_DT_S);
    autoShift(sim, inp);
    sim.step(inp);
    t += SIM_DT_S;
    const vk = mpsToKph(speedOf(sim));
    if (vk <= 100 && vk >= 80) {
      lowSum += -sim.getState().car.ax;
      lowN++;
    }
    win.push(-sim.getState().car.ax);
    if (win.length > 12) win.shift();
    if (win.length === 12) peak = Math.max(peak, win.reduce((a, b) => a + b, 0) / 12);
  }
  const d = sim.getState().car.x - x0;
  const v1 = speedOf(sim);
  return {
    distanceM: d,
    peakG: peak / GRAVITY_MPS2,
    avgG: (v0 - v1) / t / GRAVITY_MPS2,
    timeS: t,
    lowSpeedG: lowN ? lowSum / lowN / GRAVITY_MPS2 : NaN,
  };
}

// ---------------------------------------------------------------------------------------
// 4. Skidpad — steady-state max lateral g at constant speed
// ---------------------------------------------------------------------------------------
/**
 * Constant-speed rig (like a flat-track rolling road): after every physics step the harness
 * restores the speed magnitude (velocity direction and all forces stay physical), the car is
 * in neutral so the rears are free-rolling, and the steering is swept slowly open-loop.
 * Result = highest 0.25 s-sustained lateral acceleration (from tyre/aero forces) before the
 * car departs. This isolates lateral grip from power-limited speed decay at 250 km/h.
 */
export function skidpad(speedKph: number, clA: number, trace = false): number {
  const sim = stripSim(standardCarSpec({ clA }));
  const v0 = kphToMps(speedKph);
  const car0 = sim.getState().car;
  setCarSpeed(sim.params, car0, v0);
  car0.gear = car0.pendingGear = 0;
  const sweepS = 30;
  let best = 0;
  const win: number[] = [];
  for (let k = 0; k < 120 * sweepS; k++) {
    const inp = neutralInput('wheel');
    inp.steer = -k / (120 * sweepS); // turning left, 0 → full lock
    sim.step(inp);
    const st = sim.getState().car;
    const v = Math.hypot(st.vx, st.vy);
    const f = v0 / Math.max(v, 0.1);
    st.vx *= f;
    st.vy *= f;
    for (const w of st.wheels) w.omega *= f;
    const beta = Math.atan2(st.vy, st.vx);
    if (trace && k % 60 === 0)
      console.log(
        (st.ayF / 9.81).toFixed(2),
        inp.steer.toFixed(3),
        beta.toFixed(3),
        st.wheels.map((w) => w.combinedSlip.toFixed(2)).join(' '),
      );
    if (Math.abs(beta) > 0.25) break; // departed (spin)
    win.push(st.ayF);
    if (win.length > 30) win.shift();
    if (win.length === 30) best = Math.max(best, Math.min(...win));
  }
  return best / GRAVITY_MPS2;
}

// ---------------------------------------------------------------------------------------
// 5/6. Bot laps
// ---------------------------------------------------------------------------------------
export interface LapResult {
  lapTimeS: number;
  sectorsS: number[];
  minKph: number;
  maxKph: number;
  gripScale: number;
  clean: boolean;
  wallHits: number;
  maxOffM: number;
}

export function botLap(trackId: 'tt1' | 'inovx', gripScale: number, laps = 2): LapResult {
  const track = loadBuiltinTrack(trackId);
  const sim = createSim(7, standardCarSpec(), track);
  const bot = new LineBot(sim, track, { gripScale });
  let minV = Infinity;
  let maxV = 0;
  let wallHits = 0;
  let maxOff = 0;
  let best = Infinity;
  let bestSectors: number[] = [];
  let bestMin = 0;
  let bestMax = 0;
  const maxT = 400;
  let lapClean = true;
  while (sim.getState().t < maxT && sim.getState().lap.lapsCompleted < laps) {
    sim.step(bot.frame(SIM_DT_S));
    const st = sim.getState();
    const v = speedOf(sim);
    if (st.lap.started) {
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    if (st.car.wallImpactMps > 0.5) {
      wallHits++;
      lapClean = false;
    }
    const hw = track.halfWidth[st.trackIndex]!;
    const off = Math.abs(st.lateralM) - hw;
    if (st.lap.started) maxOff = Math.max(maxOff, off);
    if (off > 1.2) lapClean = false;
    if (st.lap.lastEvent === 'lap') {
      if (lapClean && st.lap.lastLapT < best) {
        best = st.lap.lastLapT;
        bestSectors = [...st.lap.lastSectors];
        bestMin = minV;
        bestMax = maxV;
      }
      minV = Infinity;
      maxV = 0;
      lapClean = true;
    }
  }
  return {
    lapTimeS: best,
    sectorsS: bestSectors,
    minKph: mpsToKph(bestMin),
    maxKph: mpsToKph(bestMax),
    gripScale,
    clean: Number.isFinite(best),
    wallHits,
    maxOffM: maxOff,
  };
}

/** Try decreasing grip scales; return the fastest clean lap (deterministic search). */
export function bestBotLap(trackId: 'tt1' | 'inovx'): LapResult {
  let bestRes: LapResult | null = null;
  for (const g of [1.1, 1.07, 1.04, 1.0, 0.97, 0.94, 0.91, 0.88, 0.85]) {
    const r = botLap(trackId, g);
    if (r.clean && (!bestRes || r.lapTimeS < bestRes.lapTimeS)) bestRes = r;
  }
  return bestRes ?? botLap(trackId, 0.8);
}

// ---------------------------------------------------------------------------------------
// 7. Determinism
// ---------------------------------------------------------------------------------------
export function determinism(): {
  hashA: string;
  hashB: string;
  hashRestored: string;
  steps: number;
} {
  const run = (restoreAt: number) => {
    const track = loadBuiltinTrack('tt1');
    const sim = createSim(1234, standardCarSpec(), track);
    const rng = createPrng(99);
    const steps = 60 * 120;
    let snap = null as ReturnType<Sim['snapshot']> | null;
    const inputs: RawInputFrame[] = [];
    for (let k = 0; k < steps; k++) {
      const inp = neutralInput(k % 2000 < 1000 ? 'gamepad' : 'keyboard');
      inp.throttle = prngNext(rng) < 0.7 ? 1 : prngNext(rng);
      inp.brake = prngNext(rng) < 0.1 ? 1 : 0;
      inp.steer = Math.sin(k / 90) * 0.6 + (prngNext(rng) - 0.5) * 0.2;
      inp.gearUp = k % 240 === 0;
      inp.gearDown = k % 600 === 300;
      inputs.push(inp);
    }
    for (let k = 0; k < steps; k++) {
      if (k === restoreAt) {
        snap = sim.snapshot();
        sim.restore(snap);
      }
      sim.step(inputs[k]!);
    }
    return { hash: sim.hash(), steps };
  };
  const a = run(-1);
  const b = run(-1);
  const c = run(3600);
  return { hashA: a.hash, hashB: b.hash, hashRestored: c.hash, steps: a.steps };
}
