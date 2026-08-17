import { BACKGROUND } from '../palette';
import { getWebGL2Context, type Backend, type RenderCanvas } from './types';

/** Surface-only until M3 brings the packed simulation to WebGL2. */
export function createWebGL2Backend(canvas: RenderCanvas): Backend | null {
  const gl = getWebGL2Context(canvas, {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    desynchronized: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(
    debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  );

  const [r, g, b, a] = BACKGROUND;
  let width = gl.drawingBufferWidth;
  let height = gl.drawingBufferHeight;

  return {
    kind: 'webgl2',
    device: renderer || 'webgl2 context',
    simulates: false,

    resizeSurface(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
    },

    allocate() {},
    setRule() {},
    advance() {},

    render() {
      gl.viewport(0, 0, width, height);
      gl.clearColor(r, g, b, a);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },

    beginStroke() {},
    stamp() {},
    snapshotSeed() {},
    restoreSeed() {},
    clear() {},

    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
