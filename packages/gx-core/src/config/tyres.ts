/**
 * Spec-supplier tyre (SPEC §5 Art. 6). Phase 1 uses Medium at fixed operating temperature;
 * Soft/Hard are placeholders until Phase 2 adds temperature windows, wear and the cliff.
 *
 * Force model (see vehicle/tyre.ts): normalised combined slip with a Pacejka shape
 *   s = |(κ/κpk, tanα/tanαpk)|,  F = μ(Fz)·Fz·sin(C·atan(B·s)) with B = tan(π/2C) (peak at s=1)
 *   μ(Fz) = μ0·(1 − kLoad·(Fz − Fz0)/Fz0)          (load sensitivity, μ falls as load rises)
 */
export type Compound = 'soft' | 'medium' | 'hard';

export interface TyreCompoundParams {
  /** Peak longitudinal friction at nominal load. */
  muX0: number;
  /** Peak lateral friction at nominal load. */
  muY0: number;
  /** Nominal load for μ0 (N). */
  fzNominalN: number;
  /** Load sensitivity kLoad (dimensionless). */
  loadSensitivity: number;
  /** Slip ratio at peak Fx. */
  slipRatioPeak: number;
  /** Slip angle at peak Fy (rad). */
  slipAnglePeakRad: number;
  /** Pacejka shape factor C (sets post-peak drop: sliding ≈ sin(C·π/2)·peak). */
  shapeC: number;
  /** Lower bound on μ(Fz)/μ0 at extreme loads (keeps the linear law physical). */
  muLoadFloor: number;
}

// Tuned against SPEC §4: 1.7–2.0 g slow corners, 4–4.5 g fast corners (standard build),
// 0–100 km/h ≈ 2.6 s traction-limited, 2–2.5 g low-speed braking.
export const TYRE_MEDIUM: TyreCompoundParams = {
  muX0: 1.8,
  muY0: 1.8,
  fzNominalN: 4000,
  loadSensitivity: 0.04,
  slipRatioPeak: 0.1,
  slipAnglePeakRad: 0.1,
  shapeC: 1.4,
  muLoadFloor: 0.5,
};

// Phase 2 placeholders (Art. 6: different peak grip) — scaled from Medium.
export const TYRE_SOFT: TyreCompoundParams = { ...TYRE_MEDIUM, muX0: 1.85, muY0: 1.83 };
export const TYRE_HARD: TyreCompoundParams = { ...TYRE_MEDIUM, muX0: 1.75, muY0: 1.73 };

export const TYRE_COMPOUNDS: Record<Compound, TyreCompoundParams> = {
  soft: TYRE_SOFT,
  medium: TYRE_MEDIUM,
  hard: TYRE_HARD,
};

/** Phase 1 constant surface temperature placeholder (°C) until the thermal model lands. */
export const TYRE_DEFAULT_TEMP_C = 95;
