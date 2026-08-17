import type { BackendKind } from '../protocol';

export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface Backend {
  readonly kind: BackendKind;
  readonly device: string;
  /** Device pixels. */
  resize(width: number, height: number): void;
  render(): void;
  dispose(): void;
}

function isOffscreen(canvas: RenderCanvas): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas;
}

export function getWebGPUContext(canvas: RenderCanvas): GPUCanvasContext | null {
  return isOffscreen(canvas) ? canvas.getContext('webgpu') : canvas.getContext('webgpu');
}

export function getWebGL2Context(
  canvas: RenderCanvas,
  attributes: WebGLContextAttributes,
): WebGL2RenderingContext | null {
  return isOffscreen(canvas)
    ? canvas.getContext('webgl2', attributes)
    : canvas.getContext('webgl2', attributes);
}
