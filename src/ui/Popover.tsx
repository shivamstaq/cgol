import { useEffect, useRef, type ReactNode } from 'react';

interface PopoverProps {
  title: string;
  flip: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Popover({ title, flip, onClose, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute left-1/2 w-64 -translate-x-1/2 rounded-lg border border-border bg-surface p-3 shadow-xl ${
        flip ? 'top-full mt-2' : 'bottom-full mb-2'
      }`}
    >
      <p className="mb-2 text-[11px] tracking-wide text-muted uppercase">{title}</p>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-2 flex items-center gap-2 text-xs text-muted">
      <span className="w-14 shrink-0">{label}</span>
      {children}
    </label>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => {
        onChange(Number(event.target.value));
      }}
      className="h-1 w-full cursor-pointer appearance-none rounded bg-border accent-alive"
    />
  );
}

export function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => {
            onChange(option);
          }}
          className={`flex-1 rounded px-2 py-1 text-xs capitalize transition-colors ${
            option === value
              ? 'bg-alive/15 text-alive'
              : 'text-muted hover:bg-border/60 hover:text-text'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
