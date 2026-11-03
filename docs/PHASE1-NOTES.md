# InovX Grand Prix — Phase 1 Complete Notes

> Reference document for everything built, measured and decided in Phase 1.
> Completed 2026-11-04. Status tracker: `docs/PROGRESS.md`. Master spec: `SPEC.md` (unchanged).

---

## 1. What Phase 1 delivered

A single-player browser build where one car can be driven around two tracks with keyboard, gamepad or wheel, plus a headless physics harness that checks the SPEC §4 envelope.

| Deliverable | Where | State |
|---|---|---|
| pnpm monorepo, TS strict, ESLint + Prettier, Vitest | root | ✅ |
| Deterministic 120 Hz physics core | `packages/gx-core` | ✅ |
| Track format, geometry, timing, racing line | `packages/gx-track` | ✅ |
| TT-1 test track (3.21 km) | `packages/gx-track/tracks/tt1.json` | ✅ |
| INOVX International Circuit blockout (5.51 km, 16 turns, 3 sectors) | `packages/gx-track/tracks/inovx.json` | ✅ |
| Three.js renderer (track mesh, dusk lighting, car, cameras, branding) | `packages/gx-render` | ✅ |
| Driver client (start screen, HUD, debug, inputs, rebinding, audio) | `apps/driver` | ✅ |
| Headless harness (7 tests, report, exit code) | `tools/harness` | ✅ 25 rows, 0 FAIL |
| Owner logos (INOVX, Spektrum) on gantry, boards, stands, HUD, start screen | `assets/brand/` | ✅ |

Final check: `pnpm lint && pnpm typecheck && pnpm test && pnpm harness` all green in one run. `vite build` also succeeds.

---

## 2. How to run

```
pnpm install
pnpm dev:driver      # http://localhost:5173 (Vite moves to 5174 if 5173 is busy)
pnpm harness         # physics report; exit 1 on any FAIL; JSON in tools/harness/reports/latest.json
pnpm test            # Vitest unit tests (15)
pnpm lint            # ESLint, zero warnings allowed
pnpm typecheck       # tsc --noEmit for every package
pnpm trackgen        # regenerate track JSON from tools/harness/src/layouts.ts
pnpm build:driver    # production build of the driver client
```

Developer helpers (not part of the check chain), run with `npx tsx tools/harness/src/dev/<file>`:
- `plot.ts [tt1]` — ASCII plot of a track layout
- `walk.ts [tt1]` — turtle-walk positions per segment
- `brakeTrace.ts <kph>` — per-step braking trace (speed, decel, slip, loads)
- `skid.ts <kph> <ClA>` — skidpad trace

In dev builds the running session is exposed as `window.__gx` (`session`, `input`) for debugging.

### Controls

