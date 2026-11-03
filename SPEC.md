# InovX Grand Prix — Master Spec

> Single source of truth. Every phase reads this first. Numbers here are **tuning targets**; change them only with the owner's approval and log the change in `docs/CHANGELOG-SPEC.md`.

Presented by **INOVX** (innovation club, REC) with **Spektrum** as co-brand / sponsor.

---

## 1. What we're building

A virtual F1-style championship. **Teams are constructors**: they engineer a car inside strict technical regulations (the "GX Formula" regs below) using our Garage. On event day their **human drivers race it live** on our LAN, in person, on a track we built. Physics is ours and authoritative — a car's performance comes 100% from its validated spec running through `gx-core`. Visual models are cosmetic only.

- Up to **40 teams × 4 members**, outside-college teams only.
- **All 4 members may drive** (driver swaps allowed, see §7).
- Graphics: clean futuristic F1 look. Performance > eye candy, but it must look polished on a projector (1080p, 16:9, fullscreen laptop output).
- Budget: **₹0 / $0**. Free tiers only (see §11).
- Builder: the owner + Claude Code. Prompts are phase-by-phase.

---

## 2. Event format (locked)

### Before event day
| Stage | What |
|---|---|
| Kit release | Garage live (browser) + optional `pip install gx-kit` CLI, rulebook PDF, sample car |
| Online hotlap ladder | Solo time trials in the Garage, results to leaderboard. **Decides heat seeding.** |
| Superlicence | Each driver must complete **5 clean laps ≤ 107% of the reference lap** in the Garage to be grid-eligible |
| Homologation deadline | Car submitted → scrutineering → steward approval → **HOMOLOGATED** (frozen) |
| Day-before online session | Race server opened publicly via Cloudflare Tunnel for an evening of multiplayer practice. Setup changes allowed. One optional **upgrade package** resubmission until midnight (re-scrutineered). |

### Event day (timetable)
| Time | Session |
|---|---|
| 08:00–09:15 | Check-in, LAN + laptop test, driver briefing |
| **09:30** | **Heat A** — formation lap → 26 laps (45 min cap). Grid = hotlap ranking (snake-seeded) |
| 10:20–10:30 | Results + steward decisions final → Heat A top 10 locked |
| 10:30–11:00 | Buffer |
| **11:00** | **Heat B** — same format |
| 11:50–12:00 | Results final → Heat B top 10 locked |
| **12:00–12:05** | **Final Qualifying** — 5-minute window, all 20 finalists |
| ~12:07 | Grid locked (laps started before the flag count) |
| 12:10 / 12:12 | Formation lap / **Lights out** — Grand Prix Final, 26 laps, 45 min cap |
| ~12:55 | Chequered flag → podium |

- **Heat seeding (snake):** hotlap ranks → Heat A gets 1, 4, 5, 8, 9, 12, 13…; Heat B gets 2, 3, 6, 7, 10, 11…
- Max **20 cars per session**, heats run back-to-back → only **20 driving stations** needed.
- **Classification:** a car must complete ≥ 90% of the winner's distance to be classified. Unclassified cars ranked by laps completed, then by retirement time. Top 10 classified per heat → Final.
- **Awards:** Race winner/podium, **Best Engineered Car** (lap-time-per-credit + efficiency, computed from telemetry), **Fastest Pit Stop**. Side event: Hotlap Challenge station during buffers.

---

## 3. Architecture

Monorepo (pnpm workspaces), **TypeScript everywhere** except the optional Python CLI.

