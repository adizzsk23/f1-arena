/**
 * Headless physics harness: `pnpm harness`. Runs gx-core with scripted drivers, prints a
 * report table and exits non-zero if any gated test FAILs. Targets: SPEC §4.
 *
 * Tolerance rule (decision, see docs/PROGRESS.md): SPEC §4 values written with "~" get a
 * ±5 % band on their edges. Lap-time targets are applied strictly.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatLapTime } from '@gx/core';
import { acceleration, bestBotLap, braking, determinism, skidpad, topSpeed } from './tests';

type Status = 'PASS' | 'FAIL' | 'INFO';
interface Row {
  test: string;
  measured: string;
  target: string;
  status: Status;
}
const rows: Row[] = [];
const TOL = 0.05;
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');

function band(
  test: string,
  v: number,
  lo: number,
  hi: number,
  unit: string,
  approx = true,
  d = 2,
): void {
  const l = approx ? lo * (1 - TOL) : lo;
  const h = approx ? hi * (1 + TOL) : hi;
  rows.push({
    test,
    measured: `${fmt(v, d)} ${unit}`,
    target: `${approx ? '~' : ''}${lo}–${hi} ${unit}`,
    status: v >= l && v <= h ? 'PASS' : 'FAIL',
  });
}
function info(test: string, measured: string, target = 'info'): void {
  rows.push({ test, measured, target, status: 'INFO' });
}

const t0 = Date.now();

// 1. Top speed
for (const clA of [3.0, 4.0, 5.0]) {
  for (const ers of [true, false]) {
    const r = topSpeed(clA, ers);
    const name = `1 Top speed ClA ${clA.toFixed(1)} ${ers ? 'ERS on ' : 'ERS off'} (3 km)`;
    if (ers && clA === 5.0) {
      // Fixed entirely by SPEC numbers (360 kW + 120 kW, η 0.92, CdA formula) — flagged to owner.
      info(name, `${fmt(r.vmaxKph, 1)} km/h`, 'SPEC-LIMITED (see SPEC notes)');
    } else if (ers) band(name, r.vmaxKph, 280, 330, 'km/h', true, 1);
    else info(name, `${fmt(r.vmaxKph, 1)} km/h`, 'info (envelope assumes ERS deploy)');
  }
}

// 2. Acceleration
const acc = acceleration();
band('2 0–100 km/h', acc.t100, 2.6, 2.6, 's');
info('2 0–200 km/h', `${fmt(acc.t200)} s`, 'info (no SPEC target)');

// 3. Braking
const b1 = braking(300, 80);
band('3 Braking 300→80 peak g', b1.peakG, 4.5, 5.0, 'g');
info('3 Braking 300→80 distance / avg g', `${fmt(b1.distanceM, 1)} m / ${fmt(b1.avgG)} g`);
const b2 = braking(200, 0);
info(
  '3 Braking 200→0 distance / peak / avg g',
  `${fmt(b2.distanceM, 1)} m / ${fmt(b2.peakG)} g / ${fmt(b2.avgG)} g`,
);
band('3 Braking low speed (100→80 km/h band, in 200→0)', b2.lowSpeedG, 2.0, 2.5, 'g');
const b3 = braking(80, 0);
info('3 Braking 80→0 distance / avg g', `${fmt(b3.distanceM, 1)} m / ${fmt(b3.avgG)} g`);

// 4. Skidpad
const sk: Record<string, number> = {};
for (const clA of [3.0, 4.0, 5.0]) {
  for (const v of [80, 150, 250]) {
    sk[`${clA}@${v}`] = skidpad(v, clA);
  }
}
for (const clA of [3.0, 4.0, 5.0]) {
  band(`4 Skidpad ClA ${clA.toFixed(1)} @ 80 km/h`, sk[`${clA}@80`]!, 1.7, 2.0, 'g');
  info(`4 Skidpad ClA ${clA.toFixed(1)} @ 150 km/h`, `${fmt(sk[`${clA}@150`]!)} g`);
}
band('4 Skidpad ClA 4.0 @ 250 km/h (standard build)', sk['4@250']!, 4.0, 4.5, 'g');
{
  const lo = sk['3@250']!;
  const hi = sk['5@250']!;
  rows.push({
    test: '4 Skidpad ClA 3.0 / 5.0 @ 250 km/h',
    measured: `${fmt(lo)} / ${fmt(hi)} g`,
    target: 'aero range brackets ~4–4.5 g',
    status: lo <= 4.5 * (1 + TOL) && hi >= 4.0 * (1 - TOL) && lo < hi ? 'PASS' : 'FAIL',
  });
}

// 5/6. Bot laps
const tt = bestBotLap('tt1');
info(
  '5 Bot lap TT-1',
  `${formatLapTime(tt.lapTimeS)} (min ${fmt(tt.minKph, 0)} / max ${fmt(tt.maxKph, 0)} km/h, grip×${tt.gripScale})`,
  'clean lap',
);
rows[rows.length - 1]!.status = tt.clean ? 'PASS' : 'FAIL';
const mc = bestBotLap('inovx');
band('6 Bot lap INOVX International Circuit', mc.lapTimeS, 90, 98, 's', false);
info(
  '6 INOVX sectors / speeds',
  `${mc.sectorsS.map((s) => fmt(s, 3)).join(' / ')} s; min ${fmt(mc.minKph, 0)} / max ${fmt(mc.maxKph, 0)} km/h; grip×${mc.gripScale}`,
);

// 7. Determinism
const det = determinism();
rows.push({
  test: '7 Determinism (60 s, same seed+inputs)',
  measured: `${det.hashA} / ${det.hashB} / restored ${det.hashRestored}`,
  target: 'identical hashes',
  status: det.hashA === det.hashB && det.hashA === det.hashRestored ? 'PASS' : 'FAIL',
});

// ---- Report ----
const w0 = Math.max(...rows.map((r) => r.test.length));
const w1 = Math.max(...rows.map((r) => r.measured.length));
const w2 = Math.max(...rows.map((r) => r.target.length));
const line = `+-${'-'.repeat(w0)}-+-${'-'.repeat(w1)}-+-${'-'.repeat(w2)}-+------+`;
console.log(line);
console.log(`| ${'Test'.padEnd(w0)} | ${'Measured'.padEnd(w1)} | ${'Target'.padEnd(w2)} | Res  |`);
console.log(line);
for (const r of rows)
  console.log(
    `| ${r.test.padEnd(w0)} | ${r.measured.padEnd(w1)} | ${r.target.padEnd(w2)} | ${r.status} |`,
  );
console.log(line);
const fails = rows.filter((r) => r.status === 'FAIL');
console.log(
  `${rows.length} rows, ${fails.length} FAIL — ${((Date.now() - t0) / 1000).toFixed(1)} s`,
);

const outDir = fileURLToPath(new URL('../reports/', import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(outDir + 'latest.json', JSON.stringify({ rows, tt1: tt, inovx: mc, det }, null, 2));
process.exit(fails.length ? 1 : 0);
