import { useEffect, useState } from 'react';
import type { Bindings, DigitalAction, PadBinding } from '../input/bindings';
import {
  DEFAULT_BINDINGS,
  DIGITAL_ACTIONS,
  describeKey,
  describePad,
  saveBindings,
} from '../input/bindings';
import { inputManager } from '../input/instance';

type Target =
  | { action: DigitalAction; slot: 'key' | 'pad' }
  | { analog: 'steer' | 'throttle' | 'brake' }
  | null;

/** Rebinding screen: keyboard keys, pad buttons/axes, and analog axes (wheels / pedals). */
export function Rebind({ onClose }: { onClose: () => void }) {
  const [b, setB] = useState<Bindings>(() => structuredClone(inputManager.bindings));
  const [target, setTarget] = useState<Target>(null);

  useEffect(() => {
    if (!target) return;
    inputManager.beginCapture((ev) => {
      setB((prev) => {
        const next = structuredClone(prev);
        if ('action' in target) {
          if (target.slot === 'key' && ev.key) next.keys[target.action] = [ev.key];
          if (target.slot === 'pad' && ev.pad) next.pad[target.action] = [ev.pad];
        } else if (ev.pad) {
          if (target.analog === 'steer' && ev.pad.kind === 'axis')
            next.padSteer = { ...ev.pad, rest: 0, full: ev.pad.full };
          if (target.analog === 'throttle') next.padThrottle = ev.pad;
          if (target.analog === 'brake') next.padBrake = ev.pad;
        }
        return next;
      });
      inputManager.endCapture();
      setTarget(null);
    });
    // pads are polled by rAF while capturing
    let raf = 0;
    const poll = () => {
      inputManager.pollPads();
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(raf);
      inputManager.endCapture();
    };
  }, [target]);

  const apply = (next: Bindings) => {
    inputManager.bindings = next;
    saveBindings(next);
  };

  const waiting = (t: Target) => target !== null && JSON.stringify(t) === JSON.stringify(target);
  const btn = 'rounded border border-white/15 bg-white/5 px-2 py-1 text-xs hover:bg-white/15';

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur">
      <div className="max-h-[90vh] w-[44rem] overflow-y-auto rounded-xl border border-white/15 bg-gx-panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-wide">Controls</h2>
          <span className="text-xs text-white/60">
            Click a slot, then press a key / button or move an axis. Esc in capture = key Esc.
          </span>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
          {(['steer', 'throttle', 'brake'] as const).map((a) => {
            const cur: PadBinding =
              a === 'steer' ? b.padSteer : a === 'throttle' ? b.padThrottle : b.padBrake;
            return (
              <div key={a} className="rounded border border-white/10 p-2">
                <div className="text-xs uppercase text-white/60">Analog {a}</div>
                <button className={btn} onClick={() => setTarget({ analog: a })}>
                  {waiting({ analog: a }) ? 'Move axis / press…' : describePad(cur)}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mb-4 flex items-center gap-3 text-sm">
          <span className="text-white/60">Analog device category (SPEC §8):</span>
          {(['auto', 'gamepad', 'wheel'] as const).map((d) => (
            <label key={d} className="flex items-center gap-1">
              <input
                type="radio"
                checked={b.analogDevice === d}
                onChange={() => setB({ ...b, analogDevice: d })}
              />
              {d}
            </label>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-white/50">
            <tr>
              <th className="py-1">Action</th>
              <th>Keyboard</th>
              <th>Gamepad / wheel</th>
            </tr>
          </thead>
          <tbody>
            {DIGITAL_ACTIONS.map(({ id, label }) => (
              <tr key={id} className="border-t border-white/5">
                <td className="py-1">{label}</td>
                <td>
                  <button className={btn} onClick={() => setTarget({ action: id, slot: 'key' })}>
                    {waiting({ action: id, slot: 'key' })
                      ? 'Press a key…'
                      : b.keys[id].map(describeKey).join(' / ')}
                  </button>
                </td>
                <td>
                  {id === 'throttle' ||
                  id === 'brake' ||
                  id === 'steerLeft' ||
                  id === 'steerRight' ? (
                    <span className="text-xs text-white/40">analog (above)</span>
                  ) : (
                    <button className={btn} onClick={() => setTarget({ action: id, slot: 'pad' })}>
                      {waiting({ action: id, slot: 'pad' })
                        ? 'Press a button…'
                        : (b.pad[id] ?? []).map(describePad).join(' / ') || '—'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end gap-2">
          <button className={btn} onClick={() => setB(structuredClone(DEFAULT_BINDINGS))}>
            Reset defaults
          </button>
          <button
            className="rounded bg-gx-accent px-4 py-1.5 text-sm font-semibold"
            onClick={() => {
              apply(b);
              onClose();
            }}
          >
            Save
          </button>
          <button className={btn} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
