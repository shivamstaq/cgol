import type { EngineCommand } from './dispatch';
import { dispatch } from './dispatch';
import type { BackendKind, EngineToMain, ViewportSpec } from './protocol';
import type { Runtime } from './runtime';

export interface EngineHandle {
  send(command: EngineCommand): void;
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
  worker.addEventListener('message', (event: MessageEvent<EngineToMain>) => {
    onEvent(event.data);
  });
  worker.addEventListener('error', (event) => {
    onEvent({ type: 'fatal', message: event.message || 'worker error' });
  });

  const offscreen = canvas.transferControlToOffscreen();
  worker.postMessage({ type: 'init', canvas: offscreen, viewport, preferred }, [offscreen]);

  return {
    send(command) {
      worker.postMessage(command);
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
  let disposed = false;
  const queued: EngineCommand[] = [];

  const start = async () => {
    const { Runtime: RuntimeClass } = await import('./runtime');
    if (disposed) return;

    const instance = new RuntimeClass(canvas, onEvent);
    await instance.init(viewport, preferred);
    if (disposed) {
      instance.dispose();
      return;
    }

    runtime = instance;
    for (const command of queued.splice(0)) dispatch(instance, command);
  };

  void start().catch((error: unknown) => {
    onEvent({ type: 'fatal', message: String(error) });
  });

  return {
    send(command) {
      if (runtime) {
        dispatch(runtime, command);
      } else {
        queued.push(command);
      }
    },
    dispose() {
      disposed = true;
      runtime?.dispose();
      runtime = null;
    },
  };
}
