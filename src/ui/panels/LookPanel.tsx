import { PALETTE_NAMES } from '../../engine/palette';
import type { GlowLevel } from '../../engine/protocol';
import { useStore } from '../../store/store';
import { Choice, Field } from '../Popover';

const GLOW: readonly GlowLevel[] = ['off', 'subtle', 'full'];

export function LookPanel() {
  const visuals = useStore((s) => s.visuals);
  const setVisuals = useStore((s) => s.setVisuals);

  return (
    <>
      <p className="mb-1 text-xs text-muted">palette</p>
      <div className="mb-3 grid grid-cols-2 gap-1">
        {PALETTE_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              setVisuals({ palette: name });
            }}
            title={`${name} palette — recolours the board and the dock`}
            className={`rounded px-2 py-1 text-left text-xs capitalize transition-colors ${
              name === visuals.palette
                ? 'bg-alive/15 text-alive'
                : 'text-muted hover:bg-border/60 hover:text-text'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <Field label="glow">
        <Choice
          options={GLOW}
          value={visuals.glow}
          onChange={(glow) => {
            setVisuals({ glow });
          }}
        />
      </Field>

      <button
        type="button"
        onClick={() => {
          setVisuals({ gridLines: !visuals.gridLines });
        }}
        title="Grid lines appear once cells are at least 10 pixels"
        className="w-full rounded px-2 py-1 text-left text-xs text-muted transition-colors hover:bg-border/60 hover:text-text"
      >
        grid lines: {visuals.gridLines ? 'on' : 'off'}
      </button>
    </>
  );
}
