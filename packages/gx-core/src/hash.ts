/**
 * Deterministic FNV-1a (32-bit, two lanes → 64-bit hex) over every number/boolean/string
 * in a plain object tree, in key-insertion order. Numbers are hashed by their IEEE-754 bits.
 */
const buf = new DataView(new ArrayBuffer(8));

export function hashState(root: unknown): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  const byte = (b: number) => {
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ b, 0x01000193 ^ 0x5bd1e995) >>> 0;
  };
  const num = (v: number) => {
    buf.setFloat64(0, v);
    for (let i = 0; i < 8; i++) byte(buf.getUint8(i));
  };
  const walk = (v: unknown): void => {
    if (typeof v === 'number') num(v);
    else if (typeof v === 'boolean') byte(v ? 1 : 2);
    else if (typeof v === 'string') {
      for (let i = 0; i < v.length; i++) byte(v.charCodeAt(i) & 0xff);
    } else if (v === null || v === undefined) byte(0);
    else if (Array.isArray(v) || ArrayBuffer.isView(v)) {
      const arr = v as ArrayLike<unknown>;
      for (let i = 0; i < arr.length; i++) walk(arr[i]);
    } else if (typeof v === 'object') {
      for (const k of Object.keys(v as object)) {
        walk(k);
        walk((v as Record<string, unknown>)[k]);
      }
    }
  };
  walk(root);
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