```
/
├─ packages/
│  ├─ gx-core/        # Physics + rules + schema. PURE TS. No DOM, no Three.js. Deterministic.
│  ├─ gx-track/       # Track data format, spline math, sector/limit/DRS/pit geometry (no Three.js)
│  ├─ gx-render/      # Shared Three.js: car meshes, track mesh gen, cameras, materials, post-fx
│  └─ gx-ui/          # Shared React components, design tokens, branding
├─ apps/
│  ├─ driver/         # Driver client (cockpit / chase / T-cam, HUD, inputs, audio)
│  ├─ garage/         # Build car, compliance meter, solo test drive, submit
│  ├─ server/         # Node LAN race server (authoritative), sessions, timing, penalties, snapshots
│  ├─ broadcast/      # Admin big-screen director + race control + stewards panel
│  ├─ pitwall/        # Team telemetry login (laptop + phone responsive)
│  └─ paddock/        # Submissions, scrutineering queue, hotlap leaderboard
├─ python/gx-kit/     # pip CLI: validate/submit/practice, runs compiled gx-core JS via mini-racer
├─ tools/harness/     # Headless physics test runner + tuning reports
├─ assets/brand/      # INOVX + Spektrum logos (owner adds), colors
├─ assets/audio/      # Default engine samples, SFX (CC0)
├─ assets/models/     # CC0 props (Kenney, Quaternius, Poly Haven)
└─ docs/
```

| Concern | Tech |
|---|---|
| Physics | Custom vehicle dynamics in `gx-core`, **fixed 120 Hz**, accumulator loop, render interpolation |
| Collisions | Rapier (`@dimforge/rapier3d-compat`) — car↔car, car↔wall only. Vehicle dynamics are ours. |
| Schema | Zod (shared by Garage, server, CLI) |
| 3D | **Vanilla Three.js** + pmndrs `postprocessing` |
| UI | React + Vite + Tailwind + Zustand |
| Charts | uPlot |
| Networking | Node + `ws`, msgpack binary, server-authoritative; clients send **inputs only** |
| Audio | Web Audio API, RPM-crossfaded engine samples |
| Input | Keyboard, Gamepad API (gamepads + wheels; no force feedback in browser) |
| Tests | Vitest + headless harness |
| Hosting | Cloudflare Pages (apps), Supabase (auth/data), Cloudflare R2 (assets/replays), Cloudflare Tunnel (day-before server) |
| Race day | **Pure LAN.** Server laptop serves all clients. No internet dependency. Backup server laptop on hot standby. |

**Hard rules**
- `gx-core` and `gx-track` must never import Three.js, React, or DOM APIs. They must run in Node, browser, and mini-racer.
- No `Math.random()` in simulation — seeded PRNG only.
- SI units internally (m, kg, s, N, W, rad, K or °C clearly named). Convert only at the UI.
- Same input-processing code runs on client (for feel) and server (authoritative).

---

## 4. Performance envelope (targets for a legal, well-built car)

| Metric | Target |
|---|---|
| Top speed (no DRS / DRS+tow) | ~280–330 km/h / up to ~350 km/h depending on aero |
| 0–100 km/h | ~2.6 s (traction-limited) |
| Peak braking | ~4.5–5 g at high speed, ~2–2.5 g at low speed |
| Peak lateral | ~4–4.5 g fast corners, ~1.7–2 g slow corners |
| Lap time | ~1:30–1:38 on the main circuit (~5.5 km) |
| Race | 26 laps, 1-stop standard, 2-stop viable |

Physics must make these limits **emerge** (grip, load, aero, drag, power) — never hard-clamp speed or decel.

---

## 5. GX Formula — Technical Regulations

### Art. 1 Mass & dimensions
- Min mass **800 kg** including 80 kg driver, excluding fuel. Underweight = DSQ.
- Standard-build mass is **815 kg**; chassis upgrades reduce it (Art. 9). Ballast ≤ 30 kg in defined zones to hit min mass / tune balance.
- Static front weight distribution **44–47%**.
- Collision hull fixed for all cars: L 5.6 m, W 1.9 m, wheelbase 3.5 m, track width ~1.6 m. Visual bodywork free inside the bounding box (≤ 50k triangles).

