/**
 * Input bindings (SPEC §8 list): throttle, brake, steer, gear up/down, DRS, ERS, brake bias ±,
 * camera cycle, look left/right (+ reset, pause, debug). Persisted per browser.
 */
export type DigitalAction =
  | 'throttle'
  | 'brake'
  | 'steerLeft'
  | 'steerRight'
  | 'gearUp'
  | 'gearDown'
  | 'drs'
  | 'ers'
  | 'biasUp'
  | 'biasDown'
  | 'camera'
  | 'lookLeft'
  | 'lookRight'
  | 'reset'
  | 'pause'
  | 'debug';

export const DIGITAL_ACTIONS: { id: DigitalAction; label: string }[] = [
  { id: 'throttle', label: 'Throttle' },
  { id: 'brake', label: 'Brake' },
  { id: 'steerLeft', label: 'Steer left' },
  { id: 'steerRight', label: 'Steer right' },
  { id: 'gearUp', label: 'Gear up' },
  { id: 'gearDown', label: 'Gear down' },
  { id: 'drs', label: 'DRS (test)' },
  { id: 'ers', label: 'ERS deploy on/off' },
  { id: 'biasUp', label: 'Brake bias +' },
  { id: 'biasDown', label: 'Brake bias −' },
  { id: 'camera', label: 'Camera cycle' },
  { id: 'lookLeft', label: 'Look left' },
  { id: 'lookRight', label: 'Look right' },
  { id: 'reset', label: 'Reset to track' },
  { id: 'pause', label: 'Pause' },
  { id: 'debug', label: 'Debug overlay' },
];

/** Analog axis binding: value mapped linearly from `rest` → `full` to 0..1 (or −1..1 for steer). */
export interface AxisBinding {
  kind: 'axis';
  index: number;
  rest: number;
  full: number;
}
export interface ButtonBinding {
  kind: 'button';
  index: number;
}
export type PadBinding = AxisBinding | ButtonBinding;

export interface Bindings {
  keys: Record<DigitalAction, string[]>;
  pad: Partial<Record<DigitalAction, PadBinding[]>>;
  /** Steering axis: rest = centre, full = full right. */
  padSteer: AxisBinding;
  /** Pedals (triggers report as analog buttons on standard-mapping pads). */
  padThrottle: PadBinding;
  padBrake: PadBinding;
  /** How analog devices are categorised for input processing (SPEC §8). */
  analogDevice: 'auto' | 'gamepad' | 'wheel';
}

export const DEFAULT_BINDINGS: Bindings = {
  keys: {
    throttle: ['KeyW', 'ArrowUp'],
    brake: ['KeyS', 'ArrowDown'],
    steerLeft: ['KeyA', 'ArrowLeft'],
    steerRight: ['KeyD', 'ArrowRight'],
    gearUp: ['ShiftLeft', 'KeyE'],
    gearDown: ['ControlLeft', 'KeyQ'],
    drs: ['Space'],
    ers: ['KeyX'],
    biasUp: ['BracketRight'],
    biasDown: ['BracketLeft'],
    camera: ['KeyC'],
    lookLeft: ['KeyZ'],
    lookRight: ['KeyV'],
    reset: ['KeyR'],
    pause: ['Escape', 'KeyP'],
    debug: ['F3'],
  },
  // Xbox / PlayStation "standard" Gamepad API layout
  pad: {
    gearUp: [
      { kind: 'button', index: 5 },
      { kind: 'button', index: 0 },
    ],
    gearDown: [
      { kind: 'button', index: 4 },
      { kind: 'button', index: 2 },
    ],
    camera: [{ kind: 'button', index: 3 }],
    drs: [{ kind: 'button', index: 1 }],
    ers: [{ kind: 'button', index: 11 }],
    biasUp: [{ kind: 'button', index: 12 }],
    biasDown: [{ kind: 'button', index: 13 }],
    lookLeft: [{ kind: 'button', index: 14 }],
    lookRight: [{ kind: 'button', index: 15 }],
    reset: [{ kind: 'button', index: 8 }],
    pause: [{ kind: 'button', index: 9 }],
  },
  padSteer: { kind: 'axis', index: 0, rest: 0, full: 1 },
  padThrottle: { kind: 'button', index: 7 },
  padBrake: { kind: 'button', index: 6 },
  analogDevice: 'auto',
};

const STORAGE_KEY = 'gx.driver.bindings.v1';

export function loadBindings(): Bindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_BINDINGS);
    const b = JSON.parse(raw) as Partial<Bindings>;
    return {
      ...structuredClone(DEFAULT_BINDINGS),
      ...b,
      keys: { ...DEFAULT_BINDINGS.keys, ...(b.keys ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_BINDINGS);
  }
}

export function saveBindings(b: Bindings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    /* storage unavailable — bindings stay for this session only */
  }
}

export function describePad(b: PadBinding | undefined): string {
  if (!b) return '—';
  return b.kind === 'button'
    ? `Btn ${b.index}`
    : `Axis ${b.index} (${b.rest.toFixed(1)}→${b.full.toFixed(1)})`;
}

export function describeKey(code: string): string {
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('Left', ' L')
    .replace('Right', ' R')
    .replace('Bracket', '')
    .replace('Control', 'Ctrl');
}
