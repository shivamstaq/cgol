import type { Backend, GridSpec, RenderCanvas, ResolvedVisuals } from './backend/types';
import { createWebGL2Backend } from './backend/webgl2';
import { createWebGPUBackend } from './backend/webgpu';
import {
  BRUSH_SCATTER_DEFAULT,
  BRUSH_SIZE_DEFAULT,
  GLOW_STRENGTH,
  MAX_CATCHUP_STEPS,
  MAX_DPR,
  MAX_FRAME_DELTA_MS,
  REALLOC_DEBOUNCE_MS,
  RULE_CONWAY,
  SPEED_DEFAULT,
  SPEED_MAX,
  SPEED_MIN,
  STATS_INTERVAL_MS,
  TURBO_FRAME_HIGH_MS,
  TURBO_FRAME_LOW_MS,
  TURBO_STEPS_MAX,
  TURBO_STEPS_MIN,
  TURBO_STEPS_START,
} from './defaults';
import { PALETTES } from './palette';
import type {
  BackendKind,
  BrushSpec,
  EngineToMain,
  Mode,
  Point,
  RuleSpec,
  SpeedSpec,
  ViewportSpec,
  VisualSpec,
} from './protocol';

type Emit = (message: EngineToMain) => void;

export class Runtime {
  readonly #canvas: RenderCanvas;
  readonly #emit: Emit;

  #backend: Backend | null = null;
  #viewport: ViewportSpec | null = null;
  #grid: GridSpec = { cols: 0, rows: 0, cellPx: 1 };

