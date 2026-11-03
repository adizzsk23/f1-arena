/**
 * Seeded PRNG (sfc32). State is 4 uint32 words stored in a plain array so it serialises
 * with the sim state. Never use Math.random() in simulation code.
 */
export type PrngState = [number, number, number, number];

export function createPrng(seed: number): PrngState {
  // splitmix32 to spread the seed into 4 words
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const st: PrngState = [next(), next(), next(), next()];
  for (let i = 0; i < 12; i++) prngNextU32(st);
  return st;
}

export function prngNextU32(st: PrngState): number {
  let [a, b, c, d] = st;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  st[0] = a >>> 0;
  st[1] = b;
  st[2] = c;
  st[3] = d;
  return t;
}

/** Uniform float in [0, 1). */
export function prngNext(st: PrngState): number {
  return prngNextU32(st) / 4294967296;
}

export function prngRange(st: PrngState, lo: number, hi: number): number {
  return lo + (hi - lo) * prngNext(st);
}
