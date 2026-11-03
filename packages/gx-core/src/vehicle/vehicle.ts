import type { CarSpec } from '../carSpec';
import { dragArea, totalMass } from '../carSpec';
import {
  ACKERMANN_FACTOR,
  AIR_DENSITY_KGPM3,
  DIFF_VISCOUS_NM_PER_RADPS,
  FRONT_OVERHANG_M,
  FRONT_WHEEL_INERTIA_KGM2,
  GRAVITY_MPS2,
  LOAD_TRANSFER_TAU_S,
  REAR_OVERHANG_M,
  REAR_WHEEL_INERTIA_KGM2,
  ROLL_STIFFNESS_FRONT,
  ROLLING_RESISTANCE_COEFF,
  SLIP_ANGLE_MIN_SPEED_MPS,
  SLIP_RATIO_MIN_SPEED_MPS,
  STEER_LOCK_HIGH_SPEED_RAD,
  STEER_LOCK_LOW_SPEED_RAD,
  STEER_LOCK_REF_SPEED_MPS,
  TYRE_RADIUS_M,
} from '../config/physics';
import {
  BRAKE_TORQUE_MAX_TOTAL_NM,
  DOWNSHIFT_PROTECT_RPM,
  ENGINE_INERTIA_KGM2,
  ERS_MIN_SPEED_MPS,
  IDLE_RPM,
  LAUNCH_RPM,
  MGUK_MAX_TORQUE_NM,
  REVERSE_RATIO,
  SHIFT_TIME_S,
} from '../config/powertrain';
import {
  BRAKE_BIAS_MAX,
  BRAKE_BIAS_MIN,
  DRS_DRAG_FACTOR,
  DRS_REAR_DOWNFORCE_FACTOR,
  HULL_WIDTH_M,
  REV_LIMIT_RPM,
} from '../config/regulations';
import { TYRE_COMPOUNDS } from '../config/tyres';
import type { ProcessedInputs } from '../input';
import { clamp } from '../math';
import { radpsToRpm, rpmToRadps } from '../units';
import { iceTorque, limiterFactor } from './powerunit';
import type { TyreForceOut, TyreModel, TyreState } from './tyre';
import { createTyreModel, createTyreState, tyreForces, tyreGripFactor } from './tyre';

export const WHEEL_FL = 0;
export const WHEEL_FR = 1;
export const WHEEL_RL = 2;
export const WHEEL_RR = 3;

export interface WheelState {
  /** Spin rate (rad/s). */
  omega: number;
  /** Vertical load (N). */
  fz: number;
  /** Tyre forces in the wheel frame (N). */
  fx: number;
  fy: number;
  slipRatio: number;
  slipAngleRad: number;
  /** Peak μ available at the current load. */
  muPeak: number;
  /** Normalised combined slip (1 = at the grip peak). */
  combinedSlip: number;
  steerRad: number;
  brakeTorqueNm: number;
  locked: boolean;
  tyre: TyreState;
}

/** Complete, serialisable dynamic state of one car. Body frame: x forward, y left. */
export interface CarState {
  x: number;
  y: number;
  /** Heading (rad), CCW from +x. */
  yaw: number;
  vx: number;
  vy: number;
  yawRate: number;
  /** Filtered body accelerations used for load transfer (m/s²). */
  axF: number;
  ayF: number;
  /** Instantaneous body accelerations (m/s²) for telemetry / g-meter. */
  ax: number;
  ay: number;
  wheels: WheelState[];
  /** −1 = R, 0 = N, 1..8. */
  gear: number;
  pendingGear: number;
  shiftTimerS: number;
  engineRpm: number;
  clutchSlipping: boolean;
  steerRoadRad: number;
  brakeBias: number;
  ersDeployEnabled: boolean;
  ersStoreJ: number;
  ersHarvestedLapJ: number;
  ersDeployW: number;
  ersHarvestW: number;
  drsOpen: boolean;
  fuelKg: number;
  downforceN: number;
  dragN: number;
  powerAtWheelsW: number;
  /** Peak wall-normal impact speed in the last step (m/s), 0 if none. */
  wallImpactMps: number;
}

