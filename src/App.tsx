import { useEffect, useRef } from 'react';
import { createEngine, type EngineHandle } from './engine/client';
import type { EngineToMain } from './engine/protocol';
import { preferredBackend, readViewport, watchDevicePixelRatio } from './engine/viewport';
import { useStore } from './store/store';
import { Readout } from './ui/Readout';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const cellSize = useStore((s) => s.cellSize);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full touch-none';
    host.append(canvas);

    const engine = createEngine(
      canvas,
      readViewport(host, useStore.getState().cellSize),
      preferredBackend(window.location.search),
      handleEngineEvent,
    );
    engineRef.current = engine;

    const push = () => engine.setViewport(readViewport(host, useStore.getState().cellSize));
    const observer = new ResizeObserver(push);
    observer.observe(host);
    const unwatchDpr = watchDevicePixelRatio(push);

    return () => {
      observer.disconnect();
      unwatchDpr();
      engine.dispose();
      engineRef.current = null;
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (host) engineRef.current?.setViewport(readViewport(host, cellSize));
  }, [cellSize]);

  return (
    <main className="relative h-full w-full bg-bg">
      <div ref={hostRef} className="absolute inset-0" />
      <Readout />
    </main>
  );
}

function handleEngineEvent(event: EngineToMain): void {
  const store = useStore.getState();

  switch (event.type) {
    case 'ready':
      store.setReady(event.backend, event.device);
      break;
    case 'stats':
      store.setStats(event.stats);
      break;
    case 'fatal':
      store.setFatal(event.message);
      break;
  }
}
