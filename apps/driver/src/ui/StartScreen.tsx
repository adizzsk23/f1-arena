import type { GraphicsPreset } from '@gx/render';
import { BUILTIN_TRACK_LIST, loadBuiltinTrack } from '@gx/track';
import { BrandLockup } from '../brand';
import { useApp } from '../store';

const PRESETS: { id: GraphicsPreset; label: string; note: string }[] = [
  { id: 'low', label: 'Low', note: 'Integrated GPU · no post-fx' },
  { id: 'med', label: 'Medium', note: 'Bloom' },
  { id: 'high', label: 'High', note: 'Bloom · SMAA · shadows' },
];

const TRACK_NOTES: Record<string, string> = {
  tt1: 'Physics test track · 1.1 km straight, hairpin, sweeper, chicane',
  inovx: 'Main circuit blockout · Sepang × Silverstone character · 3 sectors',
};

export function StartScreen() {
  const { settings, setSettings, setScreen, setShowRebind } = useApp();
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_top,#1d2f6b_0%,#07102e_55%,#05070f_100%)]">
      <div className="w-[52rem] max-w-[95vw]">
        <div className="mb-8 text-center">
          <div className="flex justify-center">
            <BrandLockup height={40} />
          </div>
          <div className="mt-3 text-xs tracking-[0.5em] text-white/60">PRESENT</div>
          <h1 className="mt-2 text-6xl font-black tracking-[0.08em]">
            InovX <span className="text-gx-accent">Grand Prix</span>
          </h1>
          <div className="mx-auto mt-3 h-1 w-40 rounded bg-gradient-to-r from-gx-blue via-white to-gx-accent" />
          <div className="mt-3 text-sm text-white/60">Driver client · Phase 1 · single-player</div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-4">
          {BUILTIN_TRACK_LIST.map((t) => {
            const len = loadBuiltinTrack(t.id).length / 1000;
            const sel = settings.trackId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSettings({ trackId: t.id })}
                className={`rounded-xl border p-4 text-left transition ${sel ? 'border-gx-accent bg-gx-accent/10' : 'border-white/15 bg-white/5 hover:bg-white/10'}`}
              >
                <div className="text-lg font-bold">{t.name}</div>
                <div className="text-sm text-white/60">{len.toFixed(2)} km</div>
                <div className="mt-1 text-xs text-white/50">{TRACK_NOTES[t.id]}</div>
              </button>
            );
          })}
        </div>

        <div className="mb-5 flex items-center gap-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <div>
            <div className="mb-1 text-xs uppercase tracking-widest text-white/50">Graphics</div>
            <div className="flex gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  title={p.note}
                  onClick={() => setSettings({ preset: p.id })}
                  className={`rounded px-3 py-1.5 text-sm ${settings.preset === p.id ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs uppercase tracking-widest text-white/50">Livery</div>
            <input
              type="color"
              value={settings.livery}
              onChange={(e) => setSettings({ livery: e.target.value })}
              className="h-8 w-14 cursor-pointer rounded bg-transparent"
            />
          </div>
          <div className="ml-auto flex gap-2">
            <button
              className="rounded border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
              onClick={() => setShowRebind(true)}
            >
              Controls
            </button>
            <button
              className="rounded bg-gx-accent px-6 py-2 text-sm font-bold tracking-wider hover:brightness-110"
              onClick={() => setScreen('drive')}
            >
              START
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs text-white/60">
          <div className="rounded border border-white/10 p-3">
            <div className="mb-1 font-semibold text-white/80">Keyboard</div>
            W/↑ throttle · S/↓ brake · A D/← → steer
            <br />
            Shift/E up · Ctrl/Q down · Space DRS test
            <br />[ ] brake bias · X ERS · C camera · Z/V look
            <br />R reset · Esc pause · F3 debug
          </div>
          <div className="rounded border border-white/10 p-3">
            <div className="mb-1 font-semibold text-white/80">Gamepad (Xbox / PS)</div>
            LS steer · RT throttle · LT brake
            <br />
            RB/A up · LB/X down · B DRS · Y camera
            <br />
            D-pad ↑↓ bias · ←→ look · R3 ERS
            <br />
            View/Share reset · Menu/Options pause
          </div>
          <div className="rounded border border-white/10 p-3">
            <div className="mb-1 font-semibold text-white/80">Wheels</div>
            Any wheel exposed as a gamepad works. Map the steering and pedal axes under Controls.
            Same input processing and max steering rate for every device (SPEC §8).
          </div>
        </div>
      </div>
    </div>
  );
}
