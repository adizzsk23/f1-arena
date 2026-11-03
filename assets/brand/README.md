# Brand assets (owner supplied)

- `inovx-logo.png` — INOVX logo, 1080×1080 RGBA. Dark letters → always shown on light panels.
- `spektrum-logo.png` — Spektrum logo, 3240×1080 RGBA, transparent background, lime → shown on dark panels.

Both are auto-trimmed at load (transparent/near-white margins removed) by `packages/gx-render/src/brand.ts`.
To update a logo, replace the file with the same name. If a file is missing or fails to load,
the renderer falls back to clean text placeholders.
