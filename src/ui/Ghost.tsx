import { useEffect, useRef } from 'react';
import { PALETTES } from '../engine/palette';
import { parseRle } from '../engine/rle';
import { useStore } from '../store/store';

/** Preview of the armed pattern, tracking the pointer. */
export function Ghost() {
  const armed = useStore((s) => s.armed);
  const cellSize = useStore((s) => s.cellSize);
  const palette = useStore((s) => s.visuals.palette);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !armed) return;

    const pattern = parseRle(armed.rle);
    const context = canvas.getContext('2d');
    if (!pattern || !context) return;

    canvas.width = pattern.width * cellSize;
    canvas.height = pattern.height * cellSize;

    const [r, g, b] = PALETTES[palette].alive;
    context.fillStyle = `rgba(${r * 255}, ${g * 255}, ${b * 255}, 0.65)`;

    for (let y = 0; y < pattern.height; y += 1) {
      for (let x = 0; x < pattern.width; x += 1) {
        if (pattern.cells[y * pattern.width + x] === 1) {
          context.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
        }
      }
    }
  }, [armed, cellSize, palette]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !armed) return undefined;

    const move = (event: PointerEvent) => {
      canvas.style.transform = `translate(${event.clientX - canvas.width / 2}px, ${
        event.clientY - canvas.height / 2
      }px)`;
    };

    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointermove', move);
    };
  }, [armed]);

  if (!armed) return null;

  return (
    <canvas
      ref={ref}
      className="pointer-events-none fixed top-0 left-0 z-10 opacity-80"
      aria-hidden
    />
  );
}
