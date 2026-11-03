import {
  AERO_K_BASE,
  CDA_BASE_M2,
  DRIVETRAIN_EFFICIENCY,
  ERS_DEPLOY_MAX_W,
  ERS_HARVEST_PER_LAP_J,
  ERS_STORE_MAX_J,
  RADIATOR_DRAG_PER_STEP_M2,
  STANDARD_BUILD_MASS_KG,
  TRACK_WIDTH_M,
  WHEELBASE_M,
} from './config/regulations';
import { COG_HEIGHT_M, STANDARD_FRONT_WEIGHT_DIST, YAW_INERTIA_KGM2 } from './config/physics';
import {
  STANDARD_BRAKE_BIAS,
  STANDARD_FINAL_DRIVE,
  STANDARD_GEAR_RATIOS,
  STANDARD_TORQUE_CURVE,
} from './config/powertrain';
import type { Compound } from './config/tyres';

/**
 * Engineering spec of one car. Phase 4 will wrap this in a Zod schema + regs validator;
 * Phase 1 uses the standard build from SPEC Art. 1–9.
 */
export interface CarSpec {
  /** Build mass incl. driver, excl. fuel (kg). Art. 1 */
  buildMassKg: number;
  fuelKg: number;
  frontWeightDist: number;
  cogHeightM: number;
  yawInertiaKgM2: number;
  wheelbaseM: number;
  trackWidthM: number;
  /** Downforce coefficient·area (m²). Art. 4 */
  clA: number;
  /** Front fraction of downforce. Art. 4 */
  aeroBalance: number;
  /** Induced-drag factor k. Art. 4/9 */
  aeroK: number;
  /** Radiator size 1–5. Art. 5 */
  radiatorSize: number;
  /** Radiator drag multiplier from Art. 9 cooling efficiency (1 = base). */
  coolingDragFactor: number;
  torqueCurve: ReadonlyArray<readonly [number, number]>;
  gearRatios: readonly number[];
  finalDrive: number;
  drivetrainEfficiency: number;
  ersDeployMaxW: number;
  ersStoreMaxJ: number;
  ersHarvestPerLapJ: number;
  brakeBiasDefault: number;
  compound: Compound;
}

/** Standard build per Phase 1 prompt: ClA 4.0, 42 % front, radiator 3, mid gearing, Medium, 30 kg fuel. */
export function standardCarSpec(overrides: Partial<CarSpec> = {}): CarSpec {
  return {
    buildMassKg: STANDARD_BUILD_MASS_KG,
    fuelKg: 30,
    frontWeightDist: STANDARD_FRONT_WEIGHT_DIST,
    cogHeightM: COG_HEIGHT_M,
    yawInertiaKgM2: YAW_INERTIA_KGM2,
    wheelbaseM: WHEELBASE_M,
    trackWidthM: TRACK_WIDTH_M,
    clA: 4.0,
    aeroBalance: 0.42,
    aeroK: AERO_K_BASE,
    radiatorSize: 3,
    coolingDragFactor: 1,
    torqueCurve: STANDARD_TORQUE_CURVE,
    gearRatios: STANDARD_GEAR_RATIOS,
    finalDrive: STANDARD_FINAL_DRIVE,
    drivetrainEfficiency: DRIVETRAIN_EFFICIENCY,
    ersDeployMaxW: ERS_DEPLOY_MAX_W,
    ersStoreMaxJ: ERS_STORE_MAX_J,
    ersHarvestPerLapJ: ERS_HARVEST_PER_LAP_J,
    brakeBiasDefault: STANDARD_BRAKE_BIAS,
    compound: 'medium',
    ...overrides,
  };
}

/** Art. 4/5: CdA = 0.60 + k·ClA² + radiatorDrag, radiatorDrag = 0.03·size (decision: size 1 = one step). */
export function dragArea(spec: CarSpec): number {
  return (
    CDA_BASE_M2 +
    spec.aeroK * spec.clA * spec.clA +
    RADIATOR_DRAG_PER_STEP_M2 * spec.radiatorSize * spec.coolingDragFactor
  );
}

export function totalMass(spec: CarSpec): number {
  return spec.buildMassKg + spec.fuelKg;
}
