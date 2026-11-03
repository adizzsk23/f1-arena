import type { TrackJsonInput, TrackPoint } from './schema';

/**
 * Turtle-style layout builder: describe a circuit as straights and constant-radius arcs,
 * get Catmull-Rom control points. Two straights flagged `adjustable` are solved so the
 * loop closes exactly (heading closure must already be ±360°).
 */
export type LayoutSegment =
  | {
      kind: 'straight';
      length: number;
      adjustable?: boolean;
      label?: string;
      sector?: boolean;
      width?: number;
      runoffL?: number;
      runoffR?: number;
    }
  | {
      kind: 'arc';
      /** Degrees, positive = left turn. */
      angleDeg: number;
      radius: number;
      label?: string;
      sector?: boolean;
      width?: number;
      runoffL?: number;
      runoffR?: number;
      kerbs?: boolean;
    };

export interface LayoutSpec {
  id: string;
  name: string;
  startX?: number;
  startY?: number;
  startHeadingDeg?: number;
  defaultWidth: number;
  defaultRunoff: number;
  segments: LayoutSegment[];
  gridSlotsM?: number[];
}

export interface LayoutResult {
  json: TrackJsonInput;
  lengthM: number;
  adjustableLengths: number[];
}

const STRAIGHT_STEP_M = 30;

export function buildLayout(spec: LayoutSpec): LayoutResult {
  const totalDeg = spec.segments.reduce((a, s) => a + (s.kind === 'arc' ? s.angleDeg : 0), 0);
  if (Math.abs(Math.abs(totalDeg) - 360) > 1e-6) {
    throw new Error(`Layout ${spec.id}: arcs sum to ${totalDeg}°, must be ±360°`);
  }
  const adj = spec.segments
    .map((s, i) => (s.kind === 'straight' && s.adjustable ? i : -1))
    .filter((i) => i >= 0);
  if (adj.length !== 2) throw new Error(`Layout ${spec.id}: need exactly 2 adjustable straights`);

  // Pass 1: walk with adjustable straights at their given length, record their headings.
  const walk = (lengths: Map<number, number>) => {
    let x = spec.startX ?? 0;
    let y = spec.startY ?? 0;
    let h = ((spec.startHeadingDeg ?? 0) * Math.PI) / 180;
    const headings = new Map<number, number>();
    spec.segments.forEach((seg, i) => {
      if (seg.kind === 'straight') {
        const L = lengths.get(i) ?? seg.length;
        headings.set(i, h);
        x += Math.cos(h) * L;
        y += Math.sin(h) * L;
      } else {
        const a = (seg.angleDeg * Math.PI) / 180;
        const sgn = Math.sign(a);
        // centre of the arc is to the left (sgn>0) or right of the heading
        const cxp = x - Math.sin(h) * seg.radius * sgn;
        const cyp = y + Math.cos(h) * seg.radius * sgn;
        const h2 = h + a;
        x = cxp + Math.sin(h2) * seg.radius * sgn;
        y = cyp - Math.cos(h2) * seg.radius * sgn;
        h = h2;
      }
    });
    return { x, y, headings };
  };
  const zero = new Map<number, number>([
    [adj[0]!, 0],
    [adj[1]!, 0],
  ]);
  const w0 = walk(zero);
  const ha = w0.headings.get(adj[0]!)!;
  const hb = w0.headings.get(adj[1]!)!;
  const ex = (spec.startX ?? 0) - w0.x;
  const ey = (spec.startY ?? 0) - w0.y;
  // La·(cos ha, sin ha) + Lb·(cos hb, sin hb) = (ex, ey)
  const det = Math.cos(ha) * Math.sin(hb) - Math.sin(ha) * Math.cos(hb);
  if (Math.abs(det) < 1e-6) throw new Error(`Layout ${spec.id}: adjustable straights are parallel`);
  const La = (ex * Math.sin(hb) - ey * Math.cos(hb)) / det;
  const Lb = (Math.cos(ha) * ey - Math.sin(ha) * ex) / det;
  if (La < 5 || Lb < 5) {
    throw new Error(
      `Layout ${spec.id}: closure needs negative straights (${La.toFixed(1)}, ${Lb.toFixed(1)})`,
    );
  }
  const lengths = new Map<number, number>([
    [adj[0]!, La],
    [adj[1]!, Lb],
  ]);

  // Pass 2: emit control points.
  const points: TrackPoint[] = [];
  const marks: { s: number; label?: string; sector?: boolean }[] = [];
  let x = spec.startX ?? 0;
  let y = spec.startY ?? 0;
  let h = ((spec.startHeadingDeg ?? 0) * Math.PI) / 180;
  let s = 0;
  const push = (px: number, py: number, seg: LayoutSegment, kerb: boolean) => {
    const width = seg.width ?? spec.defaultWidth;
    points.push({
      x: round3(px),
      y: round3(py),
      width,
      wallL: width / 2 + (seg.runoffL ?? spec.defaultRunoff),
      wallR: width / 2 + (seg.runoffR ?? spec.defaultRunoff),
      kerbL: kerb,
      kerbR: kerb,
    });
  };
  spec.segments.forEach((seg, i) => {
    marks.push({ s, label: seg.label, sector: seg.sector });
    if (seg.kind === 'straight') {
      const L = lengths.get(i) ?? seg.length;
      const steps = Math.max(1, Math.round(L / STRAIGHT_STEP_M));
      for (let k = 0; k < steps; k++) {
        const d = (L * k) / steps;
        push(x + Math.cos(h) * d, y + Math.sin(h) * d, seg, false);
      }
      x += Math.cos(h) * L;
      y += Math.sin(h) * L;
      s += L;
    } else {
      const a = (seg.angleDeg * Math.PI) / 180;
      const sgn = Math.sign(a);
      const arcLen = Math.abs(a) * seg.radius;
      const stepLen = Math.min(18, Math.max(5, seg.radius * 0.3));
      const steps = Math.max(2, Math.round(arcLen / stepLen));
      const cxp = x - Math.sin(h) * seg.radius * sgn;
      const cyp = y + Math.cos(h) * seg.radius * sgn;
      const kerb = seg.kerbs ?? seg.radius < 400;
      for (let k = 0; k < steps; k++) {
        const hk = h + (a * k) / steps;
        push(
          cxp + Math.sin(hk) * seg.radius * sgn,
          cyp - Math.cos(hk) * seg.radius * sgn,
          seg,
          kerb,
        );
      }
      h += a;
      x = cxp + Math.sin(h) * seg.radius * sgn;
      y = cyp - Math.cos(h) * seg.radius * sgn;
      s += arcLen;
    }
  });
  const total = s;
  const sectors = marks.filter((m) => m.sector && m.s > 0).map((m) => round6(m.s / total));
  const corners = marks
    .filter((m) => m.label)
    .map((m) => ({ name: m.label!, at: round6(m.s / total) }));
  return {
    json: {
      id: spec.id,
      name: spec.name,
      version: 1,
      sectors,
      corners,
      points,
      gridSlotsM: spec.gridSlotsM ?? [20, 28, 36, 44],
    },
    lengthM: total,
    adjustableLengths: [La, Lb],
  };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
