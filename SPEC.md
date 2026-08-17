# Conway's Game of Life — Spec

## Engine & threading

- WebGPU primary (compute shaders), WebGL2 fallback at visual parity, behind one backend interface. `?backend=webgl2|webgpu` override; active backend shown in telemetry panel.
- Engine entirely in a dedicated Worker with OffscreenCanvas — sim, render, rAF, accumulator. Main thread does React + pointer capture only. Main-thread fallback if `transferControlToOffscreen` is missing.
- State: bit-packed, 32 cells per u32, advanced with SWAR full-adders (WebGPU storage buffer / WebGL2 R32UI texture) — same layout both backends.
- Separate RG8 FX texture (R = birth glow, G = death glow) decayed per rendered frame in wall-clock time.
- Toroidal wrap only.

## World

- Grid ≡ viewport: `ceil(w/cell) × ceil(h/cell)`. No camera, no pan/zoom.
- Resize or cell-size change → center-anchored cell-level blit (grow adds dead cells, shrink crops), debounced ~120ms; if RUNNING, pauses and resets to the seed.

## States — strict two-state machine, `Space` toggles, primary dock button morphs

- **RUNNING**: sim advances. Speed, palette, glow, rule, stats, dock-move, fullscreen all live. Pressing the canvas switches to DRAWING and starts that stroke. Edit actions (Presets/Fill/Clear/Step/cell-size) also auto-switch.
- **DRAWING**: sim frozen (FX continues decaying), brush live.
- Seed snapshots on every DRAWING→RUNNING transition. Reset restores it, generation → 0, lands in DRAWING. No undo.

## Timing

- Decoupled clocks: render every vsync; sim from a fixed-timestep accumulator with clamped catch-up.
- Slider max = TURBO: ~8ms step budget per frame, rendering only the final state.

## Drawing

- True XOR invert, each cell flipping at most once per stroke (stroke-base copy + accumulating mask).
- Capsule SDF stamping between coalesced pointer positions, so fast flicks never gap.
- Circle/square brush, continuous size 1–64, scatter density, live brush ring.
- Wheel = brush size, `[`/`]` too; Ctrl+wheel / pinch = cell size.

## Rules

- Conway B3/S23 default; presets (HighLife, Day & Night, Seeds, Diamoeba, 34 Life, Replicator, Life without Death) + custom B/S field behind an advanced disclosure.

## Presets

- RLE stamp catalog (glider, LWSS/MWSS, Gosper gun, pulsar, pentadecathlon, acorn, R-pentomino, diehard, spacefiller) with ghost preview, `R` rotate, `F` flip.
- Fill generators: random w/ density, 4-fold symmetric soup, centre blob.
- Clipboard RLE paste.

## Visuals — dark only

- Birth: 0.5→1.0 scale pop, white-hot core cooling to alive colour.
- Death: 1.0→0 shrink shifting to ember, leaving ash residue.
- Geometry effects auto-disable below 4px cells.
- Mip-based pseudo-glow (mip chain over the emissive target, 2–3 levels in the composite; manual mip blits on WebGPU).
- Palettes: Aurora (default), Ember, Ultraviolet, Mono — one token set shared with the React chrome.

## Dock

- Solid opaque bottom-centre pill, hairline border, drop shadow, no glass.
- Draggable by a left-edge grip only, free placement, magnetic edge/centre snap, clamped and persisted.
- Inline: transport · brush · speed+TURBO · cell size · stats strip (FPS, gen/s, generation, population).
- Popovers above for Presets / Rules / Appearance; flip downward near the top.
- Clicking stats opens a telemetry panel (backend, grid dims, cells/sec, frame-time sparkline).
- Population via throttled async GPU reduction — no sync stalls.

## Other

- Full keymap + `?` overlay + fullscreen.
- Responsive dock with overflow sheet under 640px, touch gestures, `touch-action: none`.
- localStorage: settings + board autosave (bounding-box RLE); Copy RLE; PNG export.
- First load = empty board in DRAWING.

## Stack & delivery

- Vite 8 / React 19.2 / Tailwind 4.3 (`@theme`) / TS 7 strict / Zustand 5, shaders as `?raw`. Zero React in the frame path.
- CI: typecheck + lint, then deploy to Pages via Actions on `master`, base `/cgol/` → `shivamstaq.github.io/cgol/`.
- Milestones, each verified in Chrome with screenshots for review:
  - M1 scaffold + Tailwind + worker handshake + Actions deploy (live URL)
  - M2 WebGPU packed-SWAR engine, torus, two-state machine, XOR drawing, resize/realloc
  - M3 WebGL2 fallback at visual parity + backend override
  - M4 FX pipeline — birth/death, mip glow, palettes
  - M5 full dock, presets, rules, persistence, shortcuts, responsive/touch

## Defaults

- Cell size 2–40px, default 8px (≈320×180 grid at 1440p); measured in CSS px, rendered at DPR (capped 2).
- Speed 0.5–240 gen/s log slider, default 20.
- Brush circle, size 3, scatter 100%.
- Birth pop 120ms / death 250ms / ash 600ms.
- Glow Off·Subtle·Full, default Subtle.
- Grid lines on at ≥10px cells, toggleable.
- Dock idles to ~70% opacity after 3s, restores on proximity.
- Stats and population sampled at 8Hz.
- Sim halts on hidden tab, no catch-up storm on return.
- Autosave skipped above 150k live cells.
- MIT license + README with screenshot; one commit per milestone.

## Rejected alternatives (for the record)

- WebGL2-only or WebGPU-only backend; main-thread engine; SharedArrayBuffer via service-worker COOP/COEP shim.
- Fixed torus world with pan/zoom camera; infinite chunked world; resample-on-resize; clear-on-resize.
- Byte-per-cell state; dead-edge boundaries; real bloom chain; light theme.
- Latched paint/erase strokes; explicit paint/erase tools; undo/redo; generation rewind.
- Glass dock; nine-zone snapping; drag-from-anywhere; separate HUD clusters.
- Shareable URL hash; Vitest suite; Playwright smoke test; auto-running demo seed; `main` branch; `gh-pages` branch deploys.
