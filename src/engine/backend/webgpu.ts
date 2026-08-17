import { BACKGROUND } from '../palette';
import { getWebGPUContext, type Backend, type RenderCanvas } from './types';

export async function createWebGPUBackend(
  canvas: RenderCanvas,
  onLost: (reason: string) => void,
): Promise<Backend | null> {
  const gpu = navigator.gpu;
  if (!gpu) return null;

  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return null;

  const device = await adapter.requestDevice();
  const context = getWebGPUContext(canvas);
  if (!context) {
    device.destroy();
    return null;
  }

  const format = gpu.getPreferredCanvasFormat();
  const configure = () => context.configure({ device, format, alphaMode: 'opaque' });
  configure();

  let alive = true;
  void device.lost.then((info) => {
    if (alive) onLost(info.message || 'device lost');
    return info;
  });

  const info = adapter.info;
  const adapterLabel = [info?.vendor, info?.architecture, info?.description]
    .filter(Boolean)
    .join(' ')
    .trim();

  const [r, g, b, a] = BACKGROUND;

  return {
    kind: 'webgpu',
    device: adapterLabel || 'webgpu adapter',

    resize() {
      configure();
    },

    render() {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r, g, b, a },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.end();
      device.queue.submit([encoder.finish()]);
    },

    dispose() {
      alive = false;
      context.unconfigure();
      device.destroy();
    },
  };
}
