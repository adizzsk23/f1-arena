/** SPEC §8 input-processing constants (identical for everyone, client + server). */

// Keyboard (digital)
export const KB_THROTTLE_RISE_S = 0.2; // §8: 0→1 in 0.20 s
export const KB_THROTTLE_FALL_S = 0.1; // §8: release 0.10 s
export const KB_BRAKE_RISE_S = 0.25; // §8: 0→1 in 0.25 s
export const KB_BRAKE_FALL_S = 0.1; // §8: release 0.10 s
/** Keyboard steering rate (normalised units/s) at standstill and at high speed. §8 speed-sensitive. */
export const KB_STEER_RATE_LOW = 3.2;
export const KB_STEER_RATE_HIGH = 1.4;
export const KB_STEER_RATE_REF_MPS = 40;
/** Return-to-centre rate when no steer key is held (units/s). */
export const KB_STEER_CENTER_RATE = 4.5;

// Gamepad (analog)
export const PAD_STICK_DEADZONE = 0.06; // §8
export const PAD_STEER_EXPONENT = 1.5; // §8
export const PAD_TRIGGER_DEADZONE = 0.03; // §8

// All devices
/** Universal max steering rate (normalised units/s): full lock-to-lock (2.0) in ≥ 0.33 s. §8 */
export const MAX_STEER_RATE = 6.0;
