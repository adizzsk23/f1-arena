import * as THREE from 'three';

/**
 * Text placeholder textures for branding (SPEC/CLAUDE.md: never invent logos — real logos
 * come from assets/brand/ later). Clean wordmark text only.
 */
export function textTexture(
  text: string,
  opts: {
    width?: number;
    height?: number;
    bg?: string;
    fg?: string;
    font?: string;
    sub?: string;
    accent?: string;
  } = {},
): THREE.CanvasTexture {
  const w = opts.width ?? 1024;
  const h = opts.height ?? 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = opts.bg ?? '#0b1020';
  g.fillRect(0, 0, w, h);
  if (opts.accent) {
    g.fillStyle = opts.accent;
    g.fillRect(0, h - h * 0.08, w, h * 0.08);
    g.fillRect(0, 0, w, h * 0.04);
  }
  g.fillStyle = opts.fg ?? '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = opts.sub ? h * 0.42 : h * 0.55;
  g.font = `800 ${size}px ${opts.font ?? '"Segoe UI", "Helvetica Neue", Arial, sans-serif'}`;
  // letter-spaced wordmark
  const spaced = text.split('').join(String.fromCharCode(8202));
  g.fillText(spaced, w / 2, opts.sub ? h * 0.4 : h * 0.5, w * 0.92);
  if (opts.sub) {
    g.font = `600 ${h * 0.18}px ${opts.font ?? '"Segoe UI", Arial, sans-serif'}`;
    g.globalAlpha = 0.8;
    g.fillText(opts.sub, w / 2, h * 0.78, w * 0.9);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Repeating asphalt noise texture (procedural, self-made). */
export function asphaltTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const img = g.createImageData(s, s);
  // deterministic LCG noise (render-side only)
  let seed = 1337;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < s * s; i++) {
    const v = 52 + rnd() * 26;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v + 4;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
