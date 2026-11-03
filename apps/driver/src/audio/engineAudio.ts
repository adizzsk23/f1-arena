/**
 * Engine audio (Web Audio): three procedurally generated loops (idle / mid / high rpm),
 * crossfaded by rpm and pitch-shifted via playbackRate; plus tyre squeal from filtered
 * noise gated by combined slip. All sounds are synthesised in code (self-made, see
 * assets/CREDITS.md) — team OGG samples (SPEC Art. 11) plug into `loadSamples` later.
 */
const SAMPLE_RPMS = [4000, 9000, 13500];
/** V6 four-stroke: firing frequency = rpm/60 · 3. */
const firingHz = (rpm: number) => (rpm / 60) * 3;

function synthLoop(ctx: BaseAudioContext, rpm: number, gritty: number): AudioBuffer {
  const f0 = firingHz(rpm);
  const cycles = Math.max(40, Math.round(f0 * 1.0)); // ~1 s loop, integer cycles → seamless
  const dur = cycles / f0;
  const n = Math.round(dur * ctx.sampleRate);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 12345 + rpm;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
  const harmonics = [1, 0.55, 0.42, 0.3, 0.22, 0.16, 0.1, 0.07];
  for (let i = 0; i < n; i++) {
    const ph = (i / n) * cycles * 2 * Math.PI;
    let v = 0;
    harmonics.forEach((a, k) => {
      v += a * Math.sin(ph * (k + 1) + k * 0.7);
    });
    // half-order rumble + combustion grit
    v += 0.35 * Math.sin(ph * 0.5);
    v += gritty * rnd() * (0.6 + 0.4 * Math.sin(ph));
    d[i] = v * 0.18;
  }
  // tiny fade at the seam
  for (let i = 0; i < 64; i++) {
    const g = i / 64;
    d[i]! *= g;
    d[n - 1 - i]! *= g;
  }
  return buf;
}

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const n = ctx.sampleRate;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 99;
  for (let i = 0; i < n; i++)
    d[i] = ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  return buf;
}

export interface AudioFrame {
  rpm: number;
  throttle: number;
  /** Max combined slip across tyres (1 = at peak). */
  slip: number;
  speedMps: number;
  paused: boolean;
}

export class EngineAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private layers: { src: AudioBufferSourceNode; gain: GainNode; rpm: number }[] = [];
  private filter: BiquadFilterNode;
  private squealGain: GainNode;
  private squealFilter: BiquadFilterNode;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 3000;
    this.filter.connect(this.master);
    SAMPLE_RPMS.forEach((rpm, i) => {
      const src = this.ctx.createBufferSource();
      src.buffer = synthLoop(this.ctx, rpm, 0.08 + i * 0.06);
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.filter);
      src.start();
      this.layers.push({ src, gain, rpm });
    });
    const sq = this.ctx.createBufferSource();
    sq.buffer = noiseBuffer(this.ctx);
    sq.loop = true;
    this.squealFilter = this.ctx.createBiquadFilter();
    this.squealFilter.type = 'bandpass';
    this.squealFilter.frequency.value = 1400;
    this.squealFilter.Q.value = 6;
    this.squealGain = this.ctx.createGain();
    this.squealGain.gain.value = 0;
    sq.connect(this.squealFilter).connect(this.squealGain).connect(this.master);
    sq.start();
  }

  resume(): void {
    void this.ctx.resume();
  }

  update(f: AudioFrame): void {
    const t = this.ctx.currentTime;
    const rpm = Math.max(3000, f.rpm);
    // crossfade weights: triangular in log-rpm between neighbouring samples
    const lr = Math.log(rpm);
    const ls = SAMPLE_RPMS.map((r) => Math.log(r));
    this.layers.forEach((L, i) => {
      let w = 0;
      const prev = ls[i - 1];
      const next = ls[i + 1];
      const c = ls[i]!;
      if (lr <= c) w = prev === undefined ? 1 : Math.max(0, (lr - prev) / (c - prev));
      else w = next === undefined ? 1 : Math.max(0, (next - lr) / (next - c));
      const vol = f.paused ? 0 : w * (0.45 + 0.55 * f.throttle);
      L.gain.gain.setTargetAtTime(vol, t, 0.03);
      L.src.playbackRate.setTargetAtTime(rpm / L.rpm, t, 0.02);
    });
    this.filter.frequency.setTargetAtTime(900 + 4200 * f.throttle, t, 0.05);
    const sq =
      f.paused || f.speedMps < 3 ? 0 : Math.max(0, Math.min(1, (f.slip - 1.0) * 1.5)) * 0.35;
    this.squealGain.gain.setTargetAtTime(sq, t, 0.04);
    this.squealFilter.frequency.setTargetAtTime(1100 + Math.min(f.speedMps, 60) * 12, t, 0.1);
  }

  dispose(): void {
    void this.ctx.close();
  }
}
