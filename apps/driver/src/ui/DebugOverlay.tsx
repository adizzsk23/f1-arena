import type { HudData } from '../store';

const NAMES = ['FL', 'FR', 'RL', 'RR'];

/** F3 telemetry: per-wheel load / slip / μ, aero forces, power, fps, sim step time. */
export function DebugOverlay({ h }: { h: HudData }) {
  return (
    <div className="pointer-events-none absolute left-4 top-24 w-[25rem] rounded-md border border-white/15 bg-black/75 p-3 font-mono text-[11px] leading-5 text-white/90 tabular">
      <div className="mb-1 flex justify-between text-white/60">
        <span>DEBUG (F3)</span>
        <span>
          {h.fps.toFixed(0)} fps · sim {h.simStepMs.toFixed(3)} ms/step
        </span>
      </div>
      <table className="w-full">
        <thead className="text-white/50">
          <tr>
            <th className="text-left">whl</th>
            <th className="text-right">Fz N</th>
            <th className="text-right">κ</th>
            <th className="text-right">α °</th>
            <th className="text-right">μpk</th>
            <th className="text-right">slip</th>
          </tr>
        </thead>
        <tbody>
          {h.wheels.map((w, i) => (
            <tr
              key={i}
              className={w.locked ? 'text-red-400' : w.combined > 1 ? 'text-yellow-300' : ''}
            >
              <td>{NAMES[i]}</td>
              <td className="text-right">{w.fz.toFixed(0)}</td>
              <td className="text-right">{w.slipRatio.toFixed(3)}</td>
              <td className="text-right">{w.slipAngleDeg.toFixed(2)}</td>
              <td className="text-right">{w.mu.toFixed(2)}</td>
              <td className="text-right">{w.combined.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 grid grid-cols-2 gap-x-4">
        <span>Downforce {(h.downforceN / 1000).toFixed(2)} kN</span>
        <span>Drag {(h.dragN / 1000).toFixed(2)} kN</span>
        <span>P wheels {h.powerKw.toFixed(0)} kW</span>
        <span>
          G {h.gLong.toFixed(2)} / {h.gLat.toFixed(2)}
        </span>
        <span>
          ERS +{h.ersHarvestKw.toFixed(0)} / −{h.ersDeployKw.toFixed(0)} kW
        </span>
        <span>Wheels off: {h.wheelsOff}</span>
      </div>
      <div className="mt-1 truncate text-white/50">Pad: {h.padId || 'none'}</div>
    </div>
  );
}
