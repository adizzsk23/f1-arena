/**
 * Generates track JSON from the turtle layouts: `pnpm trackgen`.
 * Prints length, adjustable-straight lengths and the minimum clearance between
 * non-adjacent parts of the circuit (self-overlap check).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildLayout, buildTrack, parseTrackJson } from '@gx/track';
import { INOVX_LAYOUT, TT1_LAYOUT } from './layouts';

const outDir = fileURLToPath(new URL('../../../packages/gx-track/tracks/', import.meta.url));

for (const spec of [TT1_LAYOUT, INOVX_LAYOUT]) {
  const res = buildLayout(spec);
  const json = parseTrackJson(res.json);
  const model = buildTrack(json);
  // clearance check: walls of distant parts must not overlap
  let minClear = Infinity;
  let at = '';
  for (let i = 0; i < model.n; i += 3) {
    for (let j = 0; j < model.n; j += 3) {
      let ds = Math.abs(model.s[i]! - model.s[j]!);
      ds = Math.min(ds, model.length - ds);
      if (ds < 250) continue;
      const d = Math.hypot(model.x[i]! - model.x[j]!, model.y[i]! - model.y[j]!);
      const need =
        Math.max(model.wallL[i]!, model.wallR[i]!) + Math.max(model.wallL[j]!, model.wallR[j]!);
      const c = d - need;
      if (c < minClear) {
        minClear = c;
        at = `s=${model.s[i]!.toFixed(0)} vs s=${model.s[j]!.toFixed(0)}`;
      }
    }
  }
  writeFileSync(outDir + `${spec.id}.json`, JSON.stringify(json, null, 1) + '\n');
  console.log(
    `${spec.id}: length ${model.length.toFixed(0)} m (turtle ${res.lengthM.toFixed(0)}), adjustable ${res.adjustableLengths
      .map((l) => l.toFixed(0))
      .join(
        ', ',
      )} m, min wall clearance ${minClear.toFixed(1)} m (${at}), sectors ${json.sectors.join(', ')}`,
  );
}
