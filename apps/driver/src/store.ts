import { create } from 'zustand';
import type { BuiltinTrackId } from '@gx/track';
import type { CameraMode, GraphicsPreset } from '@gx/render';

export interface WheelHud {
  fz: number;
  slipRatio: number;
  slipAngleDeg: number;
  mu: number;
  combined: number;
  locked: boolean;
}

/** Snapshot pushed to React ~20×/s (the 3D loop never waits on React). */
export interface HudData {
  speedKph: number;
  gear: number;
  rpm: number;
  ersPct: number;
  ersOn: boolean;
  ersDeployKw: number;
  ersHarvestKw: number;
  brakeBiasPct: number;
  drs: boolean;
  lapTime: number;
  lastLap: number;
  bestLap: number;
  sector: number;
  currentSectors: number[];
  lastSectors: number[];
  bestSectors: number[];
  lapsCompleted: number;
  lapStarted: boolean;
  gLong: number;
  gLat: number;
  throttle: number;
  brake: number;
  steer: number;
  device: string;
  camera: CameraMode;
  wheels: WheelHud[];
  downforceN: number;
  dragN: number;
  powerKw: number;
  fps: number;
  simStepMs: number;
  wheelsOff: number;
  padId: string;
}

export type Screen = 'start' | 'drive';

interface Settings {
  trackId: BuiltinTrackId;
  preset: GraphicsPreset;
  livery: string;
}

interface AppState {
  screen: Screen;
  settings: Settings;
  paused: boolean;
  showDebug: boolean;
  showRebind: boolean;
  hud: HudData | null;
  setScreen(s: Screen): void;
  setSettings(p: Partial<Settings>): void;
  setPaused(p: boolean): void;
  toggleDebug(): void;
  setShowRebind(v: boolean): void;
  setHud(h: HudData): void;
}

const SETTINGS_KEY = 'gx.driver.settings.v1';
function loadSettings(): Settings {
  const def: Settings = { trackId: 'tt1', preset: 'med', livery: '#2f6bff' };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...def, ...(JSON.parse(raw) as Partial<Settings>) } : def;
  } catch {
    return def;
  }
}

export const useApp = create<AppState>((set, get) => ({
  screen: 'start',
  settings: loadSettings(),
  paused: false,
  showDebug: false,
  showRebind: false,
  hud: null,
  setScreen: (screen) => set({ screen, paused: false }),
  setSettings: (p) => {
    const settings = { ...get().settings, ...p };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
    set({ settings });
  },
  setPaused: (paused) => set({ paused }),
  toggleDebug: () => set({ showDebug: !get().showDebug }),
  setShowRebind: (showRebind) => set({ showRebind }),
  setHud: (hud) => set({ hud }),
}));
