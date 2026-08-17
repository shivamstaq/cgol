---
name: cgol-stack
description: Verified API reference for this project's stack — Vite 8 (Rolldown), Tailwind 4 CSS-first, TypeScript 7 native, oxlint + tsgolint, React 19.2, Zustand 5, WebGPU/WebGL2 in an OffscreenCanvas worker, GitHub Pages. Load before writing config, build, lint, or GPU code.
---

# cgol stack reference

Verified 2026-08-17 against primary docs. Stack decisions live in `SPEC.md`; version downgrades require user approval.

## Pinned versions

| Package                        | Version           |
| ------------------------------ | ----------------- |
| vite                           | 8.2.1             |
| @vitejs/plugin-react           | 6.0.5             |
| tailwindcss, @tailwindcss/vite | 4.3.3             |
| typescript                     | 7.0.2 (native/Go) |
| oxlint                         | 1.78.0            |
| oxlint-tsgolint                | 7.0.2001          |
| react, react-dom               | 19.2.8            |
| zustand                        | 5.0.15            |
| @webgpu/types                  | 0.1.71            |

## TypeScript 7

- `tsc` binary is the Go compiler. Typecheck: `tsc --noEmit`. LSP: `tsc --lsp --stdio`.
- No programmatic API until 7.1. `typescript-eslint`, ts-jest, ts-morph, Vue/Svelte/Astro/Angular tooling cannot load it. Peer ranges reject `typescript@7` — never add them.
- Package layout is `dist/`, not `lib/typescript.js`.
- Removed tsconfig options: `target: es5`, `module: amd|umd|systemjs|none`, `moduleResolution: node|node10|classic`, `downlevelIteration`, `baseUrl`, `esModuleInterop: false`, `allowSyntheticDefaultImports: false`, `preserveConstEnums`, namespace `module` keyword.
- Use `module: esnext`, `moduleResolution: bundler`, `strict: true`, `types: []` with explicit entries.

## Linting — oxlint

- Typecheck and lint are separate: `tsc --noEmit` and `oxlint`.
- Type-aware rules need `oxlint-tsgolint` (requires TS ≥ 7.0) + `options.typeAware: true` or `--type-aware`.
- `.oxlintrc.json` keys: `rules`, `categories`, `plugins`, `jsPlugins`, `overrides`, `extends`, `ignorePatterns`, `env`, `globals`, `settings`, `options`.
- Default plugins: `eslint`, `typescript`, `unicorn`, `oxc`. Optional: `react`, `react-perf`, `import`, `jsx-a11y`, `node`, `promise`, `jsdoc`, `nextjs`, `vue`, `jest`, `vitest`.
- Setting `plugins` replaces the default set — list every plugin wanted.

## Vite 8

- Rolldown is the bundler. `build.rollupOptions` → `build.rolldownOptions`; `worker.rollupOptions` → `worker.rolldownOptions`; `esbuild` block → `oxc`; `optimizeDeps.esbuildOptions` → `optimizeDeps.rolldownOptions`.
- Default targets: Chrome 111, Edge 111, Firefox 114, Safari 16.4. Override via `build.target`.
- Unchanged: `new Worker(new URL('./x.ts', import.meta.url), { type: 'module' })`, `?raw` imports, `base`.
- Project pages base: `base: '/cgol/'`.

## Tailwind 4

- `npm i tailwindcss @tailwindcss/vite`; add `tailwindcss()` to `plugins`; `@import "tailwindcss";` in the entry CSS.
- No `tailwind.config.js`, no `postcss.config.js`. Tokens go in `@theme { --color-*: … }`; content detection is automatic.

## Worker + OffscreenCanvas

- `canvas.transferControlToOffscreen()` is one-way and must be passed in the postMessage transfer list. Afterwards `canvas.getContext()` on the main thread throws `InvalidStateError`.
- Main thread cannot resize a transferred canvas; send dimensions and set `canvas.width/height` inside the worker.
- `requestAnimationFrame` exists in dedicated workers and is throttled when the page is hidden.
- SharedArrayBuffer requires COOP/COEP headers, which GitHub Pages cannot send — use postMessage only.
- Feature-detect `HTMLCanvasElement.prototype.transferControlToOffscreen` and fall back to running the same runtime on the main thread.

