import { useEffect, useRef } from 'react';
import { DriveSession } from '../game/session';
import { inputManager } from '../input/instance';
import { useApp } from '../store';
import { DebugOverlay } from './DebugOverlay';
import { Hud } from './Hud';

export function DriveView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<DriveSession | null>(null);
  const {
    settings,
    hud,
    paused,
    showDebug,
    setHud,
    setPaused,
    toggleDebug,
    setScreen,
    setShowRebind,
  } = useApp();

  useEffect(() => {
    const canvas = canvasRef.current!;
    const s = new DriveSession(
      canvas,
      settings.trackId,
      settings.preset,
      settings.livery,
      inputManager,
      setHud,
    );
    sessionRef.current = s;
    if (import.meta.env.DEV)
      (window as unknown as { __gx: unknown }).__gx = { session: s, input: inputManager };
    const onResize = () => s.resize(canvas.clientWidth, canvas.clientHeight);
    onResize();
    window.addEventListener('resize', onResize);
    inputManager.onUiAction = (a) => {
      const st = useApp.getState();
      if (a === 'camera') s.cycleCamera();
      if (a === 'debug') st.toggleDebug();
      if (a === 'reset') s.reset();
      if (a === 'pause') {
        if (st.showRebind) return;
        st.setPaused(!st.paused);
      }
    };
    s.start();
    return () => {
      inputManager.onUiAction = null;
      window.removeEventListener('resize', onResize);
      s.stop();
      sessionRef.current = null;
    };
    // session is rebuilt only when the screen mounts (settings are read once)
  }, []);

  useEffect(() => {
    if (sessionRef.current) sessionRef.current.paused = paused;
  }, [paused]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" />
      {hud && <Hud h={hud} />}
      {hud && showDebug && <DebugOverlay h={hud} />}
      {paused && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-72 rounded-xl border border-white/15 bg-gx-panel p-5 text-center">
            <div className="mb-4 text-xl font-bold tracking-widest">PAUSED</div>
            <div className="flex flex-col gap-2">
              <button
                className="rounded bg-gx-accent py-2 font-semibold"
                onClick={() => setPaused(false)}
              >
                Resume
              </button>
              <button
                className="rounded border border-white/20 py-2"
                onClick={() => {
                  sessionRef.current?.reset();
                  setPaused(false);
                }}
              >
                Reset to track
              </button>
              <button
                className="rounded border border-white/20 py-2"
                onClick={() => setShowRebind(true)}
              >
                Controls
              </button>
              <button className="rounded border border-white/20 py-2" onClick={toggleDebug}>
                Debug overlay {showDebug ? 'off' : 'on'}
              </button>
              <button
                className="rounded border border-white/20 py-2"
                onClick={() => setScreen('start')}
              >
                Quit to start screen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
