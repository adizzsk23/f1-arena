import type { TyreCompoundParams } from '../config/tyres';
import { TYRE_DEFAULT_TEMP_C } from '../config/tyres';

/**
 * Per-tyre condition. Phase 1 keeps it constant; Phase 2 integrates temperature, wear,
 * flat-spots and pressure here and feeds `tyreGripFactor`.
 */
export interface TyreState {
  surfaceTempC: number;
  carcassTempC: number;
  /** 0 = new, 1 = fully worn. */
  wear: number;
  /** Flat-spot depth proxy 0..1 (lock-ups, Phase 2). */
  flatSpot: number;
}

export function createTyreState(): TyreState {
  return {
    surfaceTempC: TYRE_DEFAULT_TEMP_C,
    carcassTempC: TYRE_DEFAULT_TEMP_C,
    wear: 0,
    flatSpot: 0,
  };
}

/** Grip multiplier from tyre condition. Phase 2 hook — returns 1 in Phase 1. */
export function tyreGripFactor(_st: TyreState): number {
  return 1;
}

export interface TyreModel {
  p: TyreCompoundParams;
  /** Pacejka B chosen so the normalised curve peaks at s = 1: B = tan(π / 2C). */
  B: number;
  tanAlphaPeak: number;
}

export function createTyreModel(p: TyreCompoundParams): TyreModel {
  return { p, B: Math.tan(Math.PI / (2 * p.shapeC)), tanAlphaPeak: Math.tan(p.slipAnglePeakRad) };
}

/** Load-sensitive peak friction: μ(Fz) = μ0·max(floor, 1 − kLoad·(Fz − Fz0)/Fz0). */
export function loadSensitiveMu(mu0: number, p: TyreCompoundParams, fz: number): number {
  const f = 1 - (p.loadSensitivity * (fz - p.fzNominalN)) / p.fzNominalN;
  return mu0 * (f < p.muLoadFloor ? p.muLoadFloor : f);
}

export interface TyreForceOut {
  fx: number;
  fy: number;
  /** Peak μ available at this load (lateral), for telemetry. */
  muPeak: number;
  /** Normalised combined slip (1 = at peak). */
  combinedSlip: number;
}

/**
 * Combined-slip force in the wheel frame.
 *   sx = κ/κpk, sy = tanα/tanαpk, s = √(sx² + sy²)
 *   f(s) = sin(C·atan(B·s))                      (Pacejka shape, E = 0)
 *   Fx = μx(Fz)·Fz·f(s)·sx/s,  Fy = −μy(Fz)·Fz·f(s)·sy/s   (friction ellipse)
 */
export function tyreForces(
  m: TyreModel,
  fz: number,
  kappa: number,
  tanAlpha: number,
  grip: number,
  out: TyreForceOut,
): TyreForceOut {
  const p = m.p;
  const muX = loadSensitiveMu(p.muX0, p, fz) * grip;
  const muY = loadSensitiveMu(p.muY0, p, fz) * grip;
  out.muPeak = muY;
  if (fz <= 0) {
    out.fx = 0;
    out.fy = 0;
    out.combinedSlip = 0;
    return out;
  }
  const sx = kappa / p.slipRatioPeak;
  const sy = tanAlpha / m.tanAlphaPeak;
  const s = Math.sqrt(sx * sx + sy * sy);
  out.combinedSlip = s;
  if (s < 1e-9) {
    out.fx = 0;
    out.fy = 0;
    return out;
  }
  const f = Math.sin(p.shapeC * Math.atan(m.B * s));
  const k = (fz * f) / s;
  out.fx = muX * k * sx;
  out.fy = -muY * k * sy;
  return out;
}
