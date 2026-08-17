import { useState } from 'react';
import { send } from '../../engine/bridge';
import type { FillKind } from '../../engine/pack';
import { PATTERNS } from '../../engine/patterns';
import { useStore } from '../../store/store';
import { pasteRle, requestCopy } from '../clipboard';
import { Choice, Hint, Section, Slider } from '../Popover';

const FILL_KINDS: readonly FillKind[] = ['random', 'symmetric', 'blob'];

const FILL_HINTS: Record<FillKind, string> = {
  random: 'Even noise across the whole board.',
  symmetric: 'Mirrored in both axes, so it evolves symmetrically.',
  blob: 'Noise inside a circle at the centre.',
};

export function PresetsPanel() {
  const setArmed = useStore((s) => s.setArmed);
  const armed = useStore((s) => s.armed);
  const [kind, setKind] = useState<FillKind>('random');
  const [density, setDensity] = useState(0.25);

  return (
    <>
      <Hint>
        {armed
          ? `${armed.name} is ready — click the board to place it. R rotates, F flips. Esc, right-click, or click ${armed.name} again to cancel.`
          : 'Pick a pattern, then click the board to place it.'}
      </Hint>

      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        {PATTERNS.map((pattern) => (
          <button
            key={pattern.name}
            type="button"
            onClick={() => {
              setArmed(
                armed?.name === pattern.name ? null : { name: pattern.name, rle: pattern.rle },
              );
            }}
            title={armed?.name === pattern.name ? 'Click again to cancel' : `Place ${pattern.name}`}
            className={`rounded px-2 py-1 text-left text-xs transition-colors ${
              armed?.name === pattern.name
                ? 'bg-alive/20 text-alive'
                : 'text-text/70 hover:bg-border/60 hover:text-text'
            }`}
          >
            {pattern.name}
          </button>
        ))}
      </div>

      <Section label="Fill the board with noise">
        <Choice options={FILL_KINDS} value={kind} onChange={setKind} />
        <Hint>{FILL_HINTS[kind]}</Hint>

        <label className="mb-2 flex items-center gap-2 text-xs text-text/70">
          <span className="w-20 shrink-0 whitespace-nowrap">
            density {Math.round(density * 100)}%
          </span>
          <Slider
            title="Share of cells that start alive"
            value={density}
            min={0.05}
            max={0.6}
            step={0.05}
            onChange={setDensity}
          />
        </label>

        <button
          type="button"
          onClick={() => {
            send({ type: 'fill', kind, density });
          }}
          title="Replaces everything on the board"
          className="w-full rounded bg-alive/15 px-2 py-1.5 text-xs text-alive transition-colors hover:bg-alive/25"
        >
          Replace board with noise
        </button>
      </Section>

      <Section label="Save and share">
        <div className="space-y-0.5">
          <Action
            label="Copy pattern"
            note="RLE · ctrl+c"
            title="Copies the live cells as RLE, the standard Life pattern format"
            onClick={requestCopy}
          />
          <Action
            label="Paste pattern"
            note="RLE · ctrl+v"
            title="Replaces the board with RLE text from your clipboard"
            onClick={pasteRle}
          />
          <Action
            label="Save image"
            note="PNG"
            title="Downloads what is on screen right now"
            onClick={() => {
              send({ type: 'requestPng' });
            }}
          />
        </div>
      </Section>
    </>
  );
}

function Action({
  label,
  note,
  title,
  onClick,
}: {
  label: string;
  note: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex w-full items-baseline justify-between gap-2 rounded px-2 py-1 text-left text-xs whitespace-nowrap text-text/70 transition-colors hover:bg-border/60 hover:text-text"
    >
      <span>{label}</span>
      <span className="text-[10px] text-text/40">{note}</span>
    </button>
  );
}
