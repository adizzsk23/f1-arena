/**
 * Power unit, transmission and brakes of the standard build (SPEC Art. 2, 7, 8).
 */

/** 6-point ICE torque curve (rpm, N·m), linearly interpolated. Must stay ≤ 360 kW (Art. 2). */
export const STANDARD_TORQUE_CURVE: ReadonlyArray<readonly [number, number]> = [
  [4000, 180],
  [7000, 255],
  [9500, 292],
  [11500, 296],
  [13000, 262],
  [15000, 216],
];

export const IDLE_RPM = 4000;
/** Engine speed the auto-clutch holds while slipping at full throttle (launch). */
export const LAUNCH_RPM = 10_500;
/** Fuel-cut soft band below the limiter (rpm). Art. 2: 15 000 rpm limiter. */
export const LIMITER_BAND_RPM = 150;
/** Gearbox refuses downshifts that would exceed this (rpm). */
export const DOWNSHIFT_PROTECT_RPM = 15_200;
export const ENGINE_INERTIA_KGM2 = 0.08;
/** Engine braking torque at the crank, T = −(c0 + c1·rpm) when off throttle (N·m). */
export const ENGINE_BRAKE_C0_NM = 10;
export const ENGINE_BRAKE_C1_NM_PER_RPM = 0.0045;

/** Gear ratios 1–8 ("mid" gearing, homologated per Art. 8) and reverse. */
export const STANDARD_GEAR_RATIOS: readonly number[] = [
  4.1, 3.5, 2.98, 2.55, 2.18, 1.87, 1.6, 1.36,
];
export const REVERSE_RATIO = 4.4;
export const STANDARD_FINAL_DRIVE = 4.5;
/** Torque interruption per shift (s). Phase 1 prompt: ~50 ms. */
export const SHIFT_TIME_S = 0.05;

/** ERS MGU-K crank torque limit (N·m) — caps deployment at low rpm. */
export const MGUK_MAX_TORQUE_NM = 200;
/** Min road speed for ERS deploy/harvest (m/s). */
export const ERS_MIN_SPEED_MPS = 5;

/**
 * Brake system torque capacity at full pedal, summed over the 4 wheels (N·m), split by
 * bias. At high speed this capacity — not tyre grip — sets peak decel (SPEC §4 ~4.5–5 g);
 * below ~230 km/h braking is grip-limited and the wheels lock if the pedal is abused.
 */
export const BRAKE_TORQUE_MAX_TOTAL_NM = 12_400;
export const STANDARD_BRAKE_BIAS = 0.58;
export const BRAKE_BIAS_STEP = 0.005;