## WebGPU

- `navigator.gpu.requestAdapter({ powerPreference })` → `adapter.requestDevice()` → `canvas.getContext('webgpu')` → `context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' })`.
- Reconfigure the context after any canvas resize.
- No `generateMipmap`; mip levels require manual blit passes.
- Handle `device.lost` and the canvas `contextlost` event (mobile memory pressure).
- Add an `uncapturederror` listener; without it, validation failures silently skip draws.
- Storage textures accept only a fixed format list — `rg8unorm` is NOT among them. Use a storage
  buffer or `rgba8unorm` for read-write per-cell data.
- Storage textures are write-only unless the read-write extension applies, so read-modify-write
  either ping-pongs textures or uses a storage buffer.
- Requires Chromium 113+ / Firefox 141+.

## WebGL2

- Do NOT pass `desynchronized: true` when the canvas is worker-owned — it breaks presentation on
  Chrome/ANGLE while `getError()` stays clean and the drawing buffer looks correct.
- Packed state uses immutable `R32UI` textures (`texStorage2D`), `usampler2D` + `texelFetch`,
  `layout(location = N) out uvec4` outputs, and `NEAREST` filtering (required for integer textures).
- Read-modify-write needs ping-pong: the XOR stroke mask uses two textures with MRT writing mask and
  state in one pass.
- `clearBufferuiv` zeroes an integer target; `drawBuffers` state is per-framebuffer, set at creation.
- GLSL ES `%` is undefined for negative operands — wrap with explicit comparisons, not modulo.
- Readback for debugging: `readPixels(..., gl.RED_INTEGER, gl.UNSIGNED_INT, Uint32Array)`.
- Async readback: `PIXEL_PACK_BUFFER` + `fenceSync` + `clientWaitSync` polling; never `readPixels`
  into a sync stall.

## Debugging the render path

- A correct present pass paints the dead colour everywhere, which is pixel-identical to the CSS
  background — an empty board and a broken backend look the same. Force constant colours in the
  fragment shader to tell them apart, and check a clear colour only with the present pass disabled.
- `?backend=` and `?thread=main` isolate backend bugs from worker-transport bugs.

## GitHub Pages

- Pages source must be set to "GitHub Actions".
- Workflow: `actions/checkout@v7` → `actions/setup-node@v7` (`node-version: lts/*`, `cache: npm`) → `actions/configure-pages@v6` → build → `actions/upload-pages-artifact@v5` (`path: ./dist`) → `actions/deploy-pages@v5`.
- Requires `permissions: { contents: read, pages: write, id-token: write }` and `concurrency: { group: pages }`.
- Deploy branch for this project is `master`.

## Packed state layout

Both backends must match this layout exactly.

- 1 bit per cell, 32 cells per `u32`. Bit `i` of word `w` is cell `x = w * 32 + i`.
- Row stride `wordsPerRow = ceil(cols / 32)`; a ragged last word keeps its unused high bits zero,
  enforced by a tail mask after every step.
- Horizontal neighbours come from shifting the centre word and injecting one edge bit taken at
  `firstX - 1` and `firstX + wordBits`, both taken modulo `cols` so wrap is exact for ragged rows.
- Neighbour counts use SWAR full-adders: `sum3` over each row triple, then combine into count bit
  planes `b0..b3`.
- Rules are two 9-bit masks; bit `k` means neighbour count `k`. Conway is `birth = 1 << 3`,
  `survive = (1 << 2) | (1 << 3)`.
- XOR strokes need three buffers: state, a stroke base copied at pointer-down, and an accumulating
  mask; state is rewritten as `base ^ mask`.

## Project conventions

- Comments and docs: minimal, utilitarian, fact-based. No explanatory prose, no incident notes.
- Zero React in the frame path — engine state lives in the worker, UI state in Zustand, stats pushed at 8Hz.
- Shaders live in `.wgsl`/`.glsl` files imported with `?raw`.
