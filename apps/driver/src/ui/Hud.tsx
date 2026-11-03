import { formatLapTime, REV_LIMIT_RPM } from '@gx/core';
import { BrandLockup } from '../brand';
import type { HudData } from '../store';

const LIGHTS = 15;
const LIGHT_START_RPM = 10_500;

function ShiftLights({ rpm }: { rpm: number }) {
  const frac = (rpm - LIGHT_START_RPM) / (REV_LIMIT_RPM - 200 - LIGHT_START_RPM);
  const on = Math.max(0, Math.min(LIGHTS, Math.round(frac * LIGHTS)));
  const flash = rpm > REV_LIMIT_RPM - 250 && Math.floor(performance.now() / 80) % 2 === 0;
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: LIGHTS }, (_, i) => {
        const color = i < 5 ? 'bg-green-400' : i < 10 ? 'bg-red-500' : 'bg-violet-500';
        const lit = flash || i < on;
        return (
          <div
            key={i}
            className={`h-3.5 w-3.5 rounded-full ${lit ? color + ' shadow-[0_0_10px_currentColor]' : 'bg-white/10'}`}
          />
        );
      })}
    </div>
  );
}

function Bar({ v, color, label }: { v: number; color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-24 w-3 overflow-hidden rounded bg-white/10">
        <div
          className={`absolute bottom-0 w-full ${color}`}
          style={{ height: `${Math.round(v * 100)}%` }}
        />
      </div>
      <span className="text-[10px] tracking-widest text-white/60">{label}</span>
    </div>
  );
}

function GMeter({ lon, lat }: { lon: number; lat: number }) {
  const R = 44;
  const scale = R / 5; // 5 g at the rim
  const x = Math.max(-R, Math.min(R, -lat * scale));
  const y = Math.max(-R, Math.min(R, -lon * scale));
  return (
    <svg
      width={R * 2 + 8}
      height={R * 2 + 8}
      viewBox={`${-R - 4} ${-R - 4} ${R * 2 + 8} ${R * 2 + 8}`}
    >
      {[1, 2, 3, 4, 5].map((g) => (
        <circle key={g} r={g * scale} fill="none" stroke="rgba(255,255,255,0.12)" />
      ))}
      <line x1={-R} x2={R} y1={0} y2={0} stroke="rgba(255,255,255,0.15)" />
      <line y1={-R} y2={R} x1={0} x2={0} stroke="rgba(255,255,255,0.15)" />
      <circle cx={x} cy={y} r={5} fill="#ffd23f" />
      <text x={R - 2} y={R} fontSize="9" fill="rgba(255,255,255,.6)" textAnchor="end">
        {Math.hypot(lon, lat).toFixed(1)}g
      </text>
    </svg>
  );
}

function sectorClass(cur: number, best: number): string {
  if (!Number.isFinite(cur)) return 'text-white/40';
  if (!Number.isFinite(best) || cur <= best + 1e-6) return 'text-violet-300';
  return 'text-yellow-300';
}

