/* Dev helper: ASCII plot of a generated track. Letters mark the sequence (a = start). */
import { buildLayout, buildTrack, parseTrackJson } from '@gx/track';
import { INOVX_LAYOUT, TT1_LAYOUT } from '../layouts';

const spec = process.argv[2] === 'tt1' ? TT1_LAYOUT : INOVX_LAYOUT;
const t = buildTrack(parseTrackJson(buildLayout(spec).json));
let minX = Infinity,
  maxX = -Infinity,
  minY = Infinity,
  maxY = -Infinity;
for (let i = 0; i < t.n; i++) {
  minX = Math.min(minX, t.x[i]!);
  maxX = Math.max(maxX, t.x[i]!);
  minY = Math.min(minY, t.y[i]!);
  maxY = Math.max(maxY, t.y[i]!);
}
const W = 110;
const H = Math.round(((maxY - minY) / (maxX - minX)) * W * 0.5) + 1;
const grid = Array.from({ length: H + 1 }, () => new Array<string>(W + 1).fill(' '));
for (let i = 0; i < t.n; i++) {
  const gx = Math.round(((t.x[i]! - minX) / (maxX - minX)) * W);
  const gy = H - Math.round(((t.y[i]! - minY) / (maxY - minY)) * H);
  grid[gy]![gx] = String.fromCharCode(97 + Math.floor((t.s[i]! / t.length) * 26));
}
console.log(grid.map((r) => r.join('')).join('\n'));
console.log(
  `x ${minX.toFixed(0)}..${maxX.toFixed(0)}  y ${minY.toFixed(0)}..${maxY.toFixed(0)}  L=${t.length.toFixed(0)}`,
);
for (const c of t.json.corners)
  console.log(`${String.fromCharCode(97 + Math.floor(c.at * 26))} ${c.name}`);
