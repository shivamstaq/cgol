import { send } from '../../engine/bridge';
import type { FillKind } from '../../engine/pack';
import { PATTERNS } from '../../engine/patterns';
import { useStore } from '../../store/store';
import { pasteRle, requestCopy } from '../clipboard';
import { Field, Slider } from '../Popover';
import { useState } from 'react';

const FILLS: { kind: FillKind; label: string }[] = [
  { kind: 'random', label: 'Random' },
  { kind: 'symmetric', label: 'Symmetric' },
  { kind: 'blob', label: 'Centre blob' },
];

export function PresetsPanel() {
  const setArmed = useStore((s) => s.setArmed);
  const [density, setDensity] = useState(0.25);

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-1">
        {PATTERNS.map((pattern) => (
          <button
            key={pattern.name}
            type="button"
            onClick={() => {
              setArmed({ name: pattern.name, rle: pattern.rle });
            }}
            className="rounded px-2 py-1 text-left text-xs text-muted transition-colors hover:bg-border/60 hover:text-text"
          >
            {pattern.name}
          </button>
        ))}
      </div>

      <p className="mb-1 text-[11px] tracking-wide text-muted uppercase">fill</p>
      <Field label={`${Math.round(density * 100)}%`}>
        <Slider value={density} min={0.05} max={0.6} step={0.05} onChange={setDensity} />
      </Field>
      <div className="mb-3 flex gap-1">
        {FILLS.map((fill) => (
          <button
            key={fill.kind}
            type="button"
            onClick={() => {
              send({ type: 'fill', kind: fill.kind, density });
            }}
            className="flex-1 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-border/60 hover:text-text"
          >
            {fill.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1">
        <button
          type="button"
          onClick={requestCopy}
          className="flex-1 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-border/60 hover:text-text"
        >
          Copy RLE
        </button>
        <button
          type="button"
          onClick={() => {
            send({ type: 'requestPng' });
          }}
          className="flex-1 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-border/60 hover:text-text"
        >
          Save PNG
        </button>
        <button
          type="button"
          onClick={pasteRle}
          className="flex-1 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-border/60 hover:text-text"
        >
          Paste RLE
        </button>
      </div>
    </>
  );
}
