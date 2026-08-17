import { dispatch, type EngineCommand } from './dispatch';
import type { EngineToMain, MainToEngine } from './protocol';
import { Runtime } from './runtime';

interface WorkerScope {
  postMessage(message: EngineToMain): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<MainToEngine>) => void): void;
}

const scope = globalThis as unknown as WorkerScope;
const emit = (message: EngineToMain) => {
  scope.postMessage(message);
};

let runtime: Runtime | null = null;
let disposed = false;
const queued: EngineCommand[] = [];

const start = async (canvas: OffscreenCanvas, message: Extract<MainToEngine, { type: 'init' }>) => {
  const instance = new Runtime(canvas, emit);
  await instance.init(message.viewport, message.preferred);

  if (disposed) {
    instance.dispose();
    return;
  }

  runtime = instance;
  for (const command of queued.splice(0)) dispatch(instance, command);
};

scope.addEventListener('message', (event) => {
  const message = event.data;

  if (message.type === 'init') {
    void start(message.canvas, message).catch((error: unknown) => {
      emit({ type: 'fatal', message: String(error) });
    });
    return;
  }

  if (message.type === 'dispose') {
    disposed = true;
    runtime?.dispose();
    runtime = null;
    queued.length = 0;
    return;
  }

  if (runtime) {
    dispatch(runtime, message);
  } else {
    queued.push(message);
  }
});
