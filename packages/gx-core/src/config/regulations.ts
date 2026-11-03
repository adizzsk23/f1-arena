/**
 * GX Formula regulation numbers. These are SPEC values — do NOT change without owner
 * approval (log in docs/CHANGELOG-SPEC.md).
 */

// ---- SPEC §5 Art. 1 Mass & dimensions ----
export const MIN_MASS_KG = 800; // Art. 1: incl. 80 kg driver, excl. fuel
export const STANDARD_BUILD_MASS_KG = 815; // Art. 1
export const FRONT_WEIGHT_DIST_MIN = 0.44; // Art. 1
export const FRONT_WEIGHT_DIST_MAX = 0.47; // Art. 1
export const HULL_LENGTH_M = 5.6; // Art. 1 collision hull
export const HULL_WIDTH_M = 1.9; // Art. 1
export const WHEELBASE_M = 3.5; // Art. 1
export const TRACK_WIDTH_M = 1.6; // Art. 1 (~1.6 m)

// ---- SPEC §5 Art. 2 Power unit ----
export const ICE_MAX_POWER_W = 360_000; // Art. 2
export const REV_LIMIT_RPM = 15_000; // Art. 2
export const TORQUE_CURVE_POINTS = 6; // Art. 2
export const FUEL_FLOW_MAX_KG_PER_H = 100; // Art. 2 (enforced from Phase 2)
export const ERS_DEPLOY_MAX_W = 120_000; // Art. 2
export const ERS_STORE_MAX_J = 4_000_000; // Art. 2
export const ERS_HARVEST_PER_LAP_J = 2_000_000; // Art. 2 base (Art. 9 upgrades)
export const DRIVETRAIN_EFFICIENCY = 0.92; // Art. 2

// ---- SPEC §5 Art. 3 Fuel ----
export const FUEL_MAX_KG = 60; // Art. 3

// ---- SPEC §5 Art. 4 Aerodynamics ----
export const CLA_MIN = 3.0; // Art. 4
export const CLA_MAX = 5.0; // Art. 4
export const CDA_BASE_M2 = 0.6; // Art. 4: CdA = 0.60 + k·ClA² + radiatorDrag
export const AERO_K_BASE = 0.04; // Art. 4 / Art. 9 base
export const AERO_BALANCE_MIN = 0.38; // Art. 4 (front fraction)
export const AERO_BALANCE_MAX = 0.46; // Art. 4
export const DRS_DRAG_FACTOR = 0.85; // Art. 4: −15 % drag
export const DRS_REAR_DOWNFORCE_FACTOR = 0.9; // Art. 4: rear downforce −10 %

// ---- SPEC §5 Art. 5 Cooling ----
export const RADIATOR_SIZE_MIN = 1; // Art. 5
export const RADIATOR_SIZE_MAX = 5; // Art. 5
export const RADIATOR_DRAG_PER_STEP_M2 = 0.03; // Art. 5: each step +0.03 CdA

// ---- SPEC §5 Art. 7 Brakes ----
export const BRAKE_BIAS_MIN = 0.5; // Art. 7 (front fraction)
export const BRAKE_BIAS_MAX = 0.6; // Art. 7

// ---- SPEC §5 Art. 8 Transmission ----
export const FORWARD_GEARS = 8; // Art. 8

// ---- SPEC §3 / CLAUDE.md ----
export const SIM_HZ = 120; // fixed physics step
export const SIM_DT_S = 1 / SIM_HZ;