### Art. 2 Power unit
- ICE peak ≤ **360 kW**, rev limit **15,000 rpm**. Teams shape the torque curve via 6 points under a regulated envelope.
- Fuel flow ≤ **100 kg/h** (enforced in the model).
- ERS: deploy ≤ **120 kW**, store **4 MJ**, harvest ≤ **2 MJ/lap** under braking (upgradeable, Art. 9).
- Drivetrain efficiency 0.92.
- Engine modes: **Lean** (−6% power, −10% fuel), **Standard**, **Push** (+4% power vs Standard up to cap, +12% fuel, +wear). Switchable from cockpit.

### Art. 3 Fuel
- Max **60 kg** at race start. Fuel mass affects the car (~0.03 s/kg/lap emergent).
- **≥ 1.0 kg must remain at the flag (fuel sample) or DSQ.** Full race in Standard ≈ 46–50 kg (tune to this).

### Art. 4 Aerodynamics
- Downforce coefficient `ClA` ∈ **[3.0, 5.0]**.
- Drag: `CdA = 0.60 + k · ClA² + radiatorDrag`, base `k = 0.040` (Art. 9 upgrades lower k).
- Aero balance (front %) adjustable 38–46%.
- **DRS:** −15% drag, rear downforce −10%, only in DRS zones, only within 1.0 s at detection, enabled from lap 3. Disabled in final quali.
- **Slipstream:** up to −8% drag when directly behind within ~40 m.
- **Dirty air:** up to −20% downforce when following within ~1 s through corners.
- Ride height effect: lower = up to +8% downforce (see Art. 8 plank).

### Art. 5 Cooling
- Radiator size 1–5. Each step adds drag (+0.03 CdA base). Undersized → engine temp rises → power derate up to −10%.

### Art. 6 Tyres (spec supplier: us)
- Compounds **Soft / Medium / Hard** — different peak grip, temperature window, wear rate.
- Grip falls with wear; **cliff past ~70% wear**. Overheating accelerates wear. Cold tyres = low grip.
- Target stint lengths (at event wear multiplier): Soft ~10–12 laps, Medium ~16–18, Hard ~24–26.
- **Race rule:** at least **2 different compounds** used → ≥ 1 pit stop.
- Pressures adjustable (setup) — affect grip window and wear.

### Art. 7 Brakes
- Disc package S/M/L: mass +0/+2/+4 kg, increasing cooling. Window 400–1000 °C, fade above.
- Brake bias adjustable from cockpit 50–60% front.
- **No ABS, no traction control, no driver aids.** (Input processing in §8 is not an aid — it is identical for all.)

### Art. 8 Transmission & suspension
- 8-speed sequential + final drive. **Ratios homologated** (frozen at submission).
- Static ride height ≥ 30 mm. **Plank:** 10 mm, wear when dynamic ride height bottoms. > 1 mm wear at post-race scrutineering = DSQ.
- Spring stiffness / anti-roll / diff: stiffness trades aero platform vs kerb riding and tyre wear.

### Art. 9 Cost cap — **100 credits** (max-everything = 210)
| Upgrade | Base (0 cr) | Tier 2 | Tier 3 |
|---|---|---|---|
| Chassis material | 815 kg build | −10 kg (20) | −20 kg (40) |
| Aero efficiency `k` | 0.040 | 0.036 (25) | 0.032 (45) |
| ERS harvest/lap | 2.0 MJ | 2.4 MJ (20) | 2.8 MJ (35) |
| Cooling efficiency | base | −5% radiator drag (15) | −10% (30) |
| Tyre-friendly suspension | base | −10% wear (20) | −20% wear (35) |
| Brake package | base | wider temp window (15) | fade-proof (25) |

### Art. 10 Homologation & parc fermé
- **Homologated (frozen at approval):** mass build, ballast position, chassis/aero/ERS/cooling/suspension/brake upgrades, `ClA` range choice, aero balance range, radiator size, gear ratios, torque curve, bodywork parts, livery, engine sounds.
- **Setup (changeable until parc fermé):** wing trim (±1 step of `ClA` = ±0.25), brake bias default, diff, tyre pressures, ride height (≥ 30 mm), default engine mode, race fuel load.
- **Parc fermé** starts when Final Qualifying ends. Heats: setup locked at heat start.
- One optional **upgrade package** resubmission after the day-before session (by midnight), fully re-scrutineered.

