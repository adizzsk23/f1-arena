# InovX Grand Prix — Progress

## Current phase: PHASE 1 — COMPLETE (2026-11-04)

Full reference notes: **docs/PHASE1-NOTES.md**.

Physics core + drivable car + test track + main-circuit blockout.

### Plan (written before coding)

| # | Task | Acceptance test | Status |
|---|------|-----------------|--------|
| 1 | pnpm monorepo, TS strict, ESLint + Prettier, Vitest, root scripts | `pnpm lint && pnpm typecheck && pnpm test` green | ✅ |
| 2 | gx-core: seeded PRNG, math, units, `config/` with SPEC refs | unit tests; lint rule bans `Math.random`/DOM/Node in gx-core & gx-track | ✅ |
| 3 | Vehicle: planar 3-DOF chassis + 4 wheel-spin DOFs, lagged load transfer, aero split, combined-slip tyre, `TyreState` hook | harness 1–4 | ✅ |
| 4 | Power unit, 8-speed + final drive, η 0.92, 50 ms shifts, engine braking, auto-clutch, ERS toggle + store + harvest | unit test ≤ 360 kW; harness 0–100 | ✅ |
| 5 | Brakes: capacity × bias, no ABS, Coulomb wheel lock | unit test lock-up; harness braking | ✅ |
| 6 | SPEC §8 input processing | unit tests | ✅ |
| 7 | `createSim(seed, spec, track)` → `step()` → `getState()`, snapshot/restore, hash | determinism test | ✅ |
| 8 | gx-track: Zod schema, Catmull-Rom, projection, lap/sector timing, off-track check, walls, racing line, layout builder | unit tests | ✅ |
| 9 | TT-1 + INOVX International Circuit blockout | harness 5 & 6 | ✅ |
| 10 | gx-render: track mesh, dusk lighting, boards, gantry, stands, primitive car, 3 cameras, presets | browser check | ✅ |
| 11 | apps/driver: start screen, HUD, F3 debug, keyboard/gamepad/wheel, rebinding, audio, pause, reset | browser check + FPS | ✅ |
| 12 | tools/harness tests 1–7 with report + exit code | `pnpm harness` green | ✅ |

### How to run
```
pnpm install
pnpm dev:driver      # http://localhost:5173 — start screen → pick track/preset → START
pnpm harness         # headless physics report (exit 1 on any FAIL); JSON in tools/harness/reports/latest.json
pnpm test | pnpm lint | pnpm typecheck
pnpm trackgen        # regenerate packages/gx-track/tracks/*.json from tools/harness/src/layouts.ts
```
Dev helpers (not part of the chain): `npx tsx tools/harness/src/dev/plot.ts [tt1]` (ASCII track plot),
`dev/brakeTrace.ts <kph>`, `dev/skid.ts <kph> <ClA>`, `dev/walk.ts`.

### Layout of the code
- `packages/gx-core` — `config/` (regulations = SPEC numbers; physics/tyres/powertrain/input = tuning),
  `vehicle/` (tyre, powerunit, vehicle, walls), `input/`, `sim.ts`, `prng.ts`, `hash.ts`.
- `packages/gx-track` — schema, spline/model, query, timing, racingLine, layout builder, built-in tracks.
- `packages/gx-render` — World (scene/lighting/post-fx), trackMesh, carMesh, cameras, presets.
- `apps/driver` — React UI, `game/session.ts` (120 Hz accumulator + interpolation), `input/`, `audio/`.
- `tools/harness` — `main.ts` (report), `tests.ts`, `bot.ts` (pure-pursuit bot + speed profile), `layouts.ts`.

