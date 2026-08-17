# Conway's Game of Life

GPU-driven Game of Life. Bit-packed state (32 cells per `u32`) advanced with SWAR full-adders,
rendered from a dedicated worker via OffscreenCanvas.

Live: https://shivamstaq.github.io/cgol/

## Stack

| Concern | Choice                                                 |
| ------- | ------------------------------------------------------ |
| Build   | Vite 8 (Rolldown)                                      |
| UI      | React 19.2, Tailwind 4 (CSS-first `@theme`), Zustand 5 |
| Types   | TypeScript 7 (native), `tsc --noEmit`                  |
| Lint    | oxlint 1.78 + tsgolint (type-aware)                    |
| GPU     | WebGPU primary, WebGL2 fallback                        |
| Deploy  | GitHub Actions → GitHub Pages, base `/cgol/`           |

## Scripts

| Command             | Effect                      |
| ------------------- | --------------------------- |
| `npm run dev`       | Dev server at `/cgol/`      |
| `npm run build`     | Production build to `dist/` |
| `npm run typecheck` | `tsc --noEmit`              |
| `npm run lint`      | oxlint, type-aware          |
| `npm run format`    | Prettier write              |

## URL parameters

| Parameter         | Effect                            |
| ----------------- | --------------------------------- |
| `?backend=webgpu` | Force WebGPU; fail if unavailable |
| `?backend=webgl2` | Force WebGL2; fail if unavailable |

## Controls

Temporary bindings until the dock lands in M5.

| Input   | Effect                                              |
| ------- | --------------------------------------------------- |
| Drag    | XOR stroke; each cell flips at most once per stroke |
| `Space` | Toggle RUNNING / DRAWING                            |
| `→`     | Advance one generation                              |
| `r`     | Reset to seed                                       |
| `c`     | Clear                                               |
| `t`     | Toggle turbo                                        |

## Architecture

- `src/engine/worker.ts` — worker entry; owns the render loop and queues commands until ready.
- `src/engine/runtime.ts` — backend selection, mode machine, step accumulator, turbo, strokes,
  debounced reallocation, stats at 8Hz.
- `src/engine/dispatch.ts` — command switch shared by the worker and inline paths.
- `src/engine/backend/` — `Backend` interface with WebGPU and WebGL2 implementations.
- `src/engine/shaders/` — WGSL: `life` (SWAR step), `stamp` (XOR brush), `blit` (realloc),
  `present` (cell raster).
- `src/engine/client.ts` — main-thread handle; worker path, or inline runtime when
  `transferControlToOffscreen` is unavailable.
- `src/store/store.ts` — UI state and engine stats. React never runs in the frame path.

## State layout

- 1 bit per cell, 32 cells per `u32`; bit `i` of word `w` is cell `x = w * 32 + i`.
- Row stride is `ceil(cols / 32)` words; trailing bits of a ragged last word stay zero.
- Neighbour counts come from SWAR full-adders over three row triples, yielding count bit planes
  `b0..b3`; rules apply as two 9-bit masks (bit `k` = neighbour count `k`).
- Both axes wrap.

Design decisions: [SPEC.md](SPEC.md).

## Milestones

- [x] M1 — scaffold, worker handshake, both backends clearing, Pages deploy
- [x] M2 — WebGPU packed-SWAR engine, torus, two-state machine, XOR drawing, realloc
- [ ] M3 — WebGL2 fallback at simulation parity
- [ ] M4 — FX pipeline: birth/death styling, mip glow, palettes
- [ ] M5 — dock, presets, rules, persistence, shortcuts, touch

## License

MIT
