import type { LayoutSpec } from '@gx/track';

/**
 * TT-1 physics test track (~2.5–3 km, flat, walls both sides):
 * long straight → heavy-braking hairpin → fast sweeper (~250 km/h) → chicane → medium 90° → straight.
 */
export const TT1_LAYOUT: LayoutSpec = {
  id: 'tt1',
  name: 'TT-1 Test Track',
  defaultWidth: 14,
  defaultRunoff: 8,
  segments: [
    { kind: 'straight', length: 1120, label: 'Main straight' },
    { kind: 'arc', angleDeg: 180, radius: 19, label: 'T1 Hairpin', runoffL: 3, runoffR: 14 },
    { kind: 'straight', length: 60, sector: true },
    { kind: 'arc', angleDeg: -40, radius: 170, label: 'T2 Sweeper' },
    { kind: 'straight', length: 120 },
    { kind: 'arc', angleDeg: 25, radius: 35, label: 'T3 Chicane L', sector: true },
    { kind: 'arc', angleDeg: -25, radius: 35, label: 'T4 Chicane R' },
    { kind: 'straight', length: 100, adjustable: true },
    { kind: 'arc', angleDeg: 90, radius: 45, label: 'T5 Ninety' },
    { kind: 'straight', length: 100, adjustable: true },
    { kind: 'arc', angleDeg: 130, radius: 90, label: 'T6 Final' },
    { kind: 'straight', length: 100 },
  ],
};

/**
 * INOVX International Circuit — Phase 1 blockout (SPEC §10). Fictional, Sepang × Silverstone:
 * wide double-apex T1–T2, fast Copse-style right, Maggots–Becketts–Chapel-style esses,
 * Stowe-style medium corner, long back straight into a tight hairpin, slow complex before
 * the pit straight. CCW overall.
 */
const INOVX_BASE: LayoutSpec = {
  id: 'inovx',
  name: 'INOVX International Circuit',
  defaultWidth: 15,
  defaultRunoff: 12,
  segments: [
    { kind: 'straight', length: 640, label: 'Pit straight' },
    { kind: 'arc', angleDeg: -62, radius: 95, label: 'T1', width: 18 },
    { kind: 'straight', length: 30, width: 18 },
    { kind: 'arc', angleDeg: -48, radius: 70, label: 'T2', width: 18 },
    { kind: 'straight', length: 110 },
    { kind: 'arc', angleDeg: 45, radius: 200, label: 'T3' },
    { kind: 'straight', length: 120 },
    { kind: 'arc', angleDeg: -70, radius: 230, label: 'T4 Copse-style' },
    { kind: 'straight', length: 80 },
    { kind: 'arc', angleDeg: 45, radius: 170, label: 'T5 Esses' },
    { kind: 'arc', angleDeg: -55, radius: 140, label: 'T6 Esses' },
    { kind: 'arc', angleDeg: 55, radius: 130, label: 'T7 Esses', sector: true },
    { kind: 'arc', angleDeg: -30, radius: 180, label: 'T8 Chapel-style' },
    { kind: 'straight', length: 500, adjustable: true, label: 'Hangar straight' },
    { kind: 'arc', angleDeg: 100, radius: 105, label: 'T9 Stowe-style' },
    { kind: 'straight', length: 200 },
    { kind: 'arc', angleDeg: 55, radius: 150, label: 'T10' },
    { kind: 'straight', length: 150 },
    { kind: 'arc', angleDeg: 55, radius: 300, label: 'T11' },
    { kind: 'straight', length: 400, adjustable: true },
    { kind: 'arc', angleDeg: 90, radius: 120, label: 'T12', sector: true },
    { kind: 'straight', length: 1180, label: 'Back straight' },
    {
      kind: 'arc',
      angleDeg: 180,
      radius: 27,
      label: 'T13 Hairpin',
      width: 16,
      runoffL: 4,
      runoffR: 16,
    },
    { kind: 'straight', length: 110 },
    { kind: 'arc', angleDeg: -40, radius: 55, label: 'T14' },
    { kind: 'arc', angleDeg: 40, radius: 60, label: 'T15' },
    { kind: 'straight', length: 160 },
  ],
};

/** Uniform scale of the INOVX blockout (lengths + radii) used to hit the ~5.5 km SPEC length. */
export const INOVX_SCALE = 0.85;
/** Radii below this are not scaled (keeps the hairpin from getting tighter). */
const MIN_SCALED_RADIUS_M = 28;

export const INOVX_LAYOUT: LayoutSpec = scaleLayout(INOVX_BASE, INOVX_SCALE, MIN_SCALED_RADIUS_M);

function scaleLayout(spec: LayoutSpec, f: number, minRadius: number): LayoutSpec {
  return {
    ...spec,
    segments: spec.segments.map((seg) =>
      seg.kind === 'straight'
        ? { ...seg, length: seg.length * f }
        : {
            ...seg,
            radius: seg.radius <= minRadius ? seg.radius : Math.max(minRadius, seg.radius * f),
          },
    ),
  };
}
