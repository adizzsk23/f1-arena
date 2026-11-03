/**
 * Harness "drivers". They send RAW inputs as an analog wheel/pedal device, so they go
 * through the same SPEC §8 processing (universal steer rate, speed-sensitive lock) as humans.
 * Driver skill (threshold braking, throttle modulation) lives here — never in the car.
 */
import type { RawInputFrame, Sim } from '@gx/core';
import {
  AIR_DENSITY_KGPM3,
  BRAKE_TORQUE_MAX_TOTAL_NM,
  GRAVITY_MPS2,
  TYRE_RADIUS_M,
  clamp,
  neutralInput,
  radpsToRpm,
  steerLockRad,
  wrapAngle,
} from '@gx/core';
import type { RacingLine, TrackModel } from '@gx/track';
import { computeRacingLine } from '@gx/track';

export const UPSHIFT_RPM = 14_600;
export const DOWNSHIFT_RPM = 9_500;

/** Sequential gearbox management (driver behaviour). */
export function autoShift(sim: Sim, inp: RawInputFrame): void {
  const car = sim.getState().car;
  if (car.shiftTimerS > 0 || car.gear < 1) return;
  if (car.engineRpm > UPSHIFT_RPM && car.gear < sim.spec.gearRatios.length && !car.clutchSlipping) {
    inp.gearUp = true;
  } else if (car.gear > 1 && car.engineRpm < DOWNSHIFT_RPM) {
    const omega = 0.5 * (car.wheels[2]!.omega + car.wheels[3]!.omega);
    const rpmLower = radpsToRpm(sim.params.overall[car.gear]! * omega);
    if (rpmLower < 13_800) inp.gearDown = true;
  }
}

/** Skilled pedal work: back off when the tyres pass the slip peak (like a driver feeling lock-up/wheelspin). */
export class PedalSkill {
  brake = 0;
  throttleCap = 1;
  constructor(private slipPeak: number) {}
  brakeFor(sim: Sim, demand: number, dt: number): number {
    const w = sim.getState().car.wheels;
    let worst = 0;
    for (const wh of w) if (wh.slipRatio < 0 && -wh.slipRatio > worst) worst = -wh.slipRatio;
    // proportional "feel" for the slip peak: squeeze while below, ease off above
    const e = (this.slipPeak * 0.95 - worst) / this.slipPeak;
    this.brake = clamp(this.brake + dt * (e > 0 ? 6 * Math.min(e, 1) + 1 : 12 * e), 0, demand);
    return this.brake;
  }
  throttleFor(sim: Sim, demand: number, dt: number): number {
    const w = sim.getState().car.wheels;
    const rear = Math.max(w[2]!.slipRatio, w[3]!.slipRatio);
    const rearCombined = Math.max(w[2]!.combinedSlip, w[3]!.combinedSlip);
    if (rear > this.slipPeak * 1.1 || rearCombined > 1.05)
      this.throttleCap = Math.max(0.2, this.throttleCap - dt * 5);
    else this.throttleCap = Math.min(1, this.throttleCap + dt * 3);
    return Math.min(demand, this.throttleCap);
  }
}

export interface SpeedProfile {
  v: Float64Array;
}

export interface BotOptions {
  /** Fraction of estimated grip the speed profile uses. */
  gripScale: number;
  /** Lateral grip estimate μ (combined, incl. load-transfer losses). */
  muLat?: number;
  muLong?: number;
}

/**
 * Quasi-steady-state speed profile along the racing line (friction circle):
 *   lateral limit  v²·|κ| = μ·(g + ½ρ·ClA·v²/m)  →  v = √(μg / (|κ| − μρClA/2m))
 *   forward pass   a = min(traction, power/(m·v)) · √(1 − (a_lat/a_lat,max)²) − drag/m
 *   backward pass  a = min(grip, brake capacity) · √(1 − …) + drag/m
 */