export function Hud({ h }: { h: HudData }) {
  const gear = h.gear === -1 ? 'R' : h.gear === 0 ? 'N' : String(h.gear);
  return (
    <div className="pointer-events-none absolute inset-0 select-none font-display">
      {/* Corner bug */}
      <div className="absolute left-4 top-4 rounded-md border border-white/15 bg-black/50 px-3 py-1.5 backdrop-blur">
        <div className="text-sm font-extrabold tracking-[0.2em]">
          InovX <span className="text-gx-accent">Grand Prix</span>
        </div>
        <div className="mt-1.5">
          <BrandLockup height={16} />
        </div>
      </div>

      {/* Shift lights */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 backdrop-blur">
        <ShiftLights rpm={h.rpm} />
      </div>

      {/* Timing */}
      <div className="absolute right-4 top-4 w-64 rounded-md border border-white/15 bg-black/55 p-3 text-sm backdrop-blur tabular">
        <div className="flex justify-between text-white/60">
          <span>LAP {h.lapStarted ? h.lapsCompleted + 1 : '—'}</span>
          <span>{h.lapStarted ? '' : 'OUT LAP'}</span>
        </div>
        <div className="text-3xl font-bold">{formatLapTime(h.lapTime)}</div>
        <div className="mt-1 grid grid-cols-3 gap-1 text-xs">
          {[0, 1, 2].map((k) => {
            const cur = k < h.sector ? h.currentSectors[k]! : h.lastSectors[k]!;
            return (
              <div key={k} className="rounded bg-white/5 px-1.5 py-1">
                <div className="text-[10px] text-white/50">S{k + 1}</div>
                <div className={sectorClass(cur, h.bestSectors[k]!)}>
                  {Number.isFinite(cur) ? cur.toFixed(3) : '--.---'}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-xs">
          <span className="text-white/60">LAST</span>
          <span>{formatLapTime(h.lastLap)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-white/60">BEST</span>
          <span className="text-violet-300">{formatLapTime(h.bestLap)}</span>
        </div>
      </div>

      {/* Speed / gear */}
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-end gap-6 rounded-xl border border-white/15 bg-black/55 px-6 py-3 backdrop-blur tabular">
        <div className="text-right">
          <div className="text-5xl font-extrabold leading-none">{Math.round(h.speedKph)}</div>
          <div className="text-xs tracking-widest text-white/60">KM/H</div>
        </div>
        <div className="flex h-16 w-14 items-center justify-center rounded-lg bg-white/10 text-5xl font-black text-gx-gold">
          {gear}
        </div>
        <div className="text-left">
          <div className="text-2xl font-bold leading-none">
            {Math.round(h.rpm).toLocaleString()}
          </div>
          <div className="text-xs tracking-widest text-white/60">RPM</div>
        </div>
      </div>

      {/* Left: inputs */}
      <div className="absolute bottom-6 left-4 flex items-end gap-3 rounded-md border border-white/15 bg-black/55 p-3 backdrop-blur">
        <Bar v={h.throttle} color="bg-green-400" label="THR" />
        <Bar v={h.brake} color="bg-red-500" label="BRK" />
        <div className="flex flex-col items-center gap-1">
          <div className="relative h-3 w-28 rounded bg-white/10">
            <div
              className="absolute top-0 h-3 w-1 bg-gx-gold"
              style={{ left: `${50 + h.steer * 50}%` }}
            />
          </div>
          <span className="text-[10px] tracking-widest text-white/60">
            STEER · {h.device.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Right: ERS, bias, g */}
      <div className="absolute bottom-6 right-4 flex items-end gap-4 rounded-md border border-white/15 bg-black/55 p-3 backdrop-blur tabular">
        <div className="w-28 text-xs">
          <div className="flex justify-between">
            <span className="text-white/60">ERS</span>
            <span className={h.ersOn ? 'text-sky-300' : 'text-white/40'}>
              {h.ersOn ? (h.ersDeployKw > 1 ? 'DEPLOY' : 'ON') : 'OFF'}
            </span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded bg-white/10">
            <div className="h-full bg-sky-400" style={{ width: `${h.ersPct}%` }} />
          </div>
          <div className="mt-0.5 text-right text-white/70">{h.ersPct.toFixed(0)}%</div>
          <div className="mt-2 flex justify-between">
            <span className="text-white/60">BIAS</span>
            <span>{h.brakeBiasPct.toFixed(1)}% F</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-white/60">DRS</span>
            <span className={h.drs ? 'text-green-400' : 'text-white/40'}>
              {h.drs ? 'OPEN' : '—'}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-white/60">CAM</span>
            <span>{h.camera.toUpperCase()}</span>
          </div>
        </div>
        <GMeter lon={h.gLong} lat={h.gLat} />
      </div>
    </div>
  );
}