/** Precomputed per-car constants. */
export interface CarParams {
  spec: CarSpec;
  massKg: number;
  /** CoG → front axle / rear axle (m). */
  a: number;
  b: number;
  halfTrack: number;
  cdA: number;
  tyre: TyreModel;
  /** Overall ratios per gear index: [R, N, 1..8] → index gear+1. */
  overall: number[];
  wheelX: number[];
  wheelY: number[];
  /** Hull sample points (body frame) for wall contact. */
  hullX: number[];
  hullY: number[];
}

export function createCarParams(spec: CarSpec): CarParams {
  const L = spec.wheelbaseM;
  const a = L * (1 - spec.frontWeightDist);
  const b = L - a;
  const ht = spec.trackWidthM / 2;
  const overall = [
    -REVERSE_RATIO * spec.finalDrive,
    0,
    ...spec.gearRatios.map((g) => g * spec.finalDrive),
  ];
  const fx = a + FRONT_OVERHANG_M;
  const rx = -(b + REAR_OVERHANG_M);
  const hw = HULL_WIDTH_M / 2;
  return {
    spec,
    massKg: totalMass(spec),
    a,
    b,
    halfTrack: ht,
    cdA: dragArea(spec),
    tyre: createTyreModel(TYRE_COMPOUNDS[spec.compound]),
    overall,
    wheelX: [a, a, -b, -b],
    wheelY: [ht, -ht, ht, -ht],
    hullX: [fx, fx, a, a, 0, 0, -b, -b, rx, rx, fx + 0.1],
    hullY: [hw * 0.45, -hw * 0.45, hw, -hw, hw, -hw, hw, -hw, hw * 0.8, -hw * 0.8, 0],
  };
}

function createWheel(): WheelState {
  return {
    omega: 0,
    fz: 0,
    fx: 0,
    fy: 0,
    slipRatio: 0,
    slipAngleRad: 0,
    muPeak: 0,
    combinedSlip: 0,
    steerRad: 0,
    brakeTorqueNm: 0,
    locked: false,
    tyre: createTyreState(),
  };
}

export function createCarState(params: CarParams, x = 0, y = 0, yaw = 0): CarState {
  const st: CarState = {
    x,
    y,
    yaw,
    vx: 0,
    vy: 0,
    yawRate: 0,
    axF: 0,
    ayF: 0,
    ax: 0,
    ay: 0,
    wheels: [createWheel(), createWheel(), createWheel(), createWheel()],
    gear: 1,
    pendingGear: 1,
    shiftTimerS: 0,
    engineRpm: IDLE_RPM,
    clutchSlipping: false,
    steerRoadRad: 0,
    brakeBias: params.spec.brakeBiasDefault,
    ersDeployEnabled: true,
    ersStoreJ: params.spec.ersStoreMaxJ,
    ersHarvestedLapJ: 0,
    ersDeployW: 0,
    ersHarvestW: 0,
    drsOpen: false,
    fuelKg: params.spec.fuelKg,
    downforceN: 0,
    dragN: 0,
    powerAtWheelsW: 0,
    wallImpactMps: 0,
  };
  updateStaticLoads(params, st);
  return st;
}

function updateStaticLoads(p: CarParams, st: CarState): void {
  const W = p.massKg * GRAVITY_MPS2;
  const wf = p.spec.frontWeightDist;
  st.wheels[0]!.fz = st.wheels[1]!.fz = (W * wf) / 2;
  st.wheels[2]!.fz = st.wheels[3]!.fz = (W * (1 - wf)) / 2;
}

/** Set the car moving straight at a given speed with free-rolling wheels (harness helper). */
export function setCarSpeed(p: CarParams, st: CarState, speedMps: number): void {
  st.vx = speedMps;
  st.vy = 0;
  st.yawRate = 0;
  for (const w of st.wheels) w.omega = speedMps / TYRE_RADIUS_M;
  // choose the gear that puts the engine in its power band
  let g = 1;
  for (let i = 1; i <= p.spec.gearRatios.length; i++) {
    const rpm = radpsToRpm((p.overall[i + 1]! * speedMps) / TYRE_RADIUS_M);
    if (rpm < REV_LIMIT_RPM * 0.97) {
      g = i;
      break;
    }
  }
  st.gear = st.pendingGear = g;
}

