import { describe, expect, it } from 'vitest';
import {
  createPrng,
  createProcessedInputs,
  createSim,
  curvePeakPower,
  dragArea,
  gamepadSteerCurve,
  ICE_MAX_POWER_W,
  KB_BRAKE_RISE_S,
  KB_THROTTLE_RISE_S,
  MAX_STEER_RATE,
  neutralInput,
  processInput,
  prngNext,
  setCarSpeed,
  SIM_DT_S,
  standardCarSpec,
  STANDARD_TORQUE_CURVE,
  steerLockRad,
} from '../src';
import { loadBuiltinTrack } from '@gx/track';

describe('prng', () => {
  it('is deterministic per seed and in [0,1)', () => {
    const a = createPrng(42);
    const b = createPrng(42);
    for (let i = 0; i < 1000; i++) {
      const x = prngNext(a);
      expect(x).toBe(prngNext(b));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(prngNext(createPrng(1))).not.toBe(prngNext(createPrng(2)));
  });
});

describe('regulations', () => {
  it('standard torque curve stays under 360 kW everywhere (Art. 2)', () => {
    const p = curvePeakPower(STANDARD_TORQUE_CURVE);
    expect(p.powerW).toBeLessThanOrEqual(ICE_MAX_POWER_W);
    expect(p.powerW).toBeGreaterThan(0.97 * ICE_MAX_POWER_W);
    expect(STANDARD_TORQUE_CURVE).toHaveLength(6);
  });
  it('CdA follows Art. 4/5 formula', () => {
    expect(dragArea(standardCarSpec())).toBeCloseTo(0.6 + 0.04 * 16 + 0.09, 10);
  });
});

describe('input processing (SPEC §8)', () => {
  it('keyboard throttle ramps 0→1 in 0.20 s and brake in 0.25 s', () => {
    const st = createProcessedInputs();
    const raw = neutralInput('keyboard');
    raw.throttle = 1;
    raw.brake = 1;
    const steps = (s: number) => Math.round(s / SIM_DT_S);
    for (let i = 0; i < steps(KB_THROTTLE_RISE_S) - 1; i++) processInput(st, raw, 0, SIM_DT_S);
    expect(st.throttle).toBeLessThan(1);
    processInput(st, raw, 0, SIM_DT_S);
    expect(st.throttle).toBeCloseTo(1, 6);
    for (let i = steps(KB_THROTTLE_RISE_S); i < steps(KB_BRAKE_RISE_S); i++)
      processInput(st, raw, 0, SIM_DT_S);
    expect(st.brake).toBeCloseTo(1, 6);
  });
  it('gamepad deadzone 0.06 and exponent 1.5', () => {
    expect(gamepadSteerCurve(0.05)).toBe(0);
    expect(gamepadSteerCurve(1)).toBeCloseTo(1);
    expect(gamepadSteerCurve(-0.53)).toBeCloseTo(-Math.pow(0.5, 1.5), 6);
  });
  it('universal max steering rate applies to analog devices', () => {
    const st = createProcessedInputs();
    const raw = neutralInput('wheel');
    raw.steer = 1;
    processInput(st, raw, 30, SIM_DT_S);
    expect(st.steer).toBeCloseTo(MAX_STEER_RATE * SIM_DT_S, 9);
  });
  it('steering lock shrinks with speed', () => {
    expect(steerLockRad(0)).toBeGreaterThan(steerLockRad(30));
    expect(steerLockRad(30)).toBeGreaterThan(steerLockRad(80));
  });
});

describe('vehicle', () => {
  const track = loadBuiltinTrack('tt1');

  it('sits still with no input and stays put', () => {
    const sim = createSim(1, standardCarSpec(), track);
    const x0 = sim.getState().car.x;
    for (let i = 0; i < 240; i++) sim.step(neutralInput());
    expect(Math.abs(sim.getState().car.x - x0)).toBeLessThan(0.01);
  });

  it('locks the wheels when the brake is stamped at low speed (no ABS)', () => {
    const sim = createSim(1, standardCarSpec(), track);
    setCarSpeed(sim.params, sim.getState().car, 25);
    const inp = neutralInput('wheel');
    inp.brake = 1;
    let locked = false;
    for (let i = 0; i < 60; i++) {
      sim.step(inp);
      if (sim.getState().car.wheels.some((w) => w.locked)) locked = true;
    }
    expect(locked).toBe(true);
  });

  it('spins the rears on full throttle from rest in 1st (wheelspin possible)', () => {
    const sim = createSim(1, standardCarSpec(), track);
    const inp = neutralInput('wheel');
    inp.throttle = 1;
    let maxSlip = 0;
    for (let i = 0; i < 120; i++) {
      sim.step(inp);
      maxSlip = Math.max(maxSlip, sim.getState().car.wheels[2]!.slipRatio);
    }
    expect(maxSlip).toBeGreaterThan(0.15);
  });

  it('recovers from a wall hit without NaNs and stays inside the walls', () => {
    const sim = createSim(1, standardCarSpec(), track);
    setCarSpeed(sim.params, sim.getState().car, 50);
    const inp = neutralInput('wheel');
    inp.steer = -1; // hard left into the wall
    for (let i = 0; i < 600; i++) sim.step(inp);
    const st = sim.getState();
    expect(Number.isFinite(st.car.x) && Number.isFinite(st.car.vx)).toBe(true);
    const wall = Math.max(track.wallL[st.trackIndex]!, track.wallR[st.trackIndex]!);
    expect(Math.abs(st.lateralM)).toBeLessThan(wall + 0.5);
    sim.resetToTrack();
    expect(Math.abs(sim.getState().lateralM)).toBeLessThan(0.5);
  });

  it('is deterministic: same seed + inputs → same hash; snapshot/restore round-trips', () => {
    const run = () => {
      const sim = createSim(5, standardCarSpec(), track);
      for (let i = 0; i < 1200; i++) {
        const inp = neutralInput('gamepad');
        inp.throttle = (i % 300) / 300;
        inp.steer = Math.sin(i / 50) * 0.5;
        sim.step(inp);
      }
      return sim;
    };
    const a = run();
    const b = run();
    expect(a.hash()).toBe(b.hash());
    const snap = a.snapshot();
    b.restore(snap);
    expect(b.hash()).toBe(a.hash());
  });
});
