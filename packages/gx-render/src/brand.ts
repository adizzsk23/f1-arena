import * as THREE from 'three';

/**
 * Owner-supplied brand logos (assets/brand/). URLs are injected by the app so gx-render
 * stays asset-agnostic. Until a logo has loaded (or if it fails), the clean text
 * placeholder is shown — never an invented logo.
 */
export interface BrandAssets {
  inovxLogoUrl?: string;
  spektrumLogoUrl?: string;
}

/** INOVX artwork has dark letters → shown on light panels; Spektrum is lime → dark panels. */
export const BRAND_PANEL = {
  inovx: { bg: '#f4f6fb', accent: '#c8202f', fallbackFg: '#0b1020' },
  spektrum: { bg: '#0a0f24', accent: '#a3d93b', fallbackFg: '#a3d93b' },
} as const;

const trimCache = new Map<string, Promise<HTMLCanvasElement>>();

/**
 * Load an image and crop it to its visible content (drops transparent and near-white
 * margins), so square artwork with big padding still fills a board.
 */
export function loadTrimmedLogo(url: string): Promise<HTMLCanvasElement> {
  let p = trimCache.get(url);
  if (p) return p;
  p = new Promise<HTMLCanvasElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
      let x0 = width;
      let y0 = height;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const a = data[i + 3]!;
          const nearWhite = data[i]! > 235 && data[i + 1]! > 235 && data[i + 2]! > 235;
          if (a > 24 && !nearWhite) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) {
        resolve(c);
        return;
      }
      const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
      x0 = Math.max(0, x0 - pad);
      y0 = Math.max(0, y0 - pad);
      x1 = Math.min(width - 1, x1 + pad);
      y1 = Math.min(height - 1, y1 + pad);
      const out = document.createElement('canvas');
      out.width = x1 - x0 + 1;
      out.height = y1 - y0 + 1;
      const og = out.getContext('2d')!;
      // knock out the white background so the logo sits cleanly on any panel colour
      const crop = g.getImageData(x0, y0, out.width, out.height);
      const d = crop.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i]! > 235 && d[i + 1]! > 235 && d[i + 2]! > 235) d[i + 3] = 0;
      }
      og.putImageData(crop, 0, 0);
      resolve(out);
    };
    img.onerror = () => reject(new Error(`logo failed to load: ${url}`));
    img.src = url;
  });
  trimCache.set(url, p);
  return p;
}

export interface PanelOptions {
  width?: number;
  height?: number;
  bg: string;
  accent?: string;
  fallbackText: string;
  fallbackFg: string;
  /** Fraction of the panel height the logo may occupy. */
  fill?: number;
}

function drawFrame(g: CanvasRenderingContext2D, w: number, h: number, o: PanelOptions): void {
  g.fillStyle = o.bg;
  g.fillRect(0, 0, w, h);
  if (o.accent) {
    g.fillStyle = o.accent;
    g.fillRect(0, h - h * 0.07, w, h * 0.07);
  }
}

/** Draw a logo contain-fit into a box. */
export function drawLogoContain(
  g: CanvasRenderingContext2D,
  logo: CanvasImageSource & { width: number; height: number },
  bx: number,
  by: number,
  bw: number,
  bh: number,
): void {
  const s = Math.min(bw / logo.width, bh / logo.height);
  const w = logo.width * s;
  const h = logo.height * s;
  g.drawImage(logo, bx + (bw - w) / 2, by + (bh - h) / 2, w, h);
}

/** Board texture: text placeholder now, real logo as soon as it loads. */
export function logoPanelTexture(
  logoUrl: string | undefined,
  o: PanelOptions,
): THREE.CanvasTexture {
  const w = o.width ?? 1024;
  const h = o.height ?? 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  drawFrame(g, w, h, o);
  g.fillStyle = o.fallbackFg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${h * 0.5}px "Segoe UI", Arial, sans-serif`;
  g.fillText(o.fallbackText, w / 2, h * 0.47, w * 0.9);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (logoUrl) {
    loadTrimmedLogo(logoUrl)
      .then((logo) => {
        drawFrame(g, w, h, o);
        const fill = o.fill ?? 0.72;
        const bh = h * fill;
        drawLogoContain(g, logo, w * 0.06, (h * 0.93 - bh) / 2, w * 0.88, bh);
        tex.needsUpdate = true;
      })
      .catch(() => {
        /* keep the text placeholder */
      });
  }
  return tex;
}

/**
 * Start-gantry banner: "InovX Grand Prix" wordmark with the INOVX logo (on a light chip)
 * and the Spektrum logo either side.
 */
export function gantryTexture(brand: BrandAssets): THREE.CanvasTexture {
  const w = 2048;
  const h = 320;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = (inovx?: HTMLCanvasElement, spek?: HTMLCanvasElement) => {
    g.fillStyle = '#0b1020';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff3b5c';
    g.fillRect(0, h - 18, w, 18);
    g.fillRect(0, 0, w, 8);
    // centre wordmark
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.font = `800 ${h * 0.36}px "Segoe UI", Arial, sans-serif`;
    g.fillText('InovX Grand Prix', w / 2, h * 0.47, w * 0.5);
    // left: INOVX on a light chip
    const chipW = w * 0.2;
    const chipH = h * 0.66;
    const cy = (h - chipH) / 2 - 4;
    g.fillStyle = BRAND_PANEL.inovx.bg;
    g.fillRect(w * 0.03, cy, chipW, chipH);
    if (inovx)
      drawLogoContain(
        g,
        inovx,
        w * 0.03 + chipW * 0.08,
        cy + chipH * 0.12,
        chipW * 0.84,
        chipH * 0.76,
      );
    else {
      g.fillStyle = BRAND_PANEL.inovx.fallbackFg;
      g.font = `800 ${chipH * 0.5}px "Segoe UI", Arial, sans-serif`;
      g.fillText('INOVX', w * 0.03 + chipW / 2, cy + chipH / 2, chipW * 0.9);
    }
    // right: Spektrum (lime on the dark banner)
    const rx = w * 0.77;
    if (spek) drawLogoContain(g, spek, rx, cy + chipH * 0.1, chipW, chipH * 0.8);
    else {
      g.fillStyle = BRAND_PANEL.spektrum.fallbackFg;
      g.font = `800 ${chipH * 0.4}px "Segoe UI", Arial, sans-serif`;
      g.fillText('SPEKTRUM', rx + chipW / 2, cy + chipH / 2, chipW);
    }
    tex.needsUpdate = true;
  };
  draw();
  const pI = brand.inovxLogoUrl
    ? loadTrimmedLogo(brand.inovxLogoUrl).catch(() => undefined)
    : Promise.resolve(undefined);
  const pS = brand.spektrumLogoUrl
    ? loadTrimmedLogo(brand.spektrumLogoUrl).catch(() => undefined)
    : Promise.resolve(undefined);
  void Promise.all([pI, pS]).then(([i, s]) => draw(i, s));
  return tex;
}
