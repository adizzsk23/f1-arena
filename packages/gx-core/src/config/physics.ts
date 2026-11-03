/**
 * Environment + integrator constants and the non-regulated physical parameters of the
 * spec chassis. Non-SPEC values here are tuning constants (harness-driven); each notes
 * which SPEC article/target it serves.
 */

// ---- Environment ----
export const GRAVITY_MPS2 = 9.81;
export const AIR_DENSITY_KGPM3 = 1.2; // Phase 1 prompt: ρ = 1.2

// ---- Integrator ----
/** Internal sub-steps per 120 Hz step (stiff tyre/wheel dynamics). SPEC §3 fixed step kept. */
export const SUBSTEPS = 4;
/** Low-speed floor for slip-ratio denominator (m/s). Avoids singular slip at standstill. */
export const SLIP_RATIO_MIN_SPEED_MPS = 3.0;
/** Low-speed floor for slip-angle denominator (m/s). */
export const SLIP_ANGLE_MIN_SPEED_MPS = 2.0;
/** First-order lag for load transfer, emulating pitch/roll response (s). */
export const LOAD_TRANSFER_TAU_S = 0.045;

// ---- Chassis (spec hull; SPEC Art. 1) ----
/** Static front weight fraction of the standard build (Art. 1 window 44–47 %). */
export const STANDARD_FRONT_WEIGHT_DIST = 0.445;
/** Centre-of-gravity height (m). Drives load transfer → SPEC §4 accel/braking/lateral. */
export const COG_HEIGHT_M = 0.26;
/** Yaw inertia (kg·m²) of an ~845 kg, 5.6 m car. */
export const YAW_INERTIA_KGM2 = 1150;
/** Fraction of lateral load transfer carried by the front axle (roll stiffness split). */
export const ROLL_STIFFNESS_FRONT = 0.55;
/** Hull overhangs ahead of the front axle / behind the rear axle (m); hull length 5.6 m. */
export const FRONT_OVERHANG_M = 1.15;
export const REAR_OVERHANG_M = 0.95;

// ---- Wheels ----
export const TYRE_RADIUS_M = 0.36; // 720 mm diameter
export const FRONT_WHEEL_INERTIA_KGM2 = 1.0;
export const REAR_WHEEL_INERTIA_KGM2 = 1.3; // incl. hub/driveshaft
/** Rolling resistance coefficient (force = Crr·Fz). */
export const ROLLING_RESISTANCE_COEFF = 0.011;

// ---- Steering (SPEC §8: speed-sensitive lock identical for all devices) ----
export const STEER_LOCK_LOW_SPEED_RAD = (24 * Math.PI) / 180;
export const STEER_LOCK_HIGH_SPEED_RAD = (5 * Math.PI) / 180;
/** Speed at which lock is midway between low- and high-speed values (m/s). */
export const STEER_LOCK_REF_SPEED_MPS = 25;
/** Ackermann fraction (1 = full geometric Ackermann). */
export const ACKERMANN_FACTOR = 0.6;

// ---- Differential ----
/** Viscous locking coefficient of the rear LSD (N·m per rad/s of wheel-speed difference). */
export const DIFF_VISCOUS_NM_PER_RADPS = 60;

// ---- Walls (Phase 1 analytic car↔wall contact) ----
export const WALL_RESTITUTION = 0.25;
export const WALL_FRICTION = 0.45;