| Action | Keyboard | Gamepad (standard layout) |
|---|---|---|
| Throttle / brake | W / S (or ↑ / ↓) | RT / LT |
| Steer | A / D (or ← / →) | Left stick |
| Gear up / down | Shift or E / Ctrl or Q | RB or A / LB or X |
| DRS (test) | Space (hold) | B |
| ERS deploy on/off | X | R3 |
| Brake bias + / − | ] / [ | D-pad ↑ / ↓ |
| Camera cycle (cockpit → chase → T-cam) | C | Y |
| Look left / right | Z / V | D-pad ← / → |
| Reset to track | R | View / Share |
| Pause | Esc or P | Menu / Options |
| Debug overlay | F3 | — |

Everything is rebindable on the **Controls** screen (keys, pad buttons, analog axes for wheels/pedals). Bindings and settings persist in the browser's localStorage. Gears are manual.

---

## 3. Repository layout

```
packages/gx-core/        PURE TS — no DOM / Three / Node
  src/config/regulations.ts   SPEC numbers (do not change without approval)
  src/config/physics.ts       chassis, wheels, steering, integrator (tuning)
  src/config/tyres.ts         Medium tyre + Soft/Hard placeholders
  src/config/powertrain.ts    torque curve, gears, clutch, ERS, brakes
  src/config/input.ts         SPEC §8 ramps, deadzones, rates
  src/carSpec.ts              CarSpec type + standard build + CdA formula
  src/vehicle/tyre.ts         combined-slip tyre, TyreState (Phase 2 hook)
  src/vehicle/powerunit.ts    ICE torque, limiter, engine braking, peak-power check
  src/vehicle/vehicle.ts      chassis + wheel + drivetrain + brakes + aero step
  src/vehicle/walls.ts        analytic car↔wall impulses
  src/input/index.ts          SPEC §8 input processing (client + server)
  src/sim.ts                  createSim / step / getState / snapshot / restore / hash
  src/prng.ts  hash.ts  math.ts  units.ts
packages/gx-track/       PURE TS
  src/schema.ts   Zod track JSON schema (DRS / pit / limits fields defined, unused yet)
  src/model.ts    centripetal Catmull-Rom → arc-length resampled TrackModel
  src/query.ts    closest point / progress / lateral offset / off-track check
  src/timing.ts   lap + sector timer with sub-step interpolation
  src/racingLine.ts  elastic-band minimum-curvature racing line
  src/layout.ts   turtle layout builder with loop-closure solver
  src/tracks.ts   built-in tracks loader
  tracks/tt1.json, tracks/inovx.json   generated files
packages/gx-render/      Three.js
  src/world.ts     scene, sky, lights, post-fx, render()
  src/trackMesh.ts asphalt, lines, kerbs, walls, grass, gantry, boards, stands, floodlights
  src/carMesh.ts   primitive F1 car (steering + spinning wheels, livery colour)
  src/cameras.ts   cockpit / chase / T-cam rig + look left/right
  src/brand.ts     logo loading (auto-trim), logo board textures, gantry banner
  src/presets.ts   Low / Med / High
apps/driver/             React + Tailwind + Zustand
  src/game/session.ts    120 Hz accumulator, interpolation, audio + HUD feed
  src/input/             bindings, InputManager (keyboard + Gamepad API)
  src/audio/engineAudio.ts  synthesised engine loops + tyre squeal
  src/ui/                StartScreen, DriveView, Hud, DebugOverlay, Rebind
  src/brand.tsx          logo imports + BrandLockup component
  src/store.ts           Zustand app state
tools/harness/           Node harness
  src/main.ts   report + pass/fail      src/tests.ts  the 7 tests
  src/bot.ts    pure-pursuit bot + speed profile + pedal skill
  src/layouts.ts  TT-1 and INOVX turtle layouts     src/trackgen.ts  writes track JSON
assets/brand/            inovx-logo.png, spektrum-logo.png (owner supplied)
docs/                    PROGRESS.md, PHASE1-NOTES.md (this), CHANGELOG-SPEC.md
```

ESLint enforces the purity rules for `gx-core` and `gx-track`: no `Math.random`, no `window`/`document`/`performance`/`process`, no imports of three/react/node.

---

## 4. Physics model (gx-core)

### Simulation loop
- Fixed external step **120 Hz** (`SIM_DT_S = 1/120`). Inside each step the vehicle integrates **4 sub-steps** (480 Hz) because the tyre/wheel dynamics are stiff.
- Per step: process inputs (SPEC §8) → handle shift/bias/ERS events → 4 × (vehicle sub-step + wall contact) → track projection → lap/sector timing → off-track wheel count.
- Rendering interpolates between the last two physics states; physics never depends on frame rate.
- All state is plain serialisable data (`SimState`): `snapshot()` / `restore()` round-trip exactly; `hash()` is FNV-1a over every field's IEEE-754 bits.
- No randomness in Phase 1 physics. A seeded sfc32 PRNG lives in the state for later phases.

### Chassis — planar 3-DOF rigid body (body frame: x forward, y left)
```
m (v̇x − r·vy) = ΣFx        m (v̇y + r·vx) = ΣFy        Iz ṙ = ΣMz
```
Semi-implicit Euler. Mass = 815 kg build + 30 kg fuel = 845 kg; Iz = 1150 kg·m²; wheelbase 3.5 m; track 1.6 m; CoG height 0.26 m; front weight 44.5 %.

### Vertical loads (per wheel)
```
static:        W·wf/2 (front), W·(1−wf)/2 (rear)
aero:          downforce split by aero balance (42 % front), /2 per wheel
longitudinal:  ΔFz = m·ax·h / L     (front −, rear +)
lateral:       ΔFz = m·ay·h / t, split 55 % front / 45 % rear (roll stiffness)
```
Accelerations are low-pass filtered (τ = 45 ms) to stand in for pitch/roll compliance. Loads are clamped at 0 (wheel lift).

### Tyre — normalised combined slip (Pacejka shape, friction ellipse)
```
κ = (ω·R − vx_wheel) / max(|vx_wheel|, 3 m/s)       tanα = vy_wheel / max(|vx_wheel|, 2 m/s)
sx = κ / κpk,  sy = tanα / tan(αpk),  s = √(sx² + sy²)
f(s) = sin(C·atan(B·s)),  B = tan(π / 2C)            (peak exactly at s = 1)
Fx = μx(Fz)·Fz·f(s)·sx/s,   Fy = −μy(Fz)·Fz·f(s)·sy/s
μ(Fz) = μ0 · (1 − kLoad·(Fz − Fz0)/Fz0)               (μ falls as load rises)
```
Medium: μx0 = 1.80, μy0 = 1.80, Fz0 = 4000 N, kLoad = 0.04, κpk = 0.10, αpk = 0.10 rad, C = 1.4 (sliding ≈ 81–85 % of peak). `TyreState` (surface/carcass temp, wear, flat-spot) exists and feeds `tyreGripFactor()`, which returns 1 until Phase 2.

### Wheels and drivetrain
- Wheel spin: `Iw·ω̇ = T_drive − Fx·R − T_friction`, solved **semi-implicitly** using the tyre force slope dFx/dω (finite difference), so it stays stable at low speed.
- Rear axle is solved as a **2×2 linear system**: viscous LSD (60 N·m per rad/s) plus reflected engine inertia `J = Ie·G²/4`.
- Brakes and rolling resistance are **Coulomb friction torques**: if they can stop the wheel this sub-step, it locks (ω = 0); otherwise they oppose rotation. This is what makes lock-ups real.
- Tyre radius 0.36 m, wheel inertia 1.0 (front) / 1.3 kg·m² (rear), rolling resistance Crr = 0.011.

### Aerodynamics (SPEC Art. 4–5)
```
Downforce = ½ρ·ClA·v²        Drag = ½ρ·CdA·v²        ρ = 1.2
CdA = 0.60 + k·ClA² + radiatorDrag,  k = 0.040,  radiatorDrag = 0.03 × size
Standard build: ClA 4.0, radiator 3 → CdA = 0.60 + 0.64 + 0.09 = 1.33 m²
DRS test: drag × 0.85, rear downforce × 0.90
```

### Power unit and transmission (SPEC Art. 2, 8)
- 6-point torque curve (rpm → N·m): 4000→180, 7000→255, 9500→292, 11500→296, 13000→262, 15000→216. Peak ≈ 358 kW (a unit test asserts ≤ 360 kW across the interpolated curve).
- 15 000 rpm limiter: fuel cut fades over the last 150 rpm.
- Engine braking off-throttle: `T = −(10 + 0.0045·rpm)` N·m at the crank.
- 8-speed sequential + reverse. Ratios 4.10 / 3.50 / 2.98 / 2.55 / 2.18 / 1.87 / 1.60 / 1.36, final drive 4.5. 1st tops out ≈ 110 km/h; 8th reaches the limiter ≈ 333 km/h.
- Shift = 50 ms torque cut. Downshifts that would exceed 15 200 rpm are refused.
- Drivetrain efficiency 0.92 applied to all torque through the gearbox.
- Auto-clutch: in 1st and reverse it holds the engine at up to 10 500 rpm with throttle (launch); in other gears it only prevents stalling at idle (4000 rpm).

### ERS (Phase 1 basic version)
- Deploys up to 120 kW × throttle through the MGU-K (crank torque ≤ 200 N·m) when enabled, the store isn't empty, speed > 5 m/s and no shift is in progress.
- 4 MJ store. Harvest under braking up to 120 kW, capped at 2 MJ per lap (counter resets at the line).
- Brake-by-wire: regen torque replaces part of the rear hydraulic torque, so brake balance doesn't change.

### Brakes (SPEC Art. 7)
- Total capacity 12 400 N·m at full pedal, split by bias (default 58 % front, adjustable 50–60 % in 0.5 % steps). No ABS.
- Brake-by-wire also subtracts engine-braking torque from the rear while the pedal is pressed.
- Above ~230 km/h peak decel is set by brake capacity (≈ 4.75 g at 300 km/h); below that it's grip-limited and wheels can lock.

### Steering and input processing (SPEC §8 — identical for all devices, client + server)
- Keyboard: throttle 0→1 in 0.20 s (release 0.10 s), brake 0→1 in 0.25 s (release 0.10 s). Steering rate 3.2 /s at rest falling to 1.4 /s above 40 m/s; returns to centre at 4.5 /s.
- Gamepad: stick deadzone 0.06 with rescale, steering curve exponent 1.5, trigger deadzone 0.03.
- Wheel: linear axes, trigger deadzone on pedals.
- All devices: universal max steering rate 6.0 /s (normalised).
- Speed-sensitive lock: `δmax = 5° + (24° − 5°) / (1 + (v / 25 m/s)²)`, with partial Ackermann (60 %).

### Walls (Phase 1)
Walls are offsets from the centerline. Eleven hull points (5.6 × 1.9 m hull) are checked each sub-step. A point past the wall gets pushed back out, plus an impulse with restitution 0.25 and Coulomb friction 0.45:
`jn = −(1+e)·vn / (1/m + (r×n)²/Iz)`. The car recovers and can keep driving. Rapier takes over car↔car in Phase 5.

---

## 5. Tracks (gx-track)

### Format
Catmull-Rom (centripetal) centerline control points with per-point `width`, `wallL/wallR`, `kerbL/kerbR`. Also: sector fractions, grid slots, corner names, and DRS / pit-lane / track-limits fields (defined in the schema, unused until Phase 3). Validated with Zod and resampled every ~2 m.

### Generation
Layouts are written as turtle segments (straights + constant-radius arcs) in `tools/harness/src/layouts.ts`. The builder checks the turns sum to ±360°, then solves two "adjustable" straights so the loop closes exactly. `pnpm trackgen` writes the JSON and prints length plus minimum wall-to-wall clearance (self-overlap check).

### TT-1 Test Track — 3.21 km, width 14 m, walls both sides
Main straight 1.12 km → T1 hairpin (R 19 m) → T2 fast sweeper (R 170 m) → T3–T4 chicane (R 35 m) → T5 medium 90° (R 45 m) → T6 final 130° (R 90 m) → straight. It's longer than "~2.5 km" because a ≥ 1.1 km straight plus that corner sequence and a return leg can't close in less than ~2.4 km.

### INOVX International Circuit — 5.51 km, counter-clockwise, 16 named turns
Fictional, Sepang × Silverstone character. Generated, then scaled uniformly ×0.85 (radii ≤ 28 m left unscaled).
- Pit straight → **T1–T2** wide double-apex right complex (18 m wide)
- **T3** fast left → **T4** Copse-style fast right
- **T5–T7** Maggots/Becketts-style esses → **T8** Chapel-style
- Hangar straight → **T9** Stowe-style medium corner → **T10**, **T11**
- **T12** onto the ~1 km **back straight** → **T13** tight hairpin (R 27 m)
- **T14–T15** slow complex → pit straight
- Sector lines at 28.5 % and 71.9 % of the lap (S1 / S2 / S3 ≈ 27.6 / 38.1 / 30.6 s on the bot lap)
- No pit lane, DRS zones or track-limit logic yet (Phase 3).

### Helpers
Closest-point projection (windowed search with a global fallback), signed lateral offset, "outside the white line" check, lap and sector timing with crossing times interpolated inside the step, and an elastic-band minimum-curvature racing line.

---

## 6. Renderer and driver client

- **Scene:** gradient dusk sky dome (deep blue → warm horizon), hemisphere light, low warm sun, overhead "floodlight" key light, fog. Floodlight towers with emissive heads (bloom on Med/High).
- **Track mesh:** asphalt (procedural noise texture), white edge lines, red/white kerbs on corners, grass run-off, navy barrier walls with panels, chequered start line, grid boxes, 3 grandstands, start gantry with 5 (unlit) start lights.
- **Car:** built from primitives — monocoque, nose, front/rear wings with endplates, sidepods, engine cover, airbox, halo, helmet, diffuser, suspension arms; four wheels that steer and spin with a yellow Medium band. Livery colour is picked on the start screen.
- **Cameras:** Cockpit (helmet eye, halo pillar in view, head sways with g-forces), Chase (critically damped spring follow), T-cam (above the airbox). Look left/right works in all three.
- **Presets:**
  - Low: pixel ratio 1, no post-fx, Lambert materials, fewer boards
  - Med: pixel ratio 1.25, bloom
  - High: pixel ratio 2, bloom + SMAA, shadows following the car
- **HUD:** speed, gear, rpm, 15 shift lights (green/red/violet, flashing at the limiter), lap time, sector splits (purple = best), last/best lap, ERS %, deploy state, brake bias, DRS, camera mode, g-meter, throttle/brake/steer bars with active device, INOVX × Spektrum corner bug.
- **Debug overlay (F3):** per-wheel load, slip ratio, slip angle, μ peak, combined slip (yellow over the limit, red when locked); downforce, drag, power at the wheels, g, ERS in/out, wheels off track, fps, sim step time, connected pad id.
- **Audio:** three synthesised V6-style loops (4000 / 9000 / 13 500 rpm), crossfaded in log-rpm and pitch-shifted, with a throttle-driven low-pass filter. Tyre squeal from band-passed noise above the grip peak. Team OGG samples plug in from Phase 4.
- **Menus:** start screen (track, graphics preset, livery, Controls, START), pause menu (resume, reset, controls, debug, quit), Controls/rebinding screen.

---

## 7. Branding (owner logos added after the first report)

- Source files in the project root were copied to `assets/brand/inovx-logo.png` (1080 × 1080 RGBA) and `assets/brand/spektrum-logo.png` (3240 × 1080 RGBA, transparent). The originals were left where they were.
- `gx-render/src/brand.ts` loads each logo and **auto-trims** transparent and near-white margins. INOVX's white background is knocked out so the logo sits cleanly on any panel.
- Colour rule:
  - **INOVX** (navy / black / red letters) → light panels (#f4f6fb, red accent strip), dimmed slightly so they don't bloom.
  - **Spektrum** (lime) → dark navy panels (#0a0f24, lime accent strip).
- Where the logos appear:
  - Start gantry banner: INOVX on a light chip · "InovX Grand Prix" · Spektrum
  - Alternating wall boards around the whole lap
  - Grandstand roof signs
  - HUD corner bug
  - Start-screen header lockup ("INOVX × SPEKTRUM — PRESENT")
- If a logo fails to load, the clean text placeholder is shown instead; no invented logos.
- Logos are not drawn on the car.

---

## 8. Harness — final results

Standard build: ClA 4.0, 42 % front aero balance, radiator 3, mid gearing, Medium tyre, 30 kg fuel.
"~" targets get ±5 % on their edges; the lap-time target is strict.

| Test | Measured | Target | Result |
|---|---|---|---|
| Top speed ClA 3.0, ERS on (3 km) | 310.5 km/h | ~280–330 | PASS |
| Top speed ClA 3.0, ERS off | 283.2 km/h | info | INFO |
| Top speed ClA 4.0, ERS on | 288.6 km/h | ~280–330 | PASS |
| Top speed ClA 4.0, ERS off | 260.3 km/h | info | INFO |
| Top speed ClA 5.0, ERS on | 265.1 km/h | ~280–330 | SPEC-LIMITED (see §10) |
| Top speed ClA 5.0, ERS off | 241.9 km/h | info | INFO |
| 0–100 km/h | 2.52 s | ~2.6 s | PASS |
| 0–200 km/h | 6.05 s | no SPEC target | INFO |
| Braking 300→80 km/h, peak | 4.76 g | ~4.5–5 g | PASS |
| Braking 300→80, distance / average | 102.8 m / 2.96 g | info | INFO |
| Braking 200→0, distance / peak / average | 66.4 m / 3.37 g / 2.17 g | info | INFO |
| Low-speed braking (100→80 km/h band) | 2.10 g | ~2–2.5 g | PASS |
| Braking 80→0, distance / average | 14.5 m / 1.76 g | info | INFO |
| Skidpad 80 km/h, ClA 3 / 4 / 5 | 1.92 / 1.97 / 2.03 g | ~1.7–2 g | PASS |
| Skidpad 150 km/h, ClA 3 / 4 / 5 | 2.44 / 2.65 / 2.86 g | info | INFO |
| Skidpad 250 km/h, ClA 4.0 | 4.16 g | ~4–4.5 g | PASS |
| Skidpad 250 km/h, ClA 3.0 / 5.0 | 3.60 / 4.73 g | range spans ~4–4.5 g | PASS |
| Bot lap TT-1 | 1:00.180 (52–281 km/h) | clean lap | PASS |
| Bot lap INOVX International Circuit | 1:36.38 | 1:30–1:38 | PASS |
| INOVX sectors | 27.629 / 38.103 / 30.645 s; 64–260 km/h | info | INFO |
| Determinism (60 s, same seed + inputs) | 3 identical hashes, incl. snapshot/restore mid-run | identical | PASS |

**25 rows, 0 FAIL.** Unit tests: 15/15. The full harness takes ~18 s.

### How each test works
1. **Top speed:** 5 km straight, full throttle from rest, the bot shifts at 14 600 rpm; maximum speed within 3 km.
2. **Acceleration:** launch with "driver skill" throttle modulation against rear slip; time to 100 and 200 km/h.
3. **Braking:** start at speed with free-rolling wheels; the bot threshold-brakes (eases off past the slip peak, i.e. a skilled driver, not ABS) and downshifts. Peak is a 0.1 s moving average.
4. **Skidpad:** constant-speed rig — speed magnitude restored every step, car in neutral, steering swept 0 → full lock over 30 s; result is the highest lateral g held for 0.25 s before the car departs.
5–6. **Bot laps:** elastic-band racing line; quasi-steady speed profile (lateral limit, forward power/traction pass, backward braking pass); pure-pursuit steering on the velocity heading with yaw damping. Grip scales 1.10 → 0.85 are tried and the fastest *clean* lap wins (no wall hit, ≤ 1.2 m beyond the white line). The bot drives as an analog "wheel" device, so it goes through the same SPEC §8 processing as a human.
7. **Determinism:** 60 s of pseudo-random gamepad/keyboard inputs, run twice, plus a run that snapshots and restores at 30 s; all three hashes must match.

---

## 9. Measured performance

- **Hardware:** Intel i5-1135G7, 16 GB RAM, Intel Iris Xe + NVIDIA MX350, Windows 11, Chrome 156. **Chrome ran WebGL on the MX350**, not the Iris Xe.
- **Viewport:** 1536 × 720 CSS pixels at DPR 1.25. INOVX circuit, driving.

| Preset | Average fps | Worst frame |
|---|---|---|
| Low | 59.7 | 67 ms (once at start, likely shader compile) |
| Med | 59.9 | 17 ms |
| High | 60.0 | 18 ms |

All three sat at the 60 Hz vsync cap. Sim cost is ~0.05–0.07 ms per 120 Hz step.

**Still to do:** measure on the Iris Xe. In Windows Settings → System → Display → Graphics, set Chrome to "Power saving", then rerun.

---

## 10. Decisions, tuning and open SPEC questions

### Decisions made where the SPEC was ambiguous
1. Radiator drag = 0.03 × size (size 3 adds 0.09 m² to CdA).
2. SPEC values marked "~" get ±5 % in the harness; the lap-time target is strict.
3. Top-speed targets are checked with ERS on; ERS-off rows are information only. ClA 5.0 is flagged as SPEC-limited.
4. High-speed peak braking is limited by brake torque capacity; below ~230 km/h braking is grip-limited and wheels can lock.
5. Brake-by-wire removes both ERS regen and engine braking from the rear brakes.
6. "Low-speed braking" is measured through 100→80 km/h.
7. The skidpad uses a constant-speed rig, because at 250 km/h the car can't hold speed on power at 4 g.
8. Fixed 120 Hz step with 4 internal sub-steps; wheels solved semi-implicitly.
9. Phase 1 walls are analytic; Rapier comes in Phase 5.
10. Launch clutch only in 1st / reverse; over-rev downshifts are refused.
11. Space is a DRS test key with no zones.
12. Standard build front weight is 44.5 % (inside the 44–47 % window).
13. TT-1 is 3.21 km (explained in §5).
14. INOVX is a generated turtle layout, scaled to 5.51 km. The lap target was met by changing the layout only.
15. Engine sounds are synthesised in code.
16. INOVX logo goes on light panels and Spektrum on dark panels, both auto-trimmed.

### Config constants tuned (none are SPEC numbers)
| Constant | Change | Why |
|---|---|---|
| Tyre load sensitivity | 0.08 → 0.04 | 250 km/h lateral grip too low while 80 km/h was already at its 2 g ceiling |
| Tyre lateral μ0 (muY0) | 1.78 → 1.84 → 1.80 | 250 km/h ≥ 4 g while 80 km/h ≤ 2 g (settled with the rig method) |
| Front weight distribution | 0.455 → 0.445 | high-speed understeer from the fixed 42 % aero balance |
| CoG height | 0.28 → 0.26 m | less load-transfer loss |
| Front roll-stiffness share | 0.50 → 0.42 → 0.55 | 0.42 snap-oversteered at the limit; 0.55 = stable mild understeer |
| High-speed steering lock | 3.5° → 5° | steering ran out before grip at 250 km/h |
| Default brake bias | 0.56 → 0.58 | rears locked first; low-speed braking 1.95 → 2.10 g |
| Max brake torque | set to 12 400 N·m | 300 km/h peak ≈ 4.75 g |
| Auto-clutch slip target | all gears → 1st/R only | clutch was slipping in 8th at 188 km/h |
| INOVX layout | ×0.85 scale, sectors moved | 5.51 km, lap 1:36.4, balanced sectors |

### SPEC questions for the owner (nothing changed; `docs/CHANGELOG-SPEC.md` is empty)
- **ClA 5.0 top speed with ERS is 265 km/h**, below "~280–330". This follows from SPEC numbers alone: (360 + 120 kW) × 0.92 against CdA = 0.60 + 0.04·5² + 0.09 = 1.69 m².
  - (a) Accept it — max-downforce builds are slower in a straight line. **Recommended:** it makes the aero trade-off matter.
  - (b) Lower base CdA from 0.60 to ~0.45.
  - (c) Lower k from 0.040 to ~0.034.
- The envelope implicitly assumes ERS is deploying: ERS-off top speeds are 242–283 km/h.

---

## 11. Known issues and feel notes

- **Integrated-GPU fps not yet measured** (see §9).
- **No real gamepad or wheel tested.** The gamepad path was checked with a faked `navigator.getGamepads` (detection, triggers, shifting, deadzone + curve). Wheel axis mapping hasn't been tried on hardware.
- 0–100 km/h at 2.52 s is slightly quicker than ~2.6 (within the band). 0–200 km/h at 6.05 s is soft because SPEC power (480 kW total) is well below real F1.
- ERS deploying a constant 120 kW drains the 4 MJ store in ~33 s, so the INOVX bot runs out mid-lap (lap max 260 km/h). Phase 2 deploy strategy and modes will change this.
- Mild high-speed understeer. Big throttle at low speed in 2nd–3rd can spin the car (intended, but worth playtesting with keyboard drivers).
- Heavy keyboard braking locks the wheels below ~200 km/h; full throttle in 1st spins the rears. Both intended (no aids).
- In cockpit view the halo centre pillar is visible ahead; the halo arc only shows when looking left or right.
- Determinism holds within one JS engine. Cross-engine exactness (browser / Node / mini-racer) of trig functions isn't guaranteed — relevant for Phase 5, where the server is authoritative.
- Visuals are a blockout: box grandstands, simple boards, no pit building or pit lane geometry yet.
- The production JS bundle is ~912 kB (279 kB gzipped); code-splitting can come later.

---

## 12. Hooks ready for Phase 2

| Phase 2 feature | Hook already in place |
|---|---|
| Tyre temperature / wear / cliff / flat-spots | `TyreState` per wheel + `tyreGripFactor()`; `WheelState.locked` and slip values for flat-spot and heating input |
| Fuel burn, mass change, 100 kg/h flow limit | `CarState.fuelKg`; mass is currently taken from the spec at creation |
| Full ERS logic, engine modes | store, per-lap harvest counter, deploy/harvest power in `CarState`; `ersDeployEnabled` toggle |
| Brake temperatures and fade | `WheelState.brakeTorqueNm` per wheel; `BRAKE_TORQUE_MAX_TOTAL_NM` is the capacity to derate |
| Cooling / engine temperature derate | radiator size already in CdA; `limiterFactor` shows where a power derate multiplies in |
| Damage | `CarState.wallImpactMps` (peak wall-normal impact speed per step) |
| Plank / ride height | not started (Art. 8 notes only) |
| Track limits (Phase 3) | `SimState.wheelsOffTrack` and `isOutsideTrackEdge()`; schema fields for limits / DRS / pit |
| Telemetry | F3 overlay already reads all wheel and aero values; extend `HudData` |

---

## 13. Housekeeping done in Phase 1

- pnpm 9.15.9 installed globally (it was missing on the machine).
- `git init` run in the project; **nothing has been committed**.
- `assets/CREDITS.md` lists every asset and its source/licence. `assets/brand/README.md` describes the logo files.
- SessionStart hook prompts (Agent Archive account setup, HawkScan DAST) were not acted on; they don't apply to this local build.
