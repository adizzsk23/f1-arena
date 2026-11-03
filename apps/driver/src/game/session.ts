import type { Sim } from '@gx/core';
import { createSim, mpsToKph, radToDeg, SIM_DT_S, standardCarSpec, TYRE_RADIUS_M } from '@gx/core';
import type { CarRenderPose, GraphicsPreset } from '@gx/render';
import { World } from '@gx/render';
import type { BuiltinTrackId } from '@gx/track';
import { loadBuiltinTrack } from '@gx/track';
import { EngineAudio } from '../audio/engineAudio';
import { BRAND } from '../brand';
import type { InputManager } from '../input/inputManager';
import type { HudData } from '../store';

/** Never run more than this many sim steps per frame (spiral-of-death guard). */
const MAX_STEPS_PER_FRAME = 12;
const HUD_INTERVAL_S = 0.05;
/** Visual body pitch/roll per m/s² (rad). Cosmetic only. */
const PITCH_PER_MPS2 = 0.0016;
const ROLL_PER_MPS2 = 0.0022;

interface PoseSample {
  x: number;
  y: number;
  yaw: number;
  steerFL: number;
  steerFR: number;
  spin: [number, number, number, number];
  ax: number;
  ay: number;
}

/**
 * One driving session: fixed 120 Hz physics with an accumulator, render interpolation
 * between the last two physics states, audio and a throttled HUD feed.
 */
export class DriveSession {
  readonly sim: Sim;
  private world: World;
  private audio: EngineAudio | null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private prev: PoseSample;
  private curr: PoseSample;
  private spin: [number, number, number, number] = [0, 0, 0, 0];
  private hudT = 0;
  private fpsFrames = 0;
  private fpsT = 0;
  private fps = 0;
  private stepMs = 0;
  paused = false;

  constructor(
    private canvas: HTMLCanvasElement,
    trackId: BuiltinTrackId,
    preset: GraphicsPreset,
    livery: string,
    private input: InputManager,
    private onHud: (h: HudData) => void,
  ) {
    const track = loadBuiltinTrack(trackId);
    // Seed is arbitrary but fixed so a session is reproducible from its input log.
    this.sim = createSim(2026, standardCarSpec(), track);
    const p = this.sim.params;
    this.world = new World({
      canvas,
      track,
      preset,
      brand: BRAND,
      car: { a: p.a, b: p.b, halfTrack: p.halfTrack, tyreRadius: TYRE_RADIUS_M, livery },
    });
    try {
      this.audio = new EngineAudio();
    } catch {
      this.audio = null;
    }
    this.curr = this.sample();
    this.prev = this.curr;
  }

  start(): void {
    this.audio?.resume();
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.audio?.dispose();
    this.world.dispose();
  }

  resize(w: number, h: number): void {
    this.world.resize(w, h);
  }

  cycleCamera(): void {
    this.world.rig.cycle();
  }

  reset(): void {
    this.sim.resetToTrack();
    this.curr = this.sample();
    this.prev = this.curr;
  }

  private sample(): PoseSample {
    const c = this.sim.getState().car;
    return {
      x: c.x,
      y: c.y,
      yaw: c.yaw,
      steerFL: c.wheels[0]!.steerRad,
      steerFR: c.wheels[1]!.steerRad,
      spin: [...this.spin],
      ax: c.axF,
      ay: c.ayF,
    };
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.input.pollPads();
    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= SIM_DT_S && steps < MAX_STEPS_PER_FRAME) {
        this.prev = this.curr;
        const t0 = performance.now();
        this.sim.step(this.input.consume());
        this.stepMs = this.stepMs * 0.95 + (performance.now() - t0) * 0.05;
        const w = this.sim.getState().car.wheels;
        for (let i = 0; i < 4; i++)
          this.spin[i] = (this.spin[i]! + w[i]!.omega * SIM_DT_S) % (Math.PI * 2000);
        this.curr = this.sample();
        this.acc -= SIM_DT_S;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    }
    const a = this.paused ? 1 : this.acc / SIM_DT_S;
    const P = this.prev;
    const C = this.curr;
    let dyaw = C.yaw - P.yaw;
    if (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    else if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    const pose: CarRenderPose = {
      x: P.x + (C.x - P.x) * a,
      y: P.y + (C.y - P.y) * a,
      yaw: P.yaw + dyaw * a,
      steerFL: P.steerFL + (C.steerFL - P.steerFL) * a,
      steerFR: P.steerFR + (C.steerFR - P.steerFR) * a,
      spin: [0, 1, 2, 3].map((i) => P.spin[i]! + (C.spin[i]! - P.spin[i]!) * a) as [
        number,
        number,
        number,
        number,
      ],
      pitch: C.ax * PITCH_PER_MPS2,
      roll: C.ay * ROLL_PER_MPS2,
    };
    const st = this.sim.getState();
    const car = st.car;
    const speed = Math.hypot(car.vx, car.vy);
    this.world.render(
      pose,
      { ax: car.axF, ay: car.ayF, speedMps: speed, look: this.input.look() },
      dt,
    );

    let slip = 0;
    for (const w of car.wheels) slip = Math.max(slip, w.combinedSlip);
    this.audio?.update({
      rpm: car.engineRpm,
      throttle: st.input.throttle,
      slip,
      speedMps: speed,
      paused: this.paused,
    });

    this.fpsFrames++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      this.fps = this.fpsFrames / this.fpsT;
      this.fpsFrames = 0;
      this.fpsT = 0;
    }
    this.hudT += dt;
    if (this.hudT >= HUD_INTERVAL_S) {
      this.hudT = 0;
      this.onHud(this.buildHud());
    }
  }

  private buildHud(): HudData {
    const st = this.sim.getState();
    const c = st.car;
    const lap = st.lap;
    return {
      speedKph: mpsToKph(Math.hypot(c.vx, c.vy)),
      gear: c.shiftTimerS > 0 ? c.pendingGear : c.gear,
      rpm: c.engineRpm,
      ersPct: (100 * c.ersStoreJ) / this.sim.spec.ersStoreMaxJ,
      ersOn: c.ersDeployEnabled,
      ersDeployKw: c.ersDeployW / 1000,
      ersHarvestKw: c.ersHarvestW / 1000,
      brakeBiasPct: c.brakeBias * 100,
      drs: c.drsOpen,
      lapTime: lap.started ? st.t - lap.lapStartT : NaN,
      lastLap: lap.lastLapT,
      bestLap: lap.bestLapT,
      sector: lap.sector,
      currentSectors: [...lap.currentSectors],
      lastSectors: [...lap.lastSectors],
      bestSectors: [...lap.bestSectors],
      lapsCompleted: lap.lapsCompleted,
      lapStarted: lap.started,
      gLong: c.axF / 9.81,
      gLat: c.ayF / 9.81,
      throttle: st.input.throttle,
      brake: st.input.brake,
      steer: st.input.steer,
      device: this.input.activeDevice,
      camera: this.world.cameraMode,
      wheels: c.wheels.map((w) => ({
        fz: w.fz,
        slipRatio: w.slipRatio,
        slipAngleDeg: radToDeg(w.slipAngleRad),
        mu: w.muPeak,
        combined: w.combinedSlip,
        locked: w.locked,
      })),
      downforceN: c.downforceN,
      dragN: c.dragN,
      powerKw: c.powerAtWheelsW / 1000,
      fps: this.fps,
      simStepMs: this.stepMs,
      wheelsOff: st.wheelsOffTrack,
      padId: this.input.padId,
    };
  }
}