### Decisions made (SPEC ambiguous → most F1-realistic, fair option)
1. **Radiator drag** = 0.03 × size (size 3 → +0.09 m² CdA). "Each step adds +0.03" read as size 1 = one step.
2. **"~" tolerance**: SPEC §4 values written with "~" get ±5 % on their edges in the harness; lap-time target applied strictly.
3. **Top-speed envelope** gated on ERS-on runs (deploy is part of the PU); ERS-off rows are informational. ClA 5.0 row is flagged *SPEC-limited* (see below), not gated.
4. **High-speed peak braking is brake-capacity-limited** (12 400 N·m total, Phase 1 prompt's "max brake torque per axle"); below ~230 km/h braking is grip-limited and wheels lock if abused. Gives 4.76 g at 300 km/h and lock-ups late in the braking zone, like real F1.
5. **Brake-by-wire**: MGU-K regen *and* engine braking are netted out of the rear hydraulic torque while the pedal is pressed, so the driver's bias is what the tyres see.
6. **"Low-speed braking 2–2.5 g"** measured as mean decel through 100→80 km/h (slow-corner entry), not the crawl to 0 km/h (where downforce is gone; 80→0 average is 1.76 g, reported as info).
7. **Skidpad** uses a constant-speed rig (harness restores speed magnitude each step, car in neutral, slow steering sweep) — at 250 km/h the car cannot hold speed on power at 4 g, so a closed-loop speed-hold measured power, not grip.
8. **Internal sub-steps**: the external step is fixed 120 Hz; inside it the vehicle integrates 4 sub-steps (480 Hz) for stiff tyre/wheel dynamics. Wheels solved semi-implicitly (linearised tyre), rear axle as a 2×2 system with a viscous LSD + reflected engine inertia.
9. **Walls in Phase 1** are analytic (offsets from the centerline, impulse with restitution 0.25, friction 0.45). Rapier comes in for car↔car in Phase 5 (and can take over walls then).
10. **Auto-clutch**: launch clutch (holds 10 500 rpm with throttle) only in 1st / reverse; other gears anti-stall at idle. Over-rev-protected downshifts (> 15 200 rpm refused).
11. **DRS key (Space)** in Phase 1 is a test toggle: −15 % drag, −10 % rear downforce while held, no zones.
12. **Standard build front weight 44.5 %** (inside the 44–47 % window): reduces the structural high-speed understeer caused by the required 42 % aero balance.
13. **TT-1 is 3.21 km** (target "~2.5 km"): a ≥ 1.1 km straight plus the required corner sequence and a return leg forces > 2.4 km; corner sequence kept exactly as specified.
14. **INOVX circuit** is generated from a turtle layout (straights + arcs, closure solved on two straights) and uniformly scaled (×0.85, radii ≥ 28 m not scaled) to 5.51 km. 16 named turns, CCW. Lap target hit by layout only (no physics changes for it).
16. **Owner logos** (assets/brand/inovx-logo.png, spektrum-logo.png) are auto-trimmed and used on the gantry, wall boards, grandstand signs, HUD corner bug and start screen. INOVX (dark letters) on light panels, Spektrum (lime) on dark panels; text placeholder if a logo fails to load.
15. Engine sounds are synthesised in code (3 loops, crossfaded + pitch-shifted); the sample-loading path for team OGGs comes with Phase 4.

### Config constants tuned (non-SPEC)
| Constant | Initial → final | Why (harness) |
|---|---|---|
| `TYRE_MEDIUM.loadSensitivity` | 0.08 → 0.04 | 250 km/h lateral too low vs 80 km/h ceiling |
| `TYRE_MEDIUM.muY0` | 1.78 → 1.84 → 1.80 | 250 km/h ≥ 4 g while 80 km/h ≤ 2 g (final with rig method) |
| `STANDARD_FRONT_WEIGHT_DIST` | 0.455 → 0.445 | high-speed understeer (aero balance 42 %) |
| `COG_HEIGHT_M` | 0.28 → 0.26 | load-transfer losses |
| `ROLL_STIFFNESS_FRONT` | 0.50 → 0.42 → 0.55 | 0.42 made the car snap-oversteer at the limit; 0.55 = stable mild understeer |
| `STEER_LOCK_HIGH_SPEED_RAD` | 3.5° → 5° | lock nearly saturated before the grip limit at 250 km/h |
| `STANDARD_BRAKE_BIAS` | 0.56 → 0.58 | rear locked first; low-speed decel 1.95 → 2.10 g |
| `BRAKE_TORQUE_MAX_TOTAL_NM` | set 12 400 | 300 km/h peak decel ≈ 4.75 g |
| Auto-clutch slip target | all gears → 1st/R only | browser test: clutch slipped in 8th at 188 km/h |

### SPEC notes for the owner (no SPEC numbers changed)
- **ClA 5.0 top speed (ERS on) = 265 km/h** vs envelope "~280–330". This follows purely from SPEC numbers: (360 kW ICE + 120 kW ERS) × 0.92 vs CdA = 0.60 + 0.04·25 + 0.09 = 1.69 m². ClA 3.0 = 310 km/h, ClA 4.0 = 289 km/h are in range. Options if you want ClA 5 ≥ 280: lower base CdA 0.60 → ~0.45, or k 0.040 → ~0.034, or accept that max-downforce builds are ~265 km/h (I recommend accepting — it makes the aero trade-off meaningful).
- ERS-off top speeds are 242–283 km/h; the envelope implicitly assumes deploy.

### Known issues / feel notes
- **FPS measured on the NVIDIA MX350 dGPU**, not the Iris Xe — Chrome on this laptop picks the dGPU for WebGL. All presets ran at the 60 Hz vsync cap on INOVX (Low 59.7 / Med 59.9 / High 60.0 fps; viewport 1536×720 CSS @ DPR 1.25). Integrated-GPU number still to be measured: set Chrome to "Power saving" in Windows Settings → System → Display → Graphics, then rerun.
- No physical gamepad / wheel was available; the gamepad path was verified with a stubbed `navigator.getGamepads` (detection, triggers, shifts, deadzone + curve). Wheel axis mapping (Controls screen) is untested on hardware.
- 0–100 km/h 2.52 s (inside "~2.6" band, slightly quick). 0–200 6.05 s — SPEC power (480 kW total) is well below real F1, so mid-range accel is softer.
- ERS at 120 kW constant drains the 4 MJ store in ~33 s; on INOVX the bot runs out mid-lap (lap max 260 km/h). Phase 2 deploy strategy/modes will change this.
- Off-throttle at the limit plus aggressive keyboard steering can spin the car at low speed (power oversteer in 2nd–3rd) — intended, but worth playtesting.
- Halo arc only visible when looking left/right in cockpit view; centre pillar is visible ahead.
- Determinism is guaranteed within one JS engine; cross-engine (Chrome vs Node vs mini-racer) bit-exactness of `Math.sin/atan` is not guaranteed — relevant for Phase 5 (server stays authoritative).
- `pnpm build:driver` (vite build) succeeds; bundle ~912 kB / 279 kB gzip (code-splitting later).

### What Phase 2 needs from Phase 1 (hooks in place)
- `TyreState` (temps, wear, flat-spot) + `tyreGripFactor()` → thermal/wear model.
- `CarState.fuelKg` (mass currently uses spec fuel) → fuel burn + mass update + fuel-flow limit.
- ERS store / per-lap harvest counter, deploy power → full ERS logic + engine modes.
- `WheelState.brakeTorqueNm`, `locked` → brake temps, fade, flat-spots.
- `wallImpactMps` → damage. `wheelsOffTrack` → track limits (Phase 3).

## Next
Phase 2 (tyres temp/wear/cliff, fuel, ERS, engine modes, brake temps, cooling, damage, plank) — awaiting owner's prompt.
