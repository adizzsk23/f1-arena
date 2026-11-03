import * as THREE from 'three';
import type { TrackModel } from '@gx/track';
import { asphaltTexture } from './textures';
import type { BrandAssets } from './brand';
import { BRAND_PANEL, gantryTexture, logoPanelTexture } from './brand';
import type { GraphicsPreset } from './presets';

/** World mapping: physics (x, y) → three (x, h, −y). */
export const toThree = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, -y);

const KERB_WIDTH_M = 1.3;
const LINE_WIDTH_M = 0.25;
const WALL_HEIGHT_M = 1.1;

type OffsetFn = (i: number) => number;

/** Triangle-strip ribbon between two lateral offsets (left-positive) at height h. */
function ribbon(
  t: TrackModel,
  a: OffsetFn,
  b: OffsetFn,
  h: number,
  include: (i: number) => boolean = () => true,
  color?: (i: number, side: 0 | 1) => THREE.Color,
  uvScale = 0,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let vi = 0;
  for (let i = 0; i <= t.n; i++) {
    const k = i % t.n;
    const kp = (i - 1 + t.n) % t.n;
    if (!include(k) && !include(kp)) continue;
    const nx = -t.ty[k]!;
    const ny = t.tx[k]!;
    const oa = a(k);
    const ob = b(k);
    pos.push(t.x[k]! + nx * oa, h, -(t.y[k]! + ny * oa));
    pos.push(t.x[k]! + nx * ob, h, -(t.y[k]! + ny * ob));
    if (color) {
      const c0 = color(k, 0);
      const c1 = color(k, 1);
      col.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
    }
    const s = (i * t.ds) / (uvScale || 1);
    uv.push(0, s, (ob - oa) / (uvScale || 1), s);
    if (vi > 0 && include(kp) && include(k)) {
      const p = vi - 2;
      idx.push(p, p + 1, vi, p + 1, vi + 1, vi);
    }
    vi += 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Vertical wall strip at a lateral offset. */
function wallStrip(
  t: TrackModel,
  off: OffsetFn,
  color: (i: number) => THREE.Color,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= t.n; i++) {
    const k = i % t.n;
    const nx = -t.ty[k]!;
    const ny = t.tx[k]!;
    const o = off(k);
    const x = t.x[k]! + nx * o;
    const y = t.y[k]! + ny * o;
    pos.push(x, 0, -y, x, WALL_HEIGHT_M, -y);
    const c = color(k);
    col.push(c.r * 0.6, c.g * 0.6, c.b * 0.6, c.r, c.g, c.b);
    if (i > 0) {
      const p = (i - 1) * 2;
      idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface TrackScene {
  group: THREE.Group;
  /** Emissive floodlight heads (for bloom). */
  lightHeads: THREE.Object3D[];
}

export function buildTrackScene(
  t: TrackModel,
  preset: GraphicsPreset,
  brand: BrandAssets = {},
): TrackScene {
  const group = new THREE.Group();
  const lit = (p: THREE.MeshStandardMaterialParameters) =>
    preset === 'low'
      ? new THREE.MeshLambertMaterial(p as THREE.MeshLambertMaterialParameters)
      : new THREE.MeshStandardMaterial(p);

  const hw = (i: number) => t.halfWidth[i]!;

  // Ground plane
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20000, 20000),
    lit({ color: 0x1d3a24, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = preset === 'high';
  group.add(ground);

  // Run-off / grass band up to the walls (slightly lighter green)
  const grassMat = lit({ color: 0x2b5a33, roughness: 1 });
  group.add(
    new THREE.Mesh(
      ribbon(
        t,
        (i) => t.wallL[i]!,
        (i) => -t.wallR[i]!,
        -0.02,
      ),
      grassMat,
    ),
  );

  // Asphalt
  const asphalt = asphaltTexture();
  asphalt.repeat.set(1, 1);
  const asphaltMat = lit({ map: asphalt, color: 0xbfc4cc, roughness: 0.9, metalness: 0 });
  const road = new THREE.Mesh(
    ribbon(
      t,
      (i) => hw(i),
      (i) => -hw(i),
      0,
      undefined,
      undefined,
      8,
    ),
    asphaltMat,
  );
  road.receiveShadow = preset === 'high';
  group.add(road);

  // White edge lines
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f4f8 });
  group.add(
    new THREE.Mesh(
      ribbon(
        t,
        (i) => hw(i),
        (i) => hw(i) - LINE_WIDTH_M,
        0.01,
      ),
      lineMat,
    ),
  );
  group.add(
    new THREE.Mesh(
      ribbon(
        t,
        (i) => -hw(i) + LINE_WIDTH_M,
        (i) => -hw(i),
        0.01,
      ),
      lineMat,
    ),
  );

  // Kerbs: red/white 4 m stripes, slightly glowing for projector readability
  const red = new THREE.Color(0xe0182d);
  const white = new THREE.Color(0xf4f4f4);
  const stripe = (i: number) => (Math.floor((i * t.ds) / 4) % 2 === 0 ? red : white);
  const kerbMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  group.add(
    new THREE.Mesh(
      ribbon(
        t,
        (i) => hw(i) + KERB_WIDTH_M,
        (i) => hw(i),
        0.03,
        (i) => t.kerbL[i] === 1,
        (i) => stripe(i),
      ),
      kerbMat,
    ),
  );
  group.add(
    new THREE.Mesh(
      ribbon(
        t,
        (i) => -hw(i),
        (i) => -hw(i) - KERB_WIDTH_M,
        0.03,
        (i) => t.kerbR[i] === 1,
        (i) => stripe(i),
      ),
      kerbMat,
    ),
  );

  // Walls (barrier: dark blue with periodic white panels)
  const wallMat = lit({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  const navy = new THREE.Color(0x1a2a6c);
  const panel = new THREE.Color(0xdfe6f3);
  const wcol = (i: number) => (Math.floor((i * t.ds) / 10) % 6 === 0 ? panel : navy);
  group.add(
    new THREE.Mesh(
      wallStrip(t, (i) => t.wallL[i]!, wcol),
      wallMat,
    ),
  );
  group.add(
    new THREE.Mesh(
      wallStrip(t, (i) => -t.wallR[i]!, wcol),
      wallMat,
    ),
  );

  // Start / finish line + grid boxes
  {
    const k = 0;
    const heading = Math.atan2(t.ty[k]!, t.tx[k]!);
    const w = 2 * hw(k);
    const chk = document.createElement('canvas');
    chk.width = 256;
    chk.height = 32;
    const g = chk.getContext('2d')!;
    for (let c = 0; c < 32; c++)
      for (let r = 0; r < 4; r++) {
        g.fillStyle = (c + r) % 2 ? '#111' : '#fff';
        g.fillRect(c * 8, r * 8, 8, 8);
      }
    const tex = new THREE.CanvasTexture(chk);
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 1.6),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = heading + Math.PI / 2;
    line.position.copy(toThree(t.x[k]!, t.y[k]!, 0.02));
    group.add(line);
    for (const g0 of t.json.gridSlotsM) {
      const i = Math.round((t.length - g0) / t.ds) % t.n;
      const box = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 4), lineMat);
      box.rotation.x = -Math.PI / 2;
      box.rotation.z = heading;
      const nx = -t.ty[i]!;
      const ny = t.tx[i]!;
      const side = Math.round(g0 / 8) % 2 ? 2.5 : -2.5;
      box.position.copy(toThree(t.x[i]! + nx * side, t.y[i]! + ny * side, 0.02));
      group.add(box);
    }
  }

  const lightHeads: THREE.Object3D[] = [];
  addTrackside(t, group, preset, lightHeads, brand);
  return { group, lightHeads };
}

/** Grandstands, start gantry, INOVX / SPEKTRUM boards and floodlight towers. */
function addTrackside(
  t: TrackModel,
  group: THREE.Group,
  preset: GraphicsPreset,
  lightHeads: THREE.Object3D[],
  brand: BrandAssets,
): void {
  const at = (s: number) => {
    const i = Math.round(s / t.ds) % t.n;
    return {
      i,
      x: t.x[i]!,
      y: t.y[i]!,
      nx: -t.ty[i]!,
      ny: t.tx[i]!,
      heading: Math.atan2(t.ty[i]!, t.tx[i]!),
    };
  };

  // --- Start gantry with event wordmark ---
  {
    const p = at(t.ds * 6);
    const hw = t.halfWidth[p.i]! + 2;
    const mat = new THREE.MeshStandardMaterial({ color: 0x20242c, metalness: 0.6, roughness: 0.4 });
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), mat);
      post.position.copy(toThree(p.x + p.nx * hw * side, p.y + p.ny * hw * side, 4.5));
      group.add(post);
    }
    const banner = new THREE.MeshBasicMaterial({ map: gantryTexture(brand) });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 0.6, 2.6, 0.5), [
      mat,
      mat,
      mat,
      mat,
      banner,
      banner,
    ]);
    beam.position.copy(toThree(p.x, p.y, 8.2));
    beam.rotation.y = p.heading + Math.PI / 2;
    group.add(beam);
    // start lights (5 red, unlit in Phase 1)
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(
        new THREE.CircleGeometry(0.25, 16),
        new THREE.MeshBasicMaterial({ color: 0x330408 }),
      );
      const o = (k - 2) * 0.8;
      l.position.copy(toThree(p.x + p.nx * o - p.ny * 0.01, p.y + p.ny * o + p.nx * 0.01, 6.6));
      l.rotation.y = p.heading - Math.PI / 2;
      group.add(l);
    }
  }

  // --- Boards on the walls ---
  // INOVX artwork on light panels (dimmed slightly so it doesn't bloom), Spektrum on dark.
  const inovx = new THREE.MeshBasicMaterial({
    color: 0xd8dce4,
    map: logoPanelTexture(brand.inovxLogoUrl, {
      bg: BRAND_PANEL.inovx.bg,
      accent: BRAND_PANEL.inovx.accent,
      fallbackText: 'INOVX',
      fallbackFg: BRAND_PANEL.inovx.fallbackFg,
    }),
  });
  const spek = new THREE.MeshBasicMaterial({
    map: logoPanelTexture(brand.spektrumLogoUrl, {
      bg: BRAND_PANEL.spektrum.bg,
      accent: BRAND_PANEL.spektrum.accent,
      fallbackText: 'SPEKTRUM',
      fallbackFg: BRAND_PANEL.spektrum.fallbackFg,
    }),
  });
  const boardEvery = preset === 'low' ? 220 : 140;
  let n = 0;
  for (let s = 40; s < t.length - 20; s += boardEvery) {
    const p = at(s);
    for (const side of [1, -1] as const) {
      const off = side > 0 ? t.wallL[p.i]! - 0.15 : -(t.wallR[p.i]! - 0.15);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.0), n % 2 ? spek : inovx);
      board.position.copy(toThree(p.x + p.nx * off, p.y + p.ny * off, 0.55));
      // face the track
      board.rotation.y = p.heading + (side > 0 ? 0 : Math.PI);
      group.add(board);
      n++;
    }
  }

  // --- Grandstands along the pit/main straight (outside the left or right wall) ---
  const standMat =
    preset === 'low'
      ? new THREE.MeshLambertMaterial({ color: 0x3a4152 })
      : new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.8 });
  const seatMat =
    preset === 'low'
      ? new THREE.MeshLambertMaterial({ color: 0x26408f })
      : new THREE.MeshStandardMaterial({ color: 0x26408f, roughness: 0.7 });
  const stands = [80, 260, 440];
  for (const s of stands) {
    const p = at(s);
    const off = t.wallR[p.i]! + 6;
    const base = new THREE.Group();
    for (let r = 0; r < 6; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(60, 1.0, 2.2), r % 2 ? seatMat : standMat);
      step.position.set(0, 0.5 + r * 1.0, r * 2.2);
      base.add(step);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(62, 0.4, 15), standMat);
    roof.position.set(0, 9.5, 6);
    base.add(roof);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 3),
      stands.indexOf(s) % 2 ? spek : inovx,
    );
    sign.position.set(0, 11.2, -1.3);
    sign.rotation.y = Math.PI;
    base.add(sign);
    base.position.copy(toThree(p.x - p.nx * off, p.y - p.ny * off, 0));
    base.rotation.y = p.heading;
    group.add(base);
  }

  // --- Floodlight towers (emissive heads glow under bloom) ---
  const towerEvery = preset === 'low' ? 300 : 180;
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
  const poleGeo = new THREE.CylinderGeometry(0.25, 0.35, 22, 6);
  const headGeo = new THREE.BoxGeometry(3.2, 1.4, 0.4);
  for (let s = 90; s < t.length; s += towerEvery) {
    const p = at(s);
    const side = Math.round(s / towerEvery) % 2 ? 1 : -1;
    const off = side > 0 ? t.wallL[p.i]! + 4 : -(t.wallR[p.i]! + 4);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.copy(toThree(p.x + p.nx * off, p.y + p.ny * off, 11));
    group.add(pole);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.copy(toThree(p.x + p.nx * off, p.y + p.ny * off, 22.5));
    head.rotation.y = p.heading;
    head.rotation.x = side * 0.3;
    group.add(head);
    lightHeads.push(head);
  }
}