### Art. 11 Engine sound
- 3 OGG samples: idle / mid / high RPM, each ≤ 1 MB, ≤ 3 s, loop-able. Auto loudness-normalised. Moderated; default sound fallback.

### Art. 12 Visuals
- Spec chassis + **part library** (nose, front wing, sidepods, engine cover, rear wing styles) + livery (colors, patterns, number, decals). Visual only.
- Stretch: custom glTF bodywork inside bounding box.
- No real F1 team names/liveries/brands. Moderated.

### Scrutineering (automatic → steward approval)
1. Zod schema + range checks for every article.
2. Credits ≤ 100.
3. Simulated tests on our physics: top-speed run, 200→0 braking, full race-distance fuel sim (must keep ≥ 1 kg), tyre stint sim.
4. Asset checks: triangles, texture size, audio specs.
5. Steward clicks **Approve** → HOMOLOGATED badge + grid eligibility.

---

## 6. Sporting Regulations (summary)
- **Track limits:** all 4 wheels beyond the white line = strike. Quali → lap deleted. Race → 3 strikes = 5 s penalty (further strikes +5 s each).
- **Pit lane:** 80 km/h limit (speeding = 5 s). Unsafe release = 5 s. Cars **ghosted** in pit lane and for 3 s after rejoining from off-track.
- **Stewards:** collisions flagged automatically, reviewed live with instant replay → no action / 5 s / 10 s / drive-through / DSQ. Unresolved at flag = stands. Results provisional 5 min after flag.
- **Flags & control:** blue flags, yellow, Virtual Safety Car, Safety Car, red flag, formation lap + 5-light start.
- **Disconnect:** car slows safely and pulls over; 60 s to reconnect and resume from same position; else DNF.
- **Server crash:** state snapshot every 1 s → red flag → resume from last snapshot (backup laptop mirrors snapshots over LAN).
- **Final Qualifying (5 min):** all cars ghosted, slipstream + dirty air OFF, tyres start at operating temp, laps started before the flag count, ties → earlier time wins, no time → back of grid ordered by best heat lap. Invalid laps deleted instantly and shown live.
- **Race length:** 26 laps, 45-min hard cap (race ends at end of lap in progress).

---

## 7. Teams, drivers, pit stops
- Team roles (suggested): Driver(s), Race Engineer, Strategist, Designer. All 4 may drive.
- **Driver swap:** same laptop only, only while stationary in the pit box. Car held until new driver presses READY; clock runs.
- **Pit stop:** stop time = base 2.5 s tyre change + pit-crew mini-game result (team members tap a timing sequence on the Pit Wall device → 2.2–4.5 s) + repairs (front wing +6–8 s).
- **Pit Wall login** per team (laptop or phone): their car's per-corner tyre wear/temp, fuel vs target, ERS, engine temp, brake temps, damage, gaps, pit window, lap/sector history, strategy calls.

---

## 8. Input processing (fairness layer — identical for everyone, client + server)
- **Keyboard (digital):** throttle 0→1 in 0.20 s, release 0.10 s; brake 0→1 in 0.25 s, release 0.10 s; steering ramps with speed-sensitive rate.
- **Gamepad (analog):** deadzone 0.06, steering response curve exponent 1.5, trigger deadzone 0.03.
- **Wheels/pedals:** treated as analog axes; **server-side max steering rate** applies to all devices so no device out-reacts others.
- Speed-sensitive max steering lock applies equally to all devices.
- Bindings: throttle, brake, steer, gear up/down, DRS, ERS/engine mode, brake bias ±, pit limiter, camera cycle, look left/right.

---

## 9. Views, broadcast, UI

### Driver views (per driver, own car)
1. **Cockpit** (halo frame visible, steering wheel display)
2. **Chase** (third-person)
3. **T-cam / Front** (above airbox, forward)

