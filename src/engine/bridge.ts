import type { EngineCommand } from './dispatch';
import type { EngineHandle } from './client';

let handle: EngineHandle | null = null;

export function setEngine(next: EngineHandle | null): void {
  handle = next;
}

export function send(command: EngineCommand): void {
  handle?.send(command);
}
