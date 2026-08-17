import type { MainToEngine } from './protocol';
import type { Runtime } from './runtime';

export type EngineCommand = Exclude<MainToEngine, { type: 'init' }>;

export function dispatch(runtime: Runtime, command: EngineCommand): void {
  switch (command.type) {
    case 'viewport':
      runtime.setViewport(command.viewport);
      break;
    case 'mode':
      runtime.setMode(command.mode);
      break;
    case 'speed':
      runtime.setSpeed(command.speed);
      break;
    case 'brush':
      runtime.setBrush(command.brush);
      break;
    case 'rule':
      runtime.setRule(command.rule);
      break;
    case 'visuals':
      runtime.setVisuals(command.visuals);
      break;
    case 'strokeStart':
      runtime.strokeStart(command.point);
      break;
    case 'strokeMove':
      runtime.strokeMove(command.points);
      break;
    case 'strokeEnd':
      runtime.strokeEnd();
      break;
    case 'stampPattern':
      runtime.stampPattern(command.rle, command.point);
      break;
    case 'fill':
      runtime.fill(command.kind, command.density);
      break;
    case 'requestRle':
      runtime.requestRle();
      break;
    case 'requestPng':
      runtime.requestPng();
      break;
    case 'loadRle':
      runtime.loadRle(command.rle);
      break;
    case 'step':
      runtime.stepOnce();
      break;
    case 'reset':
      runtime.reset();
      break;
    case 'clear':
      runtime.clear();
      break;
    case 'dispose':
      runtime.dispose();
      break;
  }
}