Driver HUD: speed, gear, RPM lights, ERS %, fuel vs target (laps remaining), tyre temps/wear, brake bias, engine mode, delta to best, position, gaps, lap/sector timer, track-limit strikes, flags, pit limiter, DRS available/active.

### Broadcast Director (admin, projector — fullscreen 1080p 16:9)
- Camera director: per-car onboard/chase/T-cam, trackside cams, helicopter/overview, auto-director mode (follow battles, overtakes, pit stops).
- Graphics: timing tower (gaps/intervals, tyres, pit stops), sector compare (purple/green/yellow), fastest lap, head-to-head battle card, pit stop timer, tyre strategy chart, lap chart, Pit Wall spotlight, race control messages, replays/slow-mo.
- Race Control + Stewards panels (role-based later).

### Visual direction
- **Clean futuristic F1.** Dusk default (deep blue sky, warm track lights), night variant optional. High-contrast track edges, glowing kerbs, crisp typography. Must read well on a projector.
- Branding everywhere like a title sponsor: **"InovX Grand Prix"** wordmark, INOVX + Spektrum boards trackside, gantries, pit wall, timing tower header, loading screens, replay stings, HUD corner bug. Logos supplied in `assets/brand/`.
- Graphics presets Low/Med/High. **Target: 60 fps at 1080p on integrated graphics on Low with 20 cars.**

---

## 10. Track
- Fictional circuit, **Sepang × Silverstone** character, ~5.5 km, ~16 turns, 3 sectors, 2 DRS zones, pit lane on main straight.
  - Sepang DNA: long back straight into a tight hairpin, wide double-apex T1–T2 complex.
  - Silverstone DNA: fast esses (Maggots–Becketts–Chapel style), a flat-ish high-speed right (Copse style), a medium-speed Stowe-like corner, slow complex before the pit straight.
- Defined in JSON: Catmull-Rom centerline, width per point, kerbs, run-off, walls, sector lines, DRS detection/activation, pit lane entry/exit/boxes, track-limit lines, start grid. Mesh generated by `gx-render`.
- Working name: **"INOVX International Circuit"** (owner may rename).
- Phase 1 uses a **test track** (see Phase 1).

---

## 11. $0 hosting constraints (verified Nov 2026)
- Cloudflare Pages: unlimited static bandwidth, 500 builds/month, 1 concurrent build.
- Cloudflare R2: 10 GB storage, 1M Class A / 10M Class B ops per month, free egress.
- Supabase free: 500 MB DB, 1 GB storage, 5 GB egress, 2 projects, **pauses after 7 days idle** (keep alive).
- Not used: Vercel Hobby (non-commercial clause), Oracle free (now 2 OCPU/12 GB + card), Render (spin-down, 30-day DB), HF Spaces (compute Spaces need paid plan).

---

## 12. Build phases
1. **Physics core + one drivable car on a test track** + 3 cameras + all input devices + headless harness.
2. Tyres (temp/wear/cliff), fuel, ERS, engine modes, brake temps, cooling, damage, plank. Telemetry debug overlay.
3. Main circuit: track JSON + mesh, sectors, DRS, pit lane, kerbs, track-limit detection, branding boards, dusk lighting.
4. Car spec schema + regs validator + cost cap + scrutineering sims + **Garage** UI (compliance meter, test drive, livery/parts, sound upload, submit). `gx-kit` pip CLI.
5. **LAN race server:** sessions (practice/quali/race/final quali), timing, penalties, flags, SC/VSC, pit stops, driver swap, ghosting, disconnects, snapshots/resume. Client prediction for day-before internet play.
6. **Broadcast Director** + **Pit Wall** + pit-crew mini-game.
7. **Paddock** site: submissions, scrutineering queue, hotlap leaderboard, superlicence, awards computation. (Registration import + RBAC later.)
8. Polish: branding pass, audio, replays/highlights, performance pass, projector QA, rulebook PDF.

## 13. Parked (later)
- Registration import (CSV from the owner's separate portal → team codes).
- Role-based admin (Race Control / Stewards / Director).
- Custom glTF bodywork.
