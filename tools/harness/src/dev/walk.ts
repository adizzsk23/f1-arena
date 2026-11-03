/* Dev helper: print the turtle walk of a layout (positions after each segment). */
import { INOVX_LAYOUT, TT1_LAYOUT } from '../layouts';

const spec = process.argv[2] === 'tt1' ? TT1_LAYOUT : INOVX_LAYOUT;
let x = 0;
let y = 0;
let h = 0;
for (const s of spec.segments) {
  if (s.kind === 'straight') {
    x += Math.cos(h) * s.length;
    y += Math.sin(h) * s.length;
  } else {
    const a = (s.angleDeg * Math.PI) / 180;
    const g = Math.sign(a);
    const cx = x - Math.sin(h) * s.radius * g;
    const cy = y + Math.cos(h) * s.radius * g;
    h += a;
    x = cx + Math.sin(h) * s.radius * g;
    y = cy - Math.cos(h) * s.radius * g;
  }
  console.log(
    (s.label ?? s.kind).padEnd(18),
    x.toFixed(0).padStart(6),
    y.toFixed(0).padStart(6),
    ((h * 180) / Math.PI).toFixed(0).padStart(5),
    s.kind === 'straight' && s.adjustable ? '(adj)' : '',
  );
}
