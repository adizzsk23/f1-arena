/* Dev helper: trace a braking run (speed, decel, pedal, per-wheel slip/load). */
import {
  kphToMps,
  neutralInput,
  setCarSpeed,
  SIM_DT_S,
  standardCarSpec,
  createSim,
} from '@gx/core';
import { PedalSkill, autoShift } from '../bot';
import { dragStrip } from '../tests';

const from = Number(process.argv[2] ?? 80);
const sim = createSim(1, standardCarSpec(), dragStrip(), { gridOffsetM: 0 });
sim.placeAt(50);
setCarSpeed(sim.params, sim.getState().car, kphToMps(from));
const ped = new PedalSkill(0.1);
for (let k = 0; k < 120 * 6; k++) {
  const inp = neutralInput('wheel');
  inp.brake = ped.brakeFor(sim, 1, SIM_DT_S);
  autoShift(sim, inp);
  sim.step(inp);
  const c = sim.getState().car;
  if (k % 6 === 0)
    console.log(
      (c.vx * 3.6).toFixed(1).padStart(6),
      (-c.ax / 9.81).toFixed(2).padStart(6),
      inp.brake.toFixed(2),
      'g' + c.gear,
      c.wheels
        .map(
          (w) =>
            `${w.slipRatio.toFixed(3)}/${w.fz.toFixed(0)}/${(w.fx / Math.max(w.fz, 1)).toFixed(2)}`,
        )
        .join(' '),
    );
  if (c.vx < 0.3) break;
}