/** SPEC §8: speed-sensitive max road-wheel angle, identical for all devices. */
export function steerLockRad(speedMps: number): number {
  const r = speedMps / STEER_LOCK_REF_SPEED_MPS;
  return (
    STEER_LOCK_HIGH_SPEED_RAD + (STEER_LOCK_LOW_SPEED_RAD - STEER_LOCK_HIGH_SPEED_RAD) / (1 + r * r)
  );
}

// ---------------------------------------------------------------------------------------
// Discrete driver commands (once per 120 Hz step)
// ---------------------------------------------------------------------------------------

export function requestShift(p: CarParams, st: CarState, dir: 1 | -1): boolean {
  if (st.shiftTimerS > 0) return false;
  const speed = Math.hypot(st.vx, st.vy);
  const maxGear = p.spec.gearRatios.length;
  if (dir > 0) {
    if (st.gear >= maxGear) return false;
    if (st.gear <= 0) {
      // R → N → 1 are immediate (no torque interruption needed)
      st.gear = st.pendingGear = st.gear + 1;
      return true;
    }
    st.pendingGear = st.gear + 1;
    st.shiftTimerS = SHIFT_TIME_S;
    return true;
  }
  if (st.gear === 1 || (st.gear === 0 && speed < 2)) {
    st.gear = st.pendingGear = st.gear - 1;
    return true;
  }
  if (st.gear <= 0) return false;
  const omegaAvg = 0.5 * (st.wheels[2]!.omega + st.wheels[3]!.omega);
  const rpmAfter = radpsToRpm(Math.abs(p.overall[st.gear]! * omegaAvg));
  if (rpmAfter > DOWNSHIFT_PROTECT_RPM) return false; // over-rev protection
  st.pendingGear = st.gear - 1;
  st.shiftTimerS = SHIFT_TIME_S;
  return true;
}

export function adjustBrakeBias(st: CarState, delta: number): void {
  st.brakeBias = clamp(
    Math.round((st.brakeBias + delta) * 1000) / 1000,
    BRAKE_BIAS_MIN,
    BRAKE_BIAS_MAX,
  );
}

// ---------------------------------------------------------------------------------------
// Continuous dynamics (one sub-step)
// ---------------------------------------------------------------------------------------

const tmpForce: TyreForceOut = { fx: 0, fy: 0, muPeak: 0, combinedSlip: 0 };
const wVx = [0, 0, 0, 0];
const wTanA = [0, 0, 0, 0];
const wDenK = [0, 0, 0, 0];
const wK = [0, 0, 0, 0];
const wF = [0, 0, 0, 0];
const wFric = [0, 0, 0, 0];
const OMEGA_EPS = 0.05;

function fxAt(p: CarParams, w: WheelState, i: number, omega: number): number {
  const kappa = (omega * TYRE_RADIUS_M - wVx[i]!) / wDenK[i]!;
  tyreForces(p.tyre, w.fz, kappa, wTanA[i]!, tyreGripFactor(w.tyre), tmpForce);
  return tmpForce.fx;
}

/**
 * Advance the car by h seconds.
 * Chassis: planar rigid body, body-frame Newton–Euler
 *   m(v̇x − r·vy) = ΣFx,  m(v̇y + r·vx) = ΣFy,  Iz·ṙ = ΣMz
 * Wheels: Iw·ω̇ = T_drive − Fx·R − T_brake, solved semi-implicitly (linearised tyre).
 */
