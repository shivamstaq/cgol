import { useEffect, useRef, type ReactNode } from 'react';

interface PopoverProps {
  title: string;
  flip: boolean;
  width?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Popover({ title, flip, width = 'w-64', onClose, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      // Dock triggers toggle themselves; closing here would fight their click handler.
      if ((event.target as Element | null)?.closest('[data-dock]')) return;
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
      className={`absolute left-1/2 ${width} -translate-x-1/2 rounded-lg border border-border bg-dock p-3 shadow-2xl ${
        flip ? 'top-full mt-2' : 'bottom-full mb-2'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] tracking-wide text-text/60 uppercase">{title}</p>
        <button
          type="button"
          onClick={onClose}
          title="Close (esc)"
          aria-label="Close"
          className="-mr-1 rounded px-1.5 text-text/50 transition-colors hover:bg-border/60 hover:text-text"
        >
          ×
        </button>
      </div>
      {children}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[11px] leading-4 text-text/50">{children}</p>;
}

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3 border-t border-border/70 pt-3">
      <p className="mb-2 text-[11px] tracking-wide text-text/60 uppercase">{label}</p>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-2 flex items-center gap-2 text-xs text-text/70">
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
  title,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  title?: string;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      title={title}
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
