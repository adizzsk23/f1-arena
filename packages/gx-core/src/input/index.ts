import {
  KB_BRAKE_FALL_S,
  KB_BRAKE_RISE_S,
  KB_STEER_CENTER_RATE,
  KB_STEER_RATE_HIGH,
  KB_STEER_RATE_LOW,
  KB_STEER_RATE_REF_MPS,
  KB_THROTTLE_FALL_S,
  KB_THROTTLE_RISE_S,
  MAX_STEER_RATE,
  PAD_STEER_EXPONENT,
  PAD_STICK_DEADZONE,
  PAD_TRIGGER_DEADZONE,
} from '../config/input';
import { approach, clamp } from '../math';

/**
 * SPEC §8 fairness layer. This exact code runs on the client (feel) and on the server
 * (authority). Devices differ only by category; all share the universal steering rate.
 */
export type InputDevice = 'keyboard' | 'gamepad' | 'wheel';

/** What a client sends each sim step: device-category raw values + edge events. */
export interface RawInputFrame {
  device: InputDevice;
  /** Keyboard: 0 | 1. Analog: 0..1 (client maps device range to 0..1). */
  throttle: number;
  brake: number;
  /** Keyboard: −1 | 0 | 1. Analog: −1..1. Positive = steer right. */
  steer: number;
  gearUp: boolean;
  gearDown: boolean;
  /** Held: DRS test (Phase 1) / DRS request (Phase 3). */
  drs: boolean;
  ersToggle: boolean;
  biasUp: boolean;
  biasDown: boolean;
}

export interface ProcessedInputs {
  throttle: number;
  brake: number;
  /** −1..1, positive = right. Multiplied by the speed-sensitive lock in the vehicle. */
  steer: number;
}

export function neutralInput(device: InputDevice = 'keyboard'): RawInputFrame {
  return {
    device,
    throttle: 0,
    brake: 0,
    steer: 0,
    gearUp: false,
    gearDown: false,
    drs: false,
    ersToggle: false,
    biasUp: false,
    biasDown: false,
  };
}

export function createProcessedInputs(): ProcessedInputs {
  return { throttle: 0, brake: 0, steer: 0 };
}

/** Deadzone with rescale so output still spans 0..1 outside the deadzone. */
export function applyDeadzone(v: number, dz: number): number {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return (Math.sign(v) * (Math.min(a, 1) - dz)) / (1 - dz);
}

export function gamepadSteerCurve(v: number): number {
  const d = applyDeadzone(v, PAD_STICK_DEADZONE);
  return Math.sign(d) * Math.pow(Math.abs(d), PAD_STEER_EXPONENT);
}

export function keyboardSteerRate(speedMps: number): number {
  const f = clamp(speedMps / KB_STEER_RATE_REF_MPS, 0, 1);
  return KB_STEER_RATE_LOW + (KB_STEER_RATE_HIGH - KB_STEER_RATE_LOW) * f;
}

/** Advance processed inputs by dt given the raw frame and current road speed. */
export function processInput(
  st: ProcessedInputs,
  raw: RawInputFrame,
  speedMps: number,
  dt: number,
): void {
  let steerTarget: number;
  if (raw.device === 'keyboard') {
    const thr = raw.throttle > 0.5 ? 1 : 0;
    const brk = raw.brake > 0.5 ? 1 : 0;
    st.throttle = approach(
      st.throttle,
      thr,
      dt / (thr > st.throttle ? KB_THROTTLE_RISE_S : KB_THROTTLE_FALL_S),
    );
    st.brake = approach(st.brake, brk, dt / (brk > st.brake ? KB_BRAKE_RISE_S : KB_BRAKE_FALL_S));
    const dir = raw.steer > 0.5 ? 1 : raw.steer < -0.5 ? -1 : 0;
    if (dir === 0) {
      steerTarget = approach(st.steer, 0, KB_STEER_CENTER_RATE * dt);
    } else {
      // Counter-steering back through centre uses the faster centring rate.
      const rate =
        dir * st.steer < 0
          ? Math.max(KB_STEER_CENTER_RATE, keyboardSteerRate(speedMps))
          : keyboardSteerRate(speedMps);
      steerTarget = approach(st.steer, dir, rate * dt);
    }
  } else {
    st.throttle = clamp(applyDeadzone(clamp(raw.throttle, 0, 1), PAD_TRIGGER_DEADZONE), 0, 1);
    st.brake = clamp(applyDeadzone(clamp(raw.brake, 0, 1), PAD_TRIGGER_DEADZONE), 0, 1);
    const s = clamp(raw.steer, -1, 1);
    steerTarget = raw.device === 'gamepad' ? gamepadSteerCurve(s) : s;
  }
  // Universal max steering rate (all devices, SPEC §8).
  st.steer = clamp(approach(st.steer, steerTarget, MAX_STEER_RATE * dt), -1, 1);
}
