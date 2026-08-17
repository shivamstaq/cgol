import { BRUSH_SIZE_MAX, BRUSH_SIZE_MIN } from '../../engine/defaults';
import { useStore } from '../../store/store';
import { Choice, Field, Slider } from '../Popover';

export function BrushPanel() {
  const brush = useStore((s) => s.brush);
  const setBrush = useStore((s) => s.setBrush);

  return (
    <>
      <Field label="shape">
        <Choice
          options={['circle', 'square'] as const}
          value={brush.shape}
          onChange={(shape) => {
            setBrush({ shape });
          }}
        />
      </Field>
      <Field label={`size ${brush.size}`}>
        <Slider
          title="Brush diameter in cells · [ and ] or the mouse wheel"
          value={brush.size}
          min={BRUSH_SIZE_MIN}
          max={BRUSH_SIZE_MAX}
          onChange={(size) => {
            setBrush({ size });
          }}
        />
      </Field>
      <Field label={`scatter ${Math.round(brush.scatter * 100)}%`}>
        <Slider
          title="Fraction of covered cells that flip · below 100% the brush sprays"
          value={brush.scatter}
          min={0.05}
          max={1}
          step={0.05}
          onChange={(scatter) => {
            setBrush({ scatter });
          }}
        />
      </Field>
    </>
  );
}
