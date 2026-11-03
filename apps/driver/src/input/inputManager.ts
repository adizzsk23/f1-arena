import type { InputDevice, RawInputFrame } from '@gx/core';
import { neutralInput } from '@gx/core';
import type { AxisBinding, Bindings, DigitalAction, PadBinding } from './bindings';

const EDGE_ACTIONS: DigitalAction[] = [
  'gearUp',
  'gearDown',
  'ers',
  'biasUp',
  'biasDown',
  'camera',
  'reset',
  'pause',
  'debug',
];
const WHEEL_ID =
  /wheel|g2[79]|g9[23]|g920|g923|logitech.*(driving|racing)|thrustmaster|fanatec|moza|simagic|t300|t150|tmx/i;
/** Analog activity threshold that makes the pad the active device. */
const PAD_ACTIVE = 0.15;

/**
 * Collects keyboard + Gamepad API state and produces one RawInputFrame per sim step.
 * Edge events (gear shifts etc.) are latched until consumed, so no press is lost between
 * render frames and sim steps. The frame carries raw device-category values; all SPEC §8
 * processing happens in gx-core.
 */
export class InputManager {
  private keysDown = new Set<string>();
  private pendingEdges = new Set<DigitalAction>();
  private padPrev = new Map<DigitalAction, boolean>();
  private active: 'keyboard' | 'pad' = 'keyboard';
  private padState = { throttle: 0, brake: 0, steer: 0, held: new Set<DigitalAction>() };
  padId = '';
  /** Fires for UI-level edges (camera, pause, debug, reset) right when they happen. */
  onUiAction: ((a: DigitalAction) => void) | null = null;
  /** When set, the next key/button/axis is reported here instead of being acted on. */
  capture: ((ev: { key?: string; pad?: PadBinding }) => void) | null = null;
  private axisBaseline: number[] | null = null;

  constructor(public bindings: Bindings) {}

  attach(): () => void {
    const down = (e: KeyboardEvent) => {
      if (this.capture) {
        e.preventDefault();
        this.capture({ key: e.code });
        return;
      }
      if (this.isBound(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keysDown.add(e.code);
      this.active = 'keyboard';
      for (const a of EDGE_ACTIONS) if (this.bindings.keys[a].includes(e.code)) this.edge(a);
    };
    const up = (e: KeyboardEvent) => this.keysDown.delete(e.code);
    const blur = () => this.keysDown.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }

  private isBound(code: string): boolean {
    return Object.values(this.bindings.keys).some((l) => l.includes(code));
  }

  private edge(a: DigitalAction): void {
    if (a === 'camera' || a === 'pause' || a === 'debug' || a === 'reset') this.onUiAction?.(a);
    else this.pendingEdges.add(a);
  }

  /** Poll gamepads once per render frame. */
  pollPads(): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p) => p && p.connected) ?? null;
    if (!pad) {
      this.padId = '';
      return;
    }
    this.padId = pad.id;
    if (this.capture) {
      this.capturePad(pad);
      return;
    }
    const b = this.bindings;
    const read = (bd: PadBinding): number => {
      if (bd.kind === 'button') return pad.buttons[bd.index]?.value ?? 0;
      const v = pad.axes[bd.index] ?? bd.rest;
      const span = bd.full - bd.rest;
      return span === 0 ? 0 : Math.max(0, Math.min(1, (v - bd.rest) / span));
    };
    const steerAxis = pad.axes[b.padSteer.index] ?? 0;
    const steerSpan = b.padSteer.full - b.padSteer.rest || 1;
    this.padState.steer = Math.max(-1, Math.min(1, (steerAxis - b.padSteer.rest) / steerSpan));
    this.padState.throttle = read(b.padThrottle);
    this.padState.brake = read(b.padBrake);
    const held = new Set<DigitalAction>();
    for (const [action, list] of Object.entries(b.pad) as [DigitalAction, PadBinding[]][]) {
      const on = list.some((bd) => read(bd) > 0.5);
      if (on) held.add(action);
      if (on && !this.padPrev.get(action) && EDGE_ACTIONS.includes(action)) {
        this.edge(action);
        this.active = 'pad';
      }
      this.padPrev.set(action, on);
    }
    this.padState.held = held;
    if (
      this.padState.throttle > PAD_ACTIVE ||
      this.padState.brake > PAD_ACTIVE ||
      Math.abs(this.padState.steer) > PAD_ACTIVE * 2
    ) {
      this.active = 'pad';
    }
  }

  private capturePad(pad: Gamepad): void {
    for (let i = 0; i < pad.buttons.length; i++) {
      if ((pad.buttons[i]?.value ?? 0) > 0.6) {
        this.capture?.({ pad: { kind: 'button', index: i } });
        this.axisBaseline = null;
        return;
      }
    }
    if (!this.axisBaseline) {
      this.axisBaseline = [...pad.axes];
      return;
    }
    for (let i = 0; i < pad.axes.length; i++) {
      const v = pad.axes[i] ?? 0;
      const base = this.axisBaseline[i] ?? 0;
      if (Math.abs(v - base) > 0.6) {
        // rest = where the axis sat when capture began; full = the end-stop it moved toward
        const ax: AxisBinding = {
          kind: 'axis',
          index: i,
          rest: Math.round(base * 10) / 10,
          full: v > base ? 1 : -1,
        };
        this.capture?.({ pad: ax });
        this.axisBaseline = null;
        return;
      }
    }
  }

  beginCapture(cb: (ev: { key?: string; pad?: PadBinding }) => void): void {
    this.axisBaseline = null;
    this.capture = cb;
  }
  endCapture(): void {
    this.capture = null;
    this.axisBaseline = null;
  }

  private key(a: DigitalAction): boolean {
    return this.bindings.keys[a].some((k) => this.keysDown.has(k));
  }

  get activeDevice(): InputDevice {
    if (this.active === 'keyboard') return 'keyboard';
    const pref = this.bindings.analogDevice;
    if (pref === 'gamepad' || pref === 'wheel') return pref;
    return WHEEL_ID.test(this.padId) ? 'wheel' : 'gamepad';
  }

  /** Look direction −1/0/+1 for the camera. */
  look(): number {
    const l = this.key('lookLeft') || this.padState.held.has('lookLeft');
    const r = this.key('lookRight') || this.padState.held.has('lookRight');
    return (r ? 1 : 0) - (l ? 1 : 0);
  }

  /** Build the frame for the next sim step and consume latched edges. */
  consume(): RawInputFrame {
    const dev = this.activeDevice;
    const f = neutralInput(dev);
    if (dev === 'keyboard') {
      f.throttle = this.key('throttle') ? 1 : 0;
      f.brake = this.key('brake') ? 1 : 0;
      f.steer = (this.key('steerRight') ? 1 : 0) - (this.key('steerLeft') ? 1 : 0);
    } else {
      f.throttle = this.padState.throttle;
      f.brake = this.padState.brake;
      f.steer = this.padState.steer;
    }
    f.drs = this.key('drs') || this.padState.held.has('drs');
    const e = this.pendingEdges;
    f.gearUp = e.has('gearUp');
    f.gearDown = e.has('gearDown');
    f.ersToggle = e.has('ers');
    f.biasUp = e.has('biasUp');
    f.biasDown = e.has('biasDown');
    e.clear();
    return f;
  }
}