  #mode: Mode = 'drawing';
  #generation = 0;
  #speed: SpeedSpec = { generationsPerSecond: SPEED_DEFAULT, turbo: false };
  #brush: BrushSpec = {
    size: BRUSH_SIZE_DEFAULT,
    shape: 'circle',
    scatter: BRUSH_SCATTER_DEFAULT,
  };
  #rule: RuleSpec = RULE_CONWAY;
  #visuals: VisualSpec = { palette: 'aurora', glow: 'subtle', gridLines: true };

  #accumulator = 0;
  #turboSteps = TURBO_STEPS_START;

  #strokeActive = false;
  #strokeLast: Point | null = null;
  #strokeSeed = 0;

  #reallocTimer: ReturnType<typeof setTimeout> | undefined;
  #frame = 0;
  #frames = 0;
  #frameMs = 0;
  #steps = 0;
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
    backend.setRule(this.#rule);
    backend.setVisuals(resolveVisuals(this.#visuals));
    this.#applyViewport(viewport);
    this.#grid = gridFor(viewport);
    backend.allocate(this.#grid);

    this.#emit({
      type: 'ready',
      backend: backend.kind,
      device: backend.device,
      simulates: backend.simulates,
    });
    this.#frame = requestAnimationFrame(this.#tick);
  }

  setViewport(viewport: ViewportSpec): void {
    this.#applyViewport(viewport);

    clearTimeout(this.#reallocTimer);
    this.#reallocTimer = setTimeout(() => {
      this.#realloc();
    }, REALLOC_DEBOUNCE_MS);
  }

  setMode(mode: Mode): void {
    if (mode === this.#mode) return;

    if (mode === 'running') {
      this.#backend?.snapshotSeed();
      this.#generation = 0;
      this.#accumulator = 0;
      this.#strokeActive = false;
      this.#strokeLast = null;
    }

    this.#mode = mode;
    this.#emit({ type: 'mode', mode });
  }

  setSpeed(speed: SpeedSpec): void {
    this.#speed = speed;
    this.#accumulator = 0;
  }

  setBrush(brush: BrushSpec): void {
    this.#brush = brush;
  }

  setRule(rule: RuleSpec): void {
    this.#rule = rule;
    this.#backend?.setRule(rule);
  }

  setVisuals(visuals: VisualSpec): void {
    this.#visuals = visuals;
    this.#backend?.setVisuals(resolveVisuals(visuals));
  }

  strokeStart(point: Point): void {
    const backend = this.#backend;
    if (!backend) return;

    this.setMode('drawing');
    this.#strokeSeed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    backend.beginStroke();
    this.#strokeActive = true;

    const cell = this.#toCell(point);
    this.#strokeLast = cell;
    this.#stamp(cell, cell);
  }

  strokeMove(points: readonly Point[]): void {
    if (!this.#strokeActive) return;

    for (const point of points) {
      const cell = this.#toCell(point);
      this.#stamp(this.#strokeLast ?? cell, cell);
      this.#strokeLast = cell;
    }
  }

  strokeEnd(): void {
    this.#strokeActive = false;
    this.#strokeLast = null;
  }

  stepOnce(): void {
    this.setMode('drawing');
    this.#backend?.advance(1);
    this.#generation += 1;
    this.#steps += 1;
  }

  reset(): void {
    this.setMode('drawing');
    this.#backend?.restoreSeed();
    this.#generation = 0;
  }

  clear(): void {
    this.setMode('drawing');
    this.#backend?.clear();
    this.#generation = 0;
  }

  dispose(): void {
    this.#disposed = true;
    clearTimeout(this.#reallocTimer);
    cancelAnimationFrame(this.#frame);
    this.#backend?.dispose();
    this.#backend = null;
  }

  async #selectBackend(preferred: BackendKind | null): Promise<Backend | null> {
    const onLost = (reason: string) => this.#emit({ type: 'fatal', message: `WebGPU: ${reason}` });

    if (preferred === 'webgl2') return createWebGL2Backend(this.#canvas);
    if (preferred === 'webgpu') return createWebGPUBackend(this.#canvas, onLost);

    return (await createWebGPUBackend(this.#canvas, onLost)) ?? createWebGL2Backend(this.#canvas);
  }

  #applyViewport(viewport: ViewportSpec): void {
    this.#viewport = viewport;

    const dpr = Math.min(viewport.dpr, MAX_DPR);
    const width = Math.max(1, Math.round(viewport.cssWidth * dpr));
    const height = Math.max(1, Math.round(viewport.cssHeight * dpr));

    this.#canvas.width = width;
    this.#canvas.height = height;
    this.#backend?.resizeSurface(width, height);
  }

  /** Centre-anchored reallocation; a running board pauses and reverts to its seed. */
  #realloc(): void {
    const viewport = this.#viewport;
    const backend = this.#backend;
    if (!viewport || !backend) return;

    this.#grid = gridFor(viewport);
    backend.allocate(this.#grid);
    backend.setVisuals(resolveVisuals(this.#visuals));

    if (this.#strokeActive) {
      backend.beginStroke();
      this.#strokeLast = null;
    }

    if (this.#mode === 'running') {
      backend.restoreSeed();
      this.#generation = 0;
      this.setMode('drawing');
    }
  }

  #toCell(point: Point): Point {
    const cellSize = this.#viewport?.cellSize ?? 1;
    return { x: point.x / cellSize, y: point.y / cellSize };
  }

  #stamp(from: Point, to: Point): void {
    this.#backend?.stamp({
      x0: from.x,
      y0: from.y,
      x1: to.x,
      y1: to.y,
      radius: this.#brush.size / 2,
      shape: this.#brush.shape === 'square' ? 1 : 0,
      scatter: this.#brush.scatter,
      seed: this.#strokeSeed,
    });
  }

  #pendingSteps(delta: number): number {
    if (this.#speed.turbo) {
      if (delta > 0 && delta < TURBO_FRAME_LOW_MS) {
        this.#turboSteps = Math.min(TURBO_STEPS_MAX, Math.ceil(this.#turboSteps * 1.15));
      } else if (delta > TURBO_FRAME_HIGH_MS) {
        this.#turboSteps = Math.max(TURBO_STEPS_MIN, Math.floor(this.#turboSteps * 0.85));
      }
      return this.#turboSteps;
    }

    const rate = Math.min(SPEED_MAX, Math.max(SPEED_MIN, this.#speed.generationsPerSecond));
    const period = 1000 / rate;
    this.#accumulator += delta;

    let steps = 0;
    while (this.#accumulator >= period && steps < MAX_CATCHUP_STEPS) {
      steps += 1;
      this.#accumulator -= period;
    }
    if (this.#accumulator > period) this.#accumulator = 0;

    return steps;
  }

  readonly #tick = (now: number): void => {
    const backend = this.#backend;
    if (this.#disposed || !backend) return;
    this.#frame = requestAnimationFrame(this.#tick);

    const raw = this.#lastFrameAt > 0 ? now - this.#lastFrameAt : 0;
    if (raw > 0) {
      this.#frames += 1;
      this.#frameMs += raw;
    }
    this.#lastFrameAt = now;

    let stepped = false;
    if (this.#mode === 'running' && backend.simulates) {
      const steps = this.#pendingSteps(Math.min(raw, MAX_FRAME_DELTA_MS));
      if (steps > 0) {
        backend.advance(steps);
        this.#generation += steps;
        this.#steps += steps;
        stepped = true;
      }
    }

    backend.render(Math.min(raw, MAX_FRAME_DELTA_MS), stepped);

    if (now - this.#statsAt >= STATS_INTERVAL_MS) {
      this.#pushStats(now);
    }
  };

  #pushStats(now: number): void {
    const elapsed = now - this.#statsAt;
    const frames = this.#frames;
    const steps = this.#steps;
    const frameMs = frames > 0 ? this.#frameMs / frames : 0;

    this.#statsAt = now;
    this.#frames = 0;
    this.#frameMs = 0;
    this.#steps = 0;

    if (elapsed <= 0 || frames === 0) return;

    this.#emit({
      type: 'stats',
      stats: {
        fps: (frames * 1000) / elapsed,
        frameMs,
        cols: this.#grid.cols,
        rows: this.#grid.rows,
        cells: this.#grid.cols * this.#grid.rows,
        generation: this.#generation,
        generationsPerSecond: (steps * 1000) / elapsed,
      },
    });
  }
}

function resolveVisuals(visuals: VisualSpec): ResolvedVisuals {
  return {
    palette: PALETTES[visuals.palette],
    glow: GLOW_STRENGTH[visuals.glow],
    gridLines: visuals.gridLines,
  };
}

function gridFor(viewport: ViewportSpec): GridSpec {
  const dpr = Math.min(viewport.dpr, MAX_DPR);
  return {
    cols: Math.max(1, Math.ceil(viewport.cssWidth / viewport.cellSize)),
    rows: Math.max(1, Math.ceil(viewport.cssHeight / viewport.cellSize)),
    cellPx: viewport.cellSize * dpr,
  };
}
