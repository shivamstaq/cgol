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
- Requires Chromium 113+ / Firefox 141+.

## WebGL2

- Packed state uses `R32UI` textures with `gl.RGBA_INTEGER`-style integer sampling and integer fragment output.
- Async readback: `PIXEL_PACK_BUFFER` + `fenceSync` + `clientWaitSync` polling; never `readPixels` into a sync stall.

## GitHub Pages

- Pages source must be set to "GitHub Actions".
- Workflow: `actions/checkout@v7` → `actions/setup-node@v7` (`node-version: lts/*`, `cache: npm`) → `actions/configure-pages@v6` → build → `actions/upload-pages-artifact@v5` (`path: ./dist`) → `actions/deploy-pages@v5`.
- Requires `permissions: { contents: read, pages: write, id-token: write }` and `concurrency: { group: pages }`.
- Deploy branch for this project is `master`.

## Project conventions

- Comments and docs: minimal, utilitarian, fact-based. No explanatory prose, no incident notes.
- Zero React in the frame path — engine state lives in the worker, UI state in Zustand, stats pushed at 8Hz.
- Shaders live in `.wgsl`/`.glsl` files imported with `?raw`.