export function stepCar(p: CarParams, st: CarState, inp: ProcessedInputs, h: number): void {
  const spec = p.spec;
  const m = p.massKg;
  const R = TYRE_RADIUS_M;
  const W = st.wheels;
  const speed = Math.hypot(st.vx, st.vy);

  // ---- Aerodynamics (Art. 4): F = ½·ρ·C·A·v² ----
  const q = 0.5 * AIR_DENSITY_KGPM3;
  const df = q * spec.clA * st.vx * st.vx;
  const dfF = df * spec.aeroBalance;
  const dfR = df * (1 - spec.aeroBalance) * (st.drsOpen ? DRS_REAR_DOWNFORCE_FACTOR : 1);
  const dragMag = q * p.cdA * (st.drsOpen ? DRS_DRAG_FACTOR : 1) * speed * speed;
  const dragX = speed > 1e-6 ? (-dragMag * st.vx) / speed : 0;
  const dragY = speed > 1e-6 ? (-dragMag * st.vy) / speed : 0;
  st.downforceN = dfF + dfR;
  st.dragN = dragMag;

  // ---- Vertical loads: static + aero + lagged longitudinal/lateral transfer ----
  const Wt = m * GRAVITY_MPS2;
  const wf = spec.frontWeightDist;
  const longT = (m * st.axF * spec.cogHeightM) / spec.wheelbaseM; // ΔFz = m·ax·h/L
  const latT = (m * st.ayF * spec.cogHeightM) / spec.trackWidthM; // ΔFz = m·ay·h/t
  const fzF = (Wt * wf + dfF - longT) / 2;
  const fzR = (Wt * (1 - wf) + dfR + longT) / 2;
  const dF = latT * ROLL_STIFFNESS_FRONT;
  const dR = latT * (1 - ROLL_STIFFNESS_FRONT);
  W[0]!.fz = Math.max(0, fzF - dF);
  W[1]!.fz = Math.max(0, fzF + dF);
  W[2]!.fz = Math.max(0, fzR - dR);
  W[3]!.fz = Math.max(0, fzR + dR);

  // ---- Steering geometry: bicycle angle + partial Ackermann ----
  const delta = -inp.steer * steerLockRad(speed);
  st.steerRoadRad = delta;
  if (Math.abs(delta) > 1e-6) {
    const Rturn = spec.wheelbaseM / Math.tan(delta);
    const dl = Math.atan(spec.wheelbaseM / (Rturn - p.halfTrack));
    const dr = Math.atan(spec.wheelbaseM / (Rturn + p.halfTrack));
    W[0]!.steerRad = delta + ACKERMANN_FACTOR * (dl - delta);
    W[1]!.steerRad = delta + ACKERMANN_FACTOR * (dr - delta);
  } else {
    W[0]!.steerRad = W[1]!.steerRad = delta;
  }
  W[2]!.steerRad = W[3]!.steerRad = 0;

  // ---- Contact-patch kinematics ----
  for (let i = 0; i < 4; i++) {
    const w = W[i]!;
    const vxp = st.vx - st.yawRate * p.wheelY[i]!;
    const vyp = st.vy + st.yawRate * p.wheelX[i]!;
    const c = Math.cos(w.steerRad);
    const s = Math.sin(w.steerRad);
    const vxw = vxp * c + vyp * s;
    const vyw = -vxp * s + vyp * c;
    wVx[i] = vxw;
    wTanA[i] = vyw / Math.max(Math.abs(vxw), SLIP_ANGLE_MIN_SPEED_MPS);
    wDenK[i] = Math.max(Math.abs(vxw), SLIP_RATIO_MIN_SPEED_MPS);
    wF[i] = fxAt(p, w, i, w.omega);
    // dFx/dω ≥ 0 (finite difference) for the implicit wheel solve
    const k = (fxAt(p, w, i, w.omega + OMEGA_EPS) - wF[i]!) / OMEGA_EPS;
    wK[i] = k > 0 ? k : 0;
  }

  // ---- Power unit + transmission ----
  if (st.shiftTimerS > 0) {
    st.shiftTimerS -= h;
    if (st.shiftTimerS <= 0) {
      st.shiftTimerS = 0;
      st.gear = st.pendingGear;
    }
  }
  const shifting = st.shiftTimerS > 0;
  const G = p.overall[st.gear + 1]!;
  const omegaAxle = 0.5 * (W[2]!.omega + W[3]!.omega);
  const thr = inp.throttle;
  let crankTorque = 0;
  let J = 0;
  let engineOmega: number;
  const idleW = rpmToRadps(IDLE_RPM);
  st.ersDeployW = 0;
  if (st.gear === 0) {
    // Neutral: engine free-revs toward a throttle-dependent speed
    const target = idleW + thr * (rpmToRadps(REV_LIMIT_RPM) - idleW);
    engineOmega =
      rpmToRadps(st.engineRpm) + (target - rpmToRadps(st.engineRpm)) * Math.min(1, h * 8);
    st.clutchSlipping = true;
  } else {
    const coupled = G * omegaAxle;
    // Launch clutch only in 1st / reverse; in higher gears it is pure anti-stall (idle).
    const launchGear = st.gear === 1 || st.gear === -1;
    const slipW = launchGear ? idleW + thr * (rpmToRadps(LAUNCH_RPM) - idleW) : idleW;
    if (coupled < slipW) {
      // Auto-clutch slipping (launch / anti-stall): engine held at slipW, transmits its torque.
      engineOmega = slipW;
      crankTorque = Math.max(0, iceTorque(spec.torqueCurve, radpsToRpm(slipW), thr));
      st.clutchSlipping = true;
    } else {
      engineOmega = coupled;
      const rpm = radpsToRpm(coupled);
      crankTorque = iceTorque(spec.torqueCurve, rpm, thr);
      J = (ENGINE_INERTIA_KGM2 * G * G) / 4;
      st.clutchSlipping = false;
      // ERS deploy (Art. 2): up to 120 kW through the MGU-K on the crank
      if (
        st.ersDeployEnabled &&
        st.gear > 0 &&
        st.ersStoreJ > 0 &&
        thr > 0 &&
        speed > ERS_MIN_SPEED_MPS &&
        !shifting
      ) {
        const pReq = thr * spec.ersDeployMaxW * limiterFactor(rpm);
        const tErs = Math.min(pReq / Math.max(coupled, 1), MGUK_MAX_TORQUE_NM);
        crankTorque += tErs;
        st.ersDeployW = tErs * coupled;
      }
    }
    if (shifting) {
      crankTorque = 0;
      st.ersDeployW = 0;
    }
  }
  st.engineRpm = radpsToRpm(engineOmega);
  const axleTorque = crankTorque * G * spec.drivetrainEfficiency;

  // ---- Brakes (Art. 7): capacity × pedal, split by bias. No ABS. ----
  const brakeTotal = inp.brake * BRAKE_TORQUE_MAX_TOTAL_NM;
  const brakeFrontEach = (brakeTotal * st.brakeBias) / 2;
  let brakeRearEach = (brakeTotal * (1 - st.brakeBias)) / 2;
  // MGU-K harvest replaces part of the rear hydraulic torque (brake-by-wire keeps the balance)
  st.ersHarvestW = 0;
  let regenEach = 0;
  if (
    inp.brake > 0.02 &&
    st.gear > 0 &&
    speed > ERS_MIN_SPEED_MPS &&
    st.ersStoreJ < spec.ersStoreMaxJ &&
    st.ersHarvestedLapJ < spec.ersHarvestPerLapJ &&
    Math.abs(omegaAxle) > 1
  ) {
    const maxEach = spec.ersDeployMaxW / 2 / Math.abs(omegaAxle);
    regenEach = Math.min(brakeRearEach, maxEach);
    brakeRearEach -= regenEach;
  }
  // Brake-by-wire also nets out engine braking on the rear axle while the pedal is pressed,
  // so the driver's bias setting is what the tyres see.
  if (inp.brake > 0.02 && axleTorque * omegaAxle < 0) {
    brakeRearEach = Math.max(0, brakeRearEach - Math.abs(axleTorque) / 2);
  }
  W[0]!.brakeTorqueNm = brakeFrontEach;
  W[1]!.brakeTorqueNm = brakeFrontEach;
  W[2]!.brakeTorqueNm = brakeRearEach + regenEach;
  W[3]!.brakeTorqueNm = brakeRearEach + regenEach;
  for (let i = 0; i < 4; i++) {
    wFric[i] = W[i]!.brakeTorqueNm + ROLLING_RESISTANCE_COEFF * W[i]!.fz * R;
  }

  // ---- Wheel spin: semi-implicit solve ----
  // Fronts: (Iw/h + k·R)·Δω = −Fx·R
  for (let i = 0; i < 2; i++) {
    const w = W[i]!;
    const A = FRONT_WHEEL_INERTIA_KGM2 / h + wK[i]! * R;
    const free = w.omega + (-wF[i]! * R) / A;
    applyFriction(w, free, wFric[i]! / A);
  }
  // Rears: 2×2 with viscous LSD (c) and reflected engine inertia (J = Ie·G²/4)
  {
    const c = DIFF_VISCOUS_NM_PER_RADPS;
    const j = J / h;
    const wl = W[2]!;
    const wr = W[3]!;
    const aL = REAR_WHEEL_INERTIA_KGM2 / h + wK[2]! * R + c + j;
    const aR = REAR_WHEEL_INERTIA_KGM2 / h + wK[3]! * R + c + j;
    const off = j - c;
    const dw = wl.omega - wr.omega;
    const bL = axleTorque / 2 - c * dw - wF[2]! * R;
    const bR = axleTorque / 2 + c * dw - wF[3]! * R;
    const det = aL * aR - off * off;
    const dL = (bL * aR - off * bR) / det;
    const dR = (aL * bR - off * bL) / det;
    applyFriction(wl, wl.omega + dL, wFric[2]! / aL);
    applyFriction(wr, wr.omega + dR, wFric[3]! / aR);
    // ERS energy bookkeeping (Phase 2 adds conversion losses + fuel). P = T·|ω| per wheel.
    if (regenEach > 0) {
      const pH = regenEach * (Math.abs(wl.omega) + Math.abs(wr.omega));
      st.ersHarvestW = pH;
      st.ersStoreJ = Math.min(spec.ersStoreMaxJ, st.ersStoreJ + pH * h);
      st.ersHarvestedLapJ += pH * h;
    }
    if (st.ersDeployW > 0) st.ersStoreJ = Math.max(0, st.ersStoreJ - st.ersDeployW * h);
  }

  // ---- Final tyre forces with updated wheel speeds; sum on chassis ----
  let fxSum = dragX;
  let fySum = dragY;
  let mz = 0;
  let pWheels = 0;
  for (let i = 0; i < 4; i++) {
    const w = W[i]!;
    const kappa = (w.omega * R - wVx[i]!) / wDenK[i]!;
    tyreForces(p.tyre, w.fz, kappa, wTanA[i]!, tyreGripFactor(w.tyre), tmpForce);
    w.fx = tmpForce.fx;
    w.fy = tmpForce.fy;
    w.muPeak = tmpForce.muPeak;
    w.combinedSlip = tmpForce.combinedSlip;
    w.slipRatio = kappa;
    w.slipAngleRad = Math.atan(wTanA[i]!);
    const c = Math.cos(w.steerRad);
    const s = Math.sin(w.steerRad);
    const fbx = w.fx * c - w.fy * s;
    const fby = w.fx * s + w.fy * c;
    fxSum += fbx;
    fySum += fby;
    mz += p.wheelX[i]! * fby - p.wheelY[i]! * fbx;
    pWheels += w.fx * wVx[i]!;
  }
  st.powerAtWheelsW = pWheels;

  const ax = fxSum / m;
  const ay = fySum / m;
  st.ax = ax;
  st.ay = ay;
  st.vx += (ax + st.yawRate * st.vy) * h;
  st.vy += (ay - st.yawRate * st.vx) * h;
  st.yawRate += (mz / spec.yawInertiaKgM2) * h;
  const cy = Math.cos(st.yaw);
  const sy = Math.sin(st.yaw);
  st.x += (st.vx * cy - st.vy * sy) * h;
  st.y += (st.vx * sy + st.vy * cy) * h;
  st.yaw += st.yawRate * h;
  if (st.yaw > Math.PI) st.yaw -= 2 * Math.PI;
  else if (st.yaw < -Math.PI) st.yaw += 2 * Math.PI;

  const fl = Math.min(1, h / LOAD_TRANSFER_TAU_S);
  st.axF += (ax - st.axF) * fl;
  st.ayF += (ay - st.ayF) * fl;
}

/** Coulomb friction torque on a wheel: stops it if it can, otherwise opposes rotation. */
function applyFriction(w: WheelState, omegaFree: number, dOmegaFric: number): void {
  if (Math.abs(omegaFree) <= dOmegaFric) {
    w.omega = 0;
    w.locked = w.brakeTorqueNm > 0;
  } else {
    w.omega = omegaFree - Math.sign(omegaFree) * dOmegaFric;
    w.locked = false;
  }
}
