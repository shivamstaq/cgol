import { useEffect, useRef } from 'react';
import { send, setEngine } from './engine/bridge';
import { createEngine, type EngineHandle } from './engine/client';
import type { EngineToMain, GlowLevel, Point } from './engine/protocol';
import { flip, parseRle, rotate, toRle } from './engine/rle';
import { parseRule } from './engine/rules';
import {
  forceInline,
  preferredBackend,
  readViewport,
  watchDevicePixelRatio,
} from './engine/viewport';
import { loadBoard, saveBoard } from './store/persist';
import { useStore } from './store/store';
import { consumeCopy, pasteRle, requestCopy, savePng } from './ui/clipboard';
import { Dock, toggleFullscreen } from './ui/Dock';
import { Ghost } from './ui/Ghost';
import { applyPalette } from './ui/theme';

const GLOW_CYCLE: GlowLevel[] = ['off', 'subtle', 'full'];
const AUTOSAVE_MS = 5000;

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const cellSize = useStore((s) => s.cellSize);
  const palette = useStore((s) => s.visuals.palette);
  const fatal = useStore((s) => s.fatal);

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
    setEngine(engine);

    const push = () =>
      engine.send({ type: 'viewport', viewport: readViewport(host, useStore.getState().cellSize) });
    const observer = new ResizeObserver(push);
    observer.observe(host);
    const unwatchDpr = watchDevicePixelRatio(push);

    const at = (event: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const touches = new Map<number, PointerEvent>();
    let pinch: { distance: number; cellSize: number } | null = null;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') touches.set(event.pointerId, event);
      if (touches.size === 2) {
        pinch = { distance: spread(touches), cellSize: useStore.getState().cellSize };
        return;
      }
      if (event.button !== 0) return;

      const armed = useStore.getState().armed;
      if (armed) {
        engine.send({ type: 'stampPattern', rle: armed.rle, point: at(event) });
        return;
      }

      canvas.setPointerCapture(event.pointerId);
      engine.send({ type: 'strokeStart', point: at(event) });
    };

    const onPointerMove = (event: PointerEvent) => {
      if (touches.has(event.pointerId)) touches.set(event.pointerId, event);

      if (pinch && touches.size === 2) {
        const ratio = spread(touches) / pinch.distance;
        useStore.getState().setCellSize(pinch.cellSize * ratio);
        return;
      }

      if (!canvas.hasPointerCapture(event.pointerId)) return;
      const coalesced = event.getCoalescedEvents?.() ?? [event];
      engine.send({ type: 'strokeMove', points: coalesced.map(at) });
    };

    const onPointerUp = (event: PointerEvent) => {
      touches.delete(event.pointerId);
      if (touches.size < 2) pinch = null;

      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      engine.send({ type: 'strokeEnd' });
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const store = useStore.getState();
      const delta = event.deltaY < 0 ? 1 : -1;

      if (event.ctrlKey) {
        store.setCellSize(store.cellSize + delta);
      } else {
        store.setBrush({ size: store.brush.size + delta });
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;

      const store = useStore.getState();

      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'c') requestCopy();
        if (event.key === 'v') pasteRle();
        return;
      }

      if (event.repeat || event.altKey) return;

      switch (event.key) {
        case ' ':
          event.preventDefault();
          store.setMode(store.mode === 'running' ? 'drawing' : 'running');
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
        case 'n':
          engine.send({ type: 'fill', kind: 'random', density: 0.25 });
          break;
        case '[':
          store.setBrush({ size: store.brush.size - 1 });
          break;
        case ']':
          store.setBrush({ size: store.brush.size + 1 });
          break;
        case 'b':
          store.setBrush({ shape: store.brush.shape === 'circle' ? 'square' : 'circle' });
          break;
        case 'g':
          store.setVisuals({
            glow:
              GLOW_CYCLE[(GLOW_CYCLE.indexOf(store.visuals.glow) + 1) % GLOW_CYCLE.length] ??
              'subtle',
          });
          break;
        case 'p':
          store.setPanel(store.panel === 'presets' ? null : 'presets');
          break;
        case 'h':
          store.toggleDock();
          break;
        case 'f':
          void toggleFullscreen();
          break;
        case '?':
          store.setPanel(store.panel === 'shortcuts' ? null : 'shortcuts');
          break;
        case 'Escape':
          store.setArmed(null);
          store.setPanel(null);
          break;
        case 'R':
        case 'F': {
          const armed = store.armed;
          const pattern = armed ? parseRle(armed.rle) : null;
          if (!armed || !pattern) break;
          const next = event.key === 'R' ? rotate(pattern) : flip(pattern);
          store.setArmed({ name: armed.name, rle: toRle(next) });
          break;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);

    const autosave = setInterval(() => {
      if (useStore.getState().mode === 'drawing') engine.send({ type: 'requestRle' });
    }, AUTOSAVE_MS);

    return () => {
      clearInterval(autosave);
      observer.disconnect();
      unwatchDpr();
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('wheel', onWheel);
      setEngine(null);
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
      <Ghost />
      <Dock />
      {fatal && (
        <p className="fixed top-4 left-1/2 z-30 -translate-x-1/2 rounded-md border border-death/40 bg-surface px-3 py-2 text-xs text-death">
          {fatal}
        </p>
      )}
    </main>
  );
}

function spread(touches: Map<number, PointerEvent>): number {
  const [first, second] = [...touches.values()];
  if (!first || !second) return 1;
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY) || 1;
}

function handleEngineEvent(event: EngineToMain): void {
  const store = useStore.getState();

  switch (event.type) {
    case 'ready': {
      store.setReady(event.backend, event.device, event.simulates);
      applySettings();
      break;
    }
    case 'mode':
      store.syncMode(event.mode);
      break;
    case 'stats':
      store.setStats(event.stats);
      break;
    case 'rle':
      consumeCopy(event.rle);
      saveBoard(event.rle);
      break;
    case 'png':
      savePng(event.blob);
      break;
    case 'fatal':
      store.setFatal(event.message);
      break;
  }
}

/** Pushes stored settings and the autosaved board once the engine is live. */
function applySettings(): void {
  const store = useStore.getState();
  const rule = parseRule(store.rule);

  send({ type: 'speed', speed: store.speed });
  send({ type: 'brush', brush: store.brush });
  send({ type: 'visuals', visuals: store.visuals });
  if (rule) send({ type: 'rule', rule });

  const board = loadBoard();
  if (board) send({ type: 'loadRle', rle: board });
}
