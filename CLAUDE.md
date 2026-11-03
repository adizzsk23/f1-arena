# CLAUDE.md — InovX Grand Prix

## Read first, every session
1. `SPEC.md` — the master spec. It wins over anything else.
2. `docs/PROGRESS.md` — what's done, what's next, known issues. Create it if missing.
3. The current phase prompt from the owner.

## Project in one line
A browser-based F1-style racing sim where teams engineer cars under strict regulations and race them live on a LAN. Our physics is authoritative; visuals are cosmetic.

## Stack
pnpm workspaces · TypeScript (strict) · Vite · React + Tailwind + Zustand (UI) · vanilla Three.js + pmndrs postprocessing (3D) · Rapier (collisions only) · Zod (schemas) · Node + ws + msgpack (server) · Vitest · uPlot · Web Audio · Gamepad API. Python only in `python/gx-kit`.

## Non-negotiable rules
- `packages/gx-core` and `packages/gx-track`: **pure TS**. No Three.js, React, DOM, Node-only APIs. Must run in browser, Node, and an embedded V8 (mini-racer).
- Simulation is a **fixed 120 Hz** step. Rendering interpolates. Never tie physics to frame rate.
- **No `Math.random()` in simulation** — use the seeded PRNG in `gx-core`.
- **SI units internally.** Name variables with units when ambiguous (`speedMps`, `tempC`, `energyJ`). Convert at UI only.
- Never hard-clamp speed or deceleration to hit targets. Limits must emerge from grip, load, aero, drag and power.
- Input processing (`gx-core/input`) is shared by client and server and identical for all devices' categories (see SPEC §8).
- All tunable numbers live in `gx-core/src/config/` as named constants with a comment pointing to the SPEC article. No magic numbers in logic.
- Don't change SPEC numbers on your own. If tuning requires it, propose the change, explain why with harness output, and wait for approval. Log approved changes in `docs/CHANGELOG-SPEC.md`.
- Free-tier only. Don't add paid services or dependencies that require accounts/keys without asking.

## Working style
- Work phase by phase. Do not build ahead into later phases unless the phase prompt says so.
- Before coding a phase: write a short plan in `docs/PROGRESS.md` (tasks + acceptance tests).
- Write tests alongside code. Physics changes must pass the harness (`pnpm harness`).
- After each phase: update `docs/PROGRESS.md` (done / next / known issues / how to run), run `pnpm lint && pnpm typecheck && pnpm test && pnpm harness`, and print a short summary for the owner.
- Prefer small, readable modules. Comment the physics with the equation used.
- When something in SPEC is ambiguous, pick the most F1-realistic option that keeps the event fair, note it in PROGRESS.md under "Decisions made", and carry on.

## Commands (keep these working)
- `pnpm install`
- `pnpm dev:driver` — driver client (Phase 1: single-player on test track)
- `pnpm harness` — headless physics test suite + report
- `pnpm test` · `pnpm lint` · `pnpm typecheck`

## Branding
- Event name: **InovX Grand Prix**. Co-brands: **INOVX** and **Spektrum**.
- Logos go in `assets/brand/` (owner supplies). Until then use clean text placeholders with the names — never invent logos.
- Look: clean futuristic F1, dusk default, high contrast, projector-friendly.

## Assets
- Only CC0 / self-made assets. Record source + license in `assets/CREDITS.md`.
- No real F1 team names, liveries, logos, or real circuit names.
