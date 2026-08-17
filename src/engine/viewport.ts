import { MAX_DPR } from './defaults';
import type { BackendKind, ViewportSpec } from './protocol';

export function readViewport(host: HTMLElement, cellSize: number): ViewportSpec {
  const rect = host.getBoundingClientRect();
  return {
    cssWidth: Math.max(1, rect.width),
    cssHeight: Math.max(1, rect.height),
    dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR),
    cellSize,
  };
}

export function preferredBackend(search: string): BackendKind | null {
  const value = new URLSearchParams(search).get('backend');
  return value === 'webgpu' || value === 'webgl2' ? value : null;
}

/** Forces the main-thread runtime instead of the worker. */
export function forceInline(search: string): boolean {
  return new URLSearchParams(search).get('thread') === 'main';
}

/** Fires when devicePixelRatio changes; re-arms on each change. */
export function watchDevicePixelRatio(onChange: () => void): () => void {
  let query: MediaQueryList | null = null;
  let disposed = false;

  const handle = () => {
    if (disposed) return;
    onChange();
    arm();
  };

  const arm = () => {
    query?.removeEventListener('change', handle);
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener('change', handle);
  };

  arm();

  return () => {
    disposed = true;
    query?.removeEventListener('change', handle);
  };
}
