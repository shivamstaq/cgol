import type { BackendKind, EngineToMain, ViewportSpec } from './protocol';
import type { Runtime } from './runtime';

export interface EngineHandle {
  setViewport(viewport: ViewportSpec): void;
  dispose(): void;
}

export function createEngine(
  canvas: HTMLCanvasElement,
  viewport: ViewportSpec,
  preferred: BackendKind | null,
  onEvent: (event: EngineToMain) => void,
): EngineHandle {
  const offscreenSupported =
    typeof Worker !== 'undefined' && typeof canvas.transferControlToOffscreen === 'function';

  return offscreenSupported
    ? createWorkerEngine(canvas, viewport, preferred, onEvent)
    : createInlineEngine(canvas, viewport, preferred, onEvent);
}

function createWorkerEngine(
  canvas: HTMLCanvasElement,
  viewport: ViewportSpec,
  preferred: BackendKind | null,
  onEvent: (event: EngineToMain) => void,
): EngineHandle {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<EngineToMain>) => onEvent(event.data));
  worker.addEventListener('error', (event) =>
    onEvent({ type: 'fatal', message: event.message || 'worker error' }),
  );

  const offscreen = canvas.transferControlToOffscreen();
  worker.postMessage({ type: 'init', canvas: offscreen, viewport, preferred }, [offscreen]);

  return {
    setViewport(next) {
      worker.postMessage({ type: 'viewport', viewport: next });
    },
    dispose() {
      worker.postMessage({ type: 'dispose' });
      worker.terminate();
    },
  };
}

function createInlineEngine(
  canvas: HTMLCanvasElement,
  viewport: ViewportSpec,
  preferred: BackendKind | null,
  onEvent: (event: EngineToMain) => void,
): EngineHandle {
  let runtime: Runtime | null = null;
  let pending = viewport;
  let disposed = false;

  const start = async () => {
    const { Runtime: RuntimeClass } = await import('./runtime');
    if (disposed) return;
    runtime = new RuntimeClass(canvas, onEvent);
    await runtime.init(pending, preferred);
    if (disposed) runtime.dispose();
  };

  void start().catch((error: unknown) => {
    onEvent({ type: 'fatal', message: String(error) });
  });

  return {
    setViewport(next) {
      pending = next;
      runtime?.setViewport(next);
    },
    dispose() {
      disposed = true;
      runtime?.dispose();
      runtime = null;
    },
  };
}
