import { useEffect, useRef } from 'react';
import { createEngine, type EngineHandle } from './engine/client';
import type { EngineToMain, Point } from './engine/protocol';
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

    const push = () =>
      engine.send({ type: 'viewport', viewport: readViewport(host, useStore.getState().cellSize) });
    const observer = new ResizeObserver(push);
    observer.observe(host);
    const unwatchDpr = watchDevicePixelRatio(push);

    const at = (event: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      engine.send({ type: 'strokeStart', point: at(event) });
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!canvas.hasPointerCapture(event.pointerId)) return;
      const events = event.getCoalescedEvents?.() ?? [event];
      engine.send({ type: 'strokeMove', points: events.map(at) });
    };

    const onPointerUp = (event: PointerEvent) => {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      engine.send({ type: 'strokeEnd' });
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case ' ':
          event.preventDefault();
          engine.send({
            type: 'mode',
            mode: useStore.getState().mode === 'running' ? 'drawing' : 'running',
          });
          break;
        case 'ArrowRight':
          engine.send({ type: 'step' });
          break;
        case 'r':
          engine.send({ type: 'reset' });
          break;
        case 'c':
          engine.send({ type: 'clear' });
          break;
        case 't': {
          const speed = useStore.getState().speed;
          const next = { ...speed, turbo: !speed.turbo };
          useStore.getState().setSpeed(next);
          engine.send({ type: 'speed', speed: next });
          break;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      observer.disconnect();
      unwatchDpr();
      window.removeEventListener('keydown', onKeyDown);
      engine.dispose();
      engineRef.current = null;
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (host) {
      engineRef.current?.send({ type: 'viewport', viewport: readViewport(host, cellSize) });
    }
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
      store.setReady(event.backend, event.device, event.simulates);
      break;
    case 'mode':
      store.setMode(event.mode);
      break;
    case 'stats':
      store.setStats(event.stats);
      break;
    case 'fatal':
      store.setFatal(event.message);
      break;
  }
}
