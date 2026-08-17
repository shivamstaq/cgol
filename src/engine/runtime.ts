import { createWebGL2Backend } from './backend/webgl2';
import { createWebGPUBackend } from './backend/webgpu';
import type { Backend, RenderCanvas } from './backend/types';
import { MAX_DPR, STATS_INTERVAL_MS } from './defaults';
import type { BackendKind, EngineToMain, ViewportSpec } from './protocol';

type Emit = (message: EngineToMain) => void;

export class Runtime {
  readonly #canvas: RenderCanvas;
  readonly #emit: Emit;

  #backend: Backend | null = null;
  #viewport: ViewportSpec | null = null;
  #cols = 0;
  #rows = 0;

  #frame = 0;
  #frames = 0;
  #frameMs = 0;
  #lastFrameAt = 0;
  #statsAt = 0;
  #disposed = false;

  constructor(canvas: RenderCanvas, emit: Emit) {
    this.#canvas = canvas;
    this.#emit = emit;
  }

  async init(viewport: ViewportSpec, preferred: BackendKind | null): Promise<void> {
    const backend = await this.#selectBackend(preferred);
    if (this.#disposed) {
      backend?.dispose();
      return;
    }
    if (!backend) {
      this.#emit({
        type: 'fatal',
        message: preferred
          ? `backend "${preferred}" unavailable`
          : 'neither WebGPU nor WebGL2 is available',
      });
      return;
    }

    this.#backend = backend;
    this.setViewport(viewport);
    this.#emit({ type: 'ready', backend: backend.kind, device: backend.device });
    this.#frame = requestAnimationFrame(this.#tick);
  }

  setViewport(viewport: ViewportSpec): void {
    this.#viewport = viewport;

    const dpr = Math.min(viewport.dpr, MAX_DPR);
    const width = Math.max(1, Math.round(viewport.cssWidth * dpr));
    const height = Math.max(1, Math.round(viewport.cssHeight * dpr));

    this.#canvas.width = width;
    this.#canvas.height = height;
    this.#cols = Math.max(1, Math.ceil(viewport.cssWidth / viewport.cellSize));
    this.#rows = Math.max(1, Math.ceil(viewport.cssHeight / viewport.cellSize));

    this.#backend?.resize(width, height);
  }

  dispose(): void {
    this.#disposed = true;
    cancelAnimationFrame(this.#frame);
    this.#backend?.dispose();
    this.#backend = null;
  }

  async #selectBackend(preferred: BackendKind | null): Promise<Backend | null> {
    const onLost = (reason: string) => this.#emit({ type: 'fatal', message: `WebGPU: ${reason}` });

    if (preferred === 'webgl2') return createWebGL2Backend(this.#canvas);
    if (preferred === 'webgpu') return createWebGPUBackend(this.#canvas, onLost);

    return (
      (await createWebGPUBackend(this.#canvas, onLost)) ?? createWebGL2Backend(this.#canvas)
    );
  }

  readonly #tick = (now: number): void => {
    if (this.#disposed || !this.#backend) return;
    this.#frame = requestAnimationFrame(this.#tick);

    const start = now;
    this.#backend.render();

    if (this.#lastFrameAt > 0) {
      this.#frames += 1;
      this.#frameMs += now - this.#lastFrameAt;
    }
    this.#lastFrameAt = now;

    if (start - this.#statsAt >= STATS_INTERVAL_MS) {
      this.#pushStats(start);
    }
  };

  #pushStats(now: number): void {
    const elapsed = now - this.#statsAt;
    const frames = this.#frames;

    this.#statsAt = now;
    this.#frames = 0;
    const frameMs = frames > 0 ? this.#frameMs / frames : 0;
    this.#frameMs = 0;

    if (!this.#viewport || elapsed <= 0 || frames === 0) return;

    this.#emit({
      type: 'stats',
      stats: {
        fps: (frames * 1000) / elapsed,
        frameMs,
        cols: this.#cols,
        rows: this.#rows,
        cells: this.#cols * this.#rows,
      },
    });
  }
}
