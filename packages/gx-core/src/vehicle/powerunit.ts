import {
  ENGINE_BRAKE_C0_NM,
  ENGINE_BRAKE_C1_NM_PER_RPM,
  LIMITER_BAND_RPM,
} from '../config/powertrain';
import { REV_LIMIT_RPM } from '../config/regulations';
import { clamp, interpTable } from '../math';

/** Fuel-cut factor approaching the 15 000 rpm limiter (Art. 2): 1 below the band, 0 at the limit. */
export function limiterFactor(rpm: number): number {
  return clamp((REV_LIMIT_RPM - rpm) / LIMITER_BAND_RPM, 0, 1);
}

/** Full-throttle ICE torque from the 6-point curve (N·m). */
export function curveTorque(curve: ReadonlyArray<readonly [number, number]>, rpm: number): number {
  return interpTable(curve, rpm);
}

/** Off-throttle engine braking torque at the crank (negative, N·m): −(c0 + c1·rpm). */
export function engineBrakeTorque(rpm: number): number {
  return -(ENGINE_BRAKE_C0_NM + ENGINE_BRAKE_C1_NM_PER_RPM * rpm);
}

/** Crank torque at a throttle position: blend of full-load curve and engine braking. */
export function iceTorque(
  curve: ReadonlyArray<readonly [number, number]>,
  rpm: number,
  throttle: number,
): number {
  return (
    throttle * curveTorque(curve, rpm) * limiterFactor(rpm) +
    (1 - throttle) * engineBrakeTorque(rpm)
  );
}

/** Max ICE power of a curve (W), scanned finely so interpolation bulges are caught (Art. 2 check). */
export function curvePeakPower(curve: ReadonlyArray<readonly [number, number]>): {
  powerW: number;
  rpm: number;
} {
  let best = 0;
  let bestRpm = 0;
  const lo = curve[0]![0];
  const hi = Math.min(curve[curve.length - 1]![0], REV_LIMIT_RPM);
  for (let rpm = lo; rpm <= hi; rpm += 5) {
    const p = curveTorque(curve, rpm) * ((rpm * 2 * Math.PI) / 60);
    if (p > best) {
      best = p;
      bestRpm = rpm;
    }
  }
  return { powerW: best, rpm: bestRpm };
}
