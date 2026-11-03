import type { LapTimerState, TrackModel, TrackProjection } from '@gx/track';
import { abortLap, createLapTimer, poseAt, project, sampleAt, updateLapTimer } from '@gx/track';
import type { CarSpec } from './carSpec';
import { BRAKE_BIAS_STEP } from './config/powertrain';
import { SUBSTEPS } from './config/physics';
import { SIM_DT_S } from './config/regulations';
import { hashState } from './hash';
import type { ProcessedInputs, RawInputFrame } from './input';
import { createProcessedInputs, processInput } from './input';
import type { PrngState } from './prng';
import { createPrng } from './prng';
import type { CarParams, CarState } from './vehicle/vehicle';
import {
  adjustBrakeBias,
  createCarParams,
  createCarState,
  requestShift,
  stepCar,
} from './vehicle/vehicle';
import { resolveWalls } from './vehicle/walls';

/** Everything needed to resume a session bit-exactly (plus the immutable spec + track id). */
export interface SimState {
  t: number;
  stepCount: number;
  prng: PrngState;
  input: ProcessedInputs;
  car: CarState;
  lap: LapTimerState;
  /** Track progress tracking. */
  trackIndex: number;
  trackS: number;
  lateralM: number;
  /** Number of wheels beyond the white line (track-limits groundwork). */
  wheelsOffTrack: number;
}

export interface Sim {
  readonly spec: CarSpec;
  readonly params: CarParams;
  readonly track: TrackModel;
  readonly dt: number;
  step(input: RawInputFrame): void;
  getState(): Readonly<SimState>;
  /** Deep copy suitable for snapshots / network. */
  snapshot(): SimState;
  restore(s: SimState): void;
  hash(): string;
  /** Put the car back on the centerline at its current progress, stationary (R key). */
  resetToTrack(): void;
  /** Place the car at arc length s facing the track direction. */
  placeAt(s: number, lateral?: number): void;
}

export interface SimOptions {
  /** Start position: metres before the start/finish line. Default: first grid slot. */
  gridOffsetM?: number;
}

const projTmp: TrackProjection = { index: 0, s: 0, lateral: 0, dist2: 0 };

export function createSim(
  seed: number,
  spec: CarSpec,
  track: TrackModel,
  opts: SimOptions = {},
): Sim {
  const params = createCarParams(spec);
  const state: SimState = {
    t: 0,
    stepCount: 0,
    prng: createPrng(seed),
    input: createProcessedInputs(),
    car: createCarState(params),
    lap: createLapTimer(track),
    trackIndex: 0,
    trackS: 0,
    lateralM: 0,
    wheelsOffTrack: 0,
  };
  let st = state;

  const placeAt = (s: number, lateral = 0) => {
    const pose = poseAt(track, s);
    const car = createCarState(params);
    car.x = pose.x - Math.sin(pose.heading) * lateral;
    car.y = pose.y + Math.cos(pose.heading) * lateral;
    car.yaw = pose.heading;
    car.brakeBias = st.car.brakeBias;
    car.ersStoreJ = st.car.ersStoreJ;
    car.ersHarvestedLapJ = st.car.ersHarvestedLapJ;
    car.ersDeployEnabled = st.car.ersDeployEnabled;
    st.car = car;
    st.input = createProcessedInputs();
    project(track, car.x, car.y, -1, 24, projTmp);
    st.trackIndex = projTmp.index;
    st.trackS = projTmp.s;
    st.lateralM = projTmp.lateral;
    abortLap(st.lap);
  };
  placeAt(track.length - (opts.gridOffsetM ?? track.json.gridSlotsM[0] ?? 20));

  const sub = SIM_DT_S / SUBSTEPS;

  const sim: Sim = {
    spec,
    params,
    track,
    dt: SIM_DT_S,
    step(raw: RawInputFrame) {
      const car = st.car;
      const speed = Math.hypot(car.vx, car.vy);
      processInput(st.input, raw, speed, SIM_DT_S);
      if (raw.gearUp) requestShift(params, car, 1);
      if (raw.gearDown) requestShift(params, car, -1);
      if (raw.biasUp) adjustBrakeBias(car, BRAKE_BIAS_STEP);
      if (raw.biasDown) adjustBrakeBias(car, -BRAKE_BIAS_STEP);
      if (raw.ersToggle) car.ersDeployEnabled = !car.ersDeployEnabled;
      car.drsOpen = raw.drs; // Phase 1: DRS test key (zones/rules in Phase 3)

      let impact = 0;
      for (let k = 0; k < SUBSTEPS; k++) {
        stepCar(params, car, st.input, sub);
        impact = Math.max(impact, resolveWalls(params, car, track, st.trackIndex));
      }
      car.wallImpactMps = impact;

      // Track progress + timing
      const sPrev = st.trackS;
      const tPrev = st.t;
      st.t = (st.stepCount + 1) * SIM_DT_S;
      st.stepCount++;
      project(track, car.x, car.y, st.trackIndex, 30, projTmp);
      if (projTmp.dist2 > 60 * 60) project(track, car.x, car.y, -1, 24, projTmp);
      st.trackIndex = projTmp.index;
      st.trackS = projTmp.s;
      st.lateralM = projTmp.lateral;
      updateLapTimer(st.lap, track, sPrev, st.trackS, tPrev, st.t);
      if (st.lap.lastEvent === 'lap') car.ersHarvestedLapJ = 0;

      // Wheels beyond the white line
      let off = 0;
      const cy = Math.cos(car.yaw);
      const sy = Math.sin(car.yaw);
      for (let i = 0; i < 4; i++) {
        const bx = params.wheelX[i]!;
        const by = params.wheelY[i]!;
        project(
          track,
          car.x + bx * cy - by * sy,
          car.y + bx * sy + by * cy,
          st.trackIndex,
          6,
          projTmp,
        );
        if (Math.abs(projTmp.lateral) > sampleAt(track, track.halfWidth, projTmp.s)) off++;
      }
      st.wheelsOffTrack = off;
    },
    getState: () => st,
    snapshot: () => structuredCloneState(st),
    restore(s: SimState) {
      st = structuredCloneState(s);
    },
    hash: () => hashState(st),
    resetToTrack() {
      placeAt(st.trackS, 0);
    },
    placeAt,
  };
  return sim;
}

function structuredCloneState(s: SimState): SimState {
  return JSON.parse(
    JSON.stringify(s, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? `__num:${v}` : v)),
    (_k, v) => (typeof v === 'string' && v.startsWith('__num:') ? Number(v.slice(6)) : v),
  ) as SimState;
}