export function computeSpeedProfile(sim: Sim, line: RacingLine, opts: BotOptions): SpeedProfile {
  const n = line.x.length;
  const m = sim.params.massKg;
  const clA = sim.spec.clA;
  const cdA = sim.params.cdA;
  const q = 0.5 * AIR_DENSITY_KGPM3;
  const muLat = (opts.muLat ?? 1.62) * opts.gripScale;
  const muLong = (opts.muLong ?? 1.55) * opts.gripScale;
  const pMax = (sim.spec.ersDeployMaxW + 350_000) * sim.spec.drivetrainEfficiency;
  const brakeCapN = BRAKE_TORQUE_MAX_TOTAL_NM / TYRE_RADIUS_M;
  const vLat = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(line.curvature[i]!);
    const den = k - (muLat * q * clA) / m;
    vLat[i] = den <= 1e-6 ? 120 : Math.min(120, Math.sqrt((muLat * GRAVITY_MPS2) / den));
  }
  const ds = (i: number) => {
    const j = (i + 1) % n;
    return Math.hypot(line.x[j]! - line.x[i]!, line.y[j]! - line.y[i]!);
  };
  const latUse = (i: number, v: number) => {
    const aLat = v * v * Math.abs(line.curvature[i]!);
    const aLatMax = muLat * (GRAVITY_MPS2 + (q * clA * v * v) / m);
    const r = clamp(aLat / aLatMax, 0, 1);
    return Math.sqrt(1 - r * r);
  };
  const v = Float64Array.from(vLat);
  // two laps of passes so the wrap-around converges
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < n; k++) {
      const i = k;
      const j = (i + 1) % n;
      const vi = v[i]!;
      const grip = muLong * (GRAVITY_MPS2 + (q * clA * vi * vi) / m);
      const power = pMax / (m * Math.max(vi, 5));
      const a = Math.min(grip, power) * latUse(i, vi) - (q * cdA * vi * vi) / m;
      const vn = Math.sqrt(Math.max(0, vi * vi + 2 * Math.max(a, 0) * ds(i)));
      if (vn < v[j]!) v[j] = vn;
    }
    for (let k = n - 1; k >= 0; k--) {
      const i = k;
      const j = (i + 1) % n;
      const vj = v[j]!;
      const grip = muLong * m * (GRAVITY_MPS2 + (q * clA * vj * vj) / m);
      const a = (Math.min(grip, brakeCapN) * latUse(j, vj) + q * cdA * vj * vj) / m;
      const vp = Math.sqrt(vj * vj + 2 * a * ds(i));
      if (vp < v[i]!) v[i] = vp;
    }
  }
  return { v };
}

/** Pure-pursuit racing-line follower with speed-profile tracking. */
export class LineBot {
  readonly line: RacingLine;
  profile: SpeedProfile;
  private pedals: PedalSkill;
  constructor(
    private sim: Sim,
    private track: TrackModel,
    opts: BotOptions,
    line?: RacingLine,
  ) {
    this.line = line ?? computeRacingLine(track);
    this.profile = computeSpeedProfile(sim, this.line, opts);
    this.pedals = new PedalSkill(sim.params.tyre.p.slipRatioPeak);
  }

  targetSpeedAt(i: number): number {
    return this.profile.v[i]!;
  }

  frame(dt: number): RawInputFrame {
    const st = this.sim.getState();
    const car = st.car;
    const n = this.line.x.length;
    const i0 = st.trackIndex;
    const speed = Math.hypot(car.vx, car.vy);
    // lookahead point
    const ld = 7 + 0.32 * speed;
    let j = i0;
    let acc = 0;
    while (acc < ld) {
      const k = (j + 1) % n;
      acc += Math.hypot(this.line.x[k]! - this.line.x[j]!, this.line.y[k]! - this.line.y[j]!);
      j = k;
    }
    const dx = this.line.x[j]! - car.x;
    const dy = this.line.y[j]! - car.y;
    // use the course (velocity heading) so body sideslip doesn't fool the follower
    const course = speed > 3 ? car.yaw + Math.atan2(car.vy, car.vx) : car.yaw;
    const alpha = wrapAngle(Math.atan2(dy, dx) - course);
    const L = this.sim.spec.wheelbaseM;
    const dist = Math.hypot(dx, dy);
    let delta = Math.atan((2 * L * Math.sin(alpha)) / Math.max(dist, 1));
    // Yaw-rate damping: counter-steer when the car rotates faster than the path demands
    const kPath = this.line.curvature[i0]!;
    delta += 0.08 * (kPath * speed - car.yawRate);
    const steer = clamp(-delta / steerLockRad(speed), -1, 1);

    // speed control — look a little ahead to anticipate braking points
    let ja = i0;
    let acc2 = 0;
    const aheadM = speed * 0.12 + 2;
    while (acc2 < aheadM) {
      const k = (ja + 1) % n;
      acc2 += Math.hypot(this.line.x[k]! - this.line.x[ja]!, this.line.y[k]! - this.line.y[ja]!);
      ja = k;
    }
    const vt = this.profile.v[ja]!;
    const err = vt - speed;
    const inp = neutralInput('wheel');
    inp.steer = steer;
    if (err > -0.3) {
      inp.throttle = this.pedals.throttleFor(this.sim, clamp(0.35 + err * 0.6, 0, 1), dt);
      this.pedals.brake = 0;
    } else {
      inp.brake = this.pedals.brakeFor(this.sim, clamp(-err * 0.5, 0, 1), dt);
    }
    autoShift(this.sim, inp);
    return inp;
  }
}
