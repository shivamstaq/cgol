import { useEffect, useRef } from 'react';
import { PALETTE_NAMES } from './engine/palette';
import { createEngine, type EngineHandle } from './engine/client';
import type { EngineToMain, Point, VisualSpec } from './engine/protocol';
import {
  forceInline,
  preferredBackend,
  readViewport,
  watchDevicePixelRatio,
} from './engine/viewport';
import type { GlowLevel } from './engine/protocol';
import { useStore } from './store/store';
import { Readout } from './ui/Readout';
import { applyPalette } from './ui/theme';

const GLOW_CYCLE: GlowLevel[] = ['off', 'subtle', 'full'];

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const cellSize = useStore((s) => s.cellSize);
  const palette = useStore((s) => s.visuals.palette);

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
      forceInline(window.location.search),
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

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const store = useStore.getState();
      store.setCellSize(store.cellSize + (event.deltaY < 0 ? 1 : -1));
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
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
        case 'g':
          cycleVisuals(engine, (visuals) => ({
            ...visuals,
            glow:
              GLOW_CYCLE[(GLOW_CYCLE.indexOf(visuals.glow) + 1) % GLOW_CYCLE.length] ?? 'subtle',
          }));
          break;
        case 'p':
          cycleVisuals(engine, (visuals) => ({
            ...visuals,
            palette:
              PALETTE_NAMES[(PALETTE_NAMES.indexOf(visuals.palette) + 1) % PALETTE_NAMES.length] ??
              'aurora',
          }));
          break;
        case 'l':
          cycleVisuals(engine, (visuals) => ({ ...visuals, gridLines: !visuals.gridLines }));
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.removeEventListener('wheel', onWheel);
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

  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  return (
    <main className="relative h-full w-full bg-bg">
      <div ref={hostRef} className="absolute inset-0" />
      <Readout />
    </main>
  );
}

function cycleVisuals(engine: EngineHandle, next: (visuals: VisualSpec) => VisualSpec): void {
  const visuals = next(useStore.getState().visuals);
  useStore.getState().setVisuals(visuals);
  engine.send({ type: 'visuals', visuals });
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
