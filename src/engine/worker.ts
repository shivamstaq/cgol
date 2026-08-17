import { Runtime } from './runtime';
import type { EngineToMain, MainToEngine } from './protocol';

interface WorkerScope {
  postMessage(message: EngineToMain): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<MainToEngine>) => void): void;
}

const scope = globalThis as unknown as WorkerScope;
const emit = (message: EngineToMain) => scope.postMessage(message);

let runtime: Runtime | null = null;

scope.addEventListener('message', (event) => {
  const message = event.data;

  switch (message.type) {
    case 'init':
      runtime = new Runtime(message.canvas, emit);
      void runtime.init(message.viewport, message.preferred);
      break;

    case 'viewport':
      runtime?.setViewport(message.viewport);
      break;

    case 'dispose':
      runtime?.dispose();
      runtime = null;
      break;
  }
});
