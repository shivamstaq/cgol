import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { send } from '../engine/bridge';
import { CELL_SIZE_MAX, CELL_SIZE_MIN, SPEED_MAX, SPEED_MIN } from '../engine/defaults';
import { useStore, type PanelName } from '../store/store';
import {
  BrushIcon,
  ClearIcon,
  DrawIcon,
  FullscreenIcon,
  GripIcon,
  HelpIcon,
  LookIcon,
  MoreIcon,
  PlayIcon,
  PresetsIcon,
  ResetIcon,
  RulesIcon,
  StepIcon,
} from './icons';
import { Popover, Slider } from './Popover';
import { BrushPanel } from './panels/BrushPanel';
import { LookPanel } from './panels/LookPanel';
import { PresetsPanel } from './panels/PresetsPanel';
import { RulesPanel } from './panels/RulesPanel';
import { TelemetryPanel } from './panels/TelemetryPanel';
import { useMediaQuery } from './useMediaQuery';

const MARGIN = 16;
const SNAP = 20;
const IDLE_MS = 3000;
const SPEED_STEPS = 100;

export function Dock() {
  const mode = useStore((s) => s.mode);
  const stats = useStore((s) => s.stats);
  const speed = useStore((s) => s.speed);
  const cellSize = useStore((s) => s.cellSize);
  const dock = useStore((s) => s.dock);
  const hidden = useStore((s) => s.dockHidden);
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const setMode = useStore((s) => s.setMode);
  const setSpeed = useStore((s) => s.setSpeed);
  const setCellSize = useStore((s) => s.setCellSize);
  const setDock = useStore((s) => s.setDock);

  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(dock);
  const [idle, setIdle] = useState(false);
  const compact = useMediaQuery('(max-width: 640px)');

  const clampToViewport = useCallback((next: { x: number; y: number }) => {
    const element = ref.current;
    const width = element?.offsetWidth ?? 0;
    const height = element?.offsetHeight ?? 0;

    return {
      x: Math.min(Math.max(next.x, MARGIN), Math.max(MARGIN, window.innerWidth - width - MARGIN)),
      y: Math.min(Math.max(next.y, MARGIN), Math.max(MARGIN, window.innerHeight - height - MARGIN)),
    };
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return () => undefined;

    const place = () => {
      setPosition((current) => {
        const base = current ?? {
          x: (window.innerWidth - element.offsetWidth) / 2,
          y: window.innerHeight - element.offsetHeight - 24,
        };
        return clampToViewport(base);
      });
    };

    place();
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
    };
  }, [clampToViewport, compact]);

  useEffect(() => {
    if (panel) {
      setIdle(false);
      return () => undefined;
    }

    const timer = setTimeout(() => {
      setIdle(true);
    }, IDLE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [panel, position, mode, speed, cellSize]);

  const startDrag = (event: React.PointerEvent) => {
    const element = ref.current;
    if (!element) return;

    event.preventDefault();
    const offsetX = event.clientX - element.getBoundingClientRect().left;
    const offsetY = event.clientY - element.getBoundingClientRect().top;

    const move = (moveEvent: PointerEvent) => {
      setPosition(
        clampToViewport({ x: moveEvent.clientX - offsetX, y: moveEvent.clientY - offsetY }),
      );
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);

      setPosition((current) => {
        if (!current) return current;
        const snapped = clampToViewport(snap(current, element));
        setDock(snapped);
        return snapped;
      });
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (hidden) return null;

  const flip = (position?.y ?? 0) < window.innerHeight / 2;
  const toggle = (name: PanelName) => {
    setPanel(panel === name ? null : name);
  };

  return (
    <div
      ref={ref}
      style={{ left: position?.x ?? 0, top: position?.y ?? 0 }}
      onPointerEnter={() => {
        setIdle(false);
      }}
      className={`fixed z-20 flex items-center gap-1 rounded-xl border border-border bg-surface px-2 py-1.5 shadow-2xl transition-opacity duration-300 ${
        idle ? 'opacity-70' : 'opacity-100'
      } ${position ? '' : 'invisible'}`}
    >
      <button
        type="button"
        onPointerDown={startDrag}
        aria-label="Move dock"
        className="cursor-grab px-1 text-muted active:cursor-grabbing hover:text-text"
      >
        <GripIcon />
      </button>

      <Divider />

      <Button
        label={mode === 'running' ? 'Pause' : 'Run'}
        active={mode === 'running'}
        onClick={() => {
          setMode(mode === 'running' ? 'drawing' : 'running');
        }}
      >
        {mode === 'running' ? <DrawIcon /> : <PlayIcon />}
      </Button>
      <Button
        label="Step"
        onClick={() => {
          send({ type: 'step' });
        }}
      >
        <StepIcon />
      </Button>
      <Button
        label="Reset"
        onClick={() => {
          send({ type: 'reset' });
        }}
      >
        <ResetIcon />
      </Button>
      <Button
        label="Clear"
        onClick={() => {
          send({ type: 'clear' });
        }}
      >
        <ClearIcon />
      </Button>

      {!compact && (
        <>
          <Divider />
          <Trigger
            label="Brush"
            active={panel === 'brush'}
            onClick={() => {
              toggle('brush');
            }}
          >
            <BrushIcon />
          </Trigger>

          <Divider />
          <div className="flex w-32 items-center gap-2 px-1">
            <Slider
              value={speed.turbo ? SPEED_STEPS + 1 : toSlider(speed.generationsPerSecond)}
              min={0}
              max={SPEED_STEPS + 1}
              onChange={(value) => {
                setSpeed(
                  value > SPEED_STEPS
                    ? { ...speed, turbo: true }
                    : { generationsPerSecond: fromSlider(value), turbo: false },
                );
              }}
            />
            <span className="w-12 shrink-0 text-[11px] text-muted tabular-nums">
              {speed.turbo ? 'turbo' : `${format(speed.generationsPerSecond)}/s`}
            </span>
          </div>

          <Divider />
          <div className="flex w-24 items-center gap-2 px-1">
            <Slider
              value={cellSize}
              min={CELL_SIZE_MIN}
              max={CELL_SIZE_MAX}
              onChange={setCellSize}
            />
            <span className="w-6 shrink-0 text-[11px] text-muted tabular-nums">{cellSize}</span>
          </div>
        </>
      )}

      <Divider />
      {compact ? (
        <Trigger
          label="More"
          active={panel === 'presets'}
          onClick={() => {
            toggle('presets');
          }}
        >
          <MoreIcon />
        </Trigger>
      ) : (
        <>
          <Trigger
            label="Presets"
            active={panel === 'presets'}
            onClick={() => {
              toggle('presets');
            }}
          >
            <PresetsIcon />
          </Trigger>
          <Trigger
            label="Rules"
            active={panel === 'rules'}
            onClick={() => {
              toggle('rules');
            }}
          >
            <RulesIcon />
          </Trigger>
          <Trigger
            label="Appearance"
            active={panel === 'look'}
            onClick={() => {
              toggle('look');
            }}
          >
            <LookIcon />
          </Trigger>
        </>
      )}

      <Divider />
      <button
        type="button"
        onClick={() => {
          toggle('telemetry');
        }}
        className="rounded px-2 py-1 text-[11px] text-muted tabular-nums transition-colors hover:bg-border/60 hover:text-text"
      >
        {stats
          ? `${stats.fps.toFixed(0)} fps · ${format(stats.generationsPerSecond)} gen/s · ${stats.generation.toLocaleString()} · ${stats.population.toLocaleString()} cells`
          : 'starting…'}
      </button>

      {!compact && (
        <>
          <Divider />
          <Button
            label="Fullscreen"
            onClick={() => {
              void toggleFullscreen();
            }}
          >
            <FullscreenIcon />
          </Button>
          <Button
            label="Shortcuts"
            onClick={() => {
              toggle('shortcuts');
            }}
          >
            <HelpIcon />
          </Button>
        </>
      )}

      {panel && (
        <Popover
          title={panel === 'look' ? 'appearance' : panel}
          flip={flip}
          onClose={() => {
            setPanel(null);
          }}
        >
          {panel === 'brush' && <BrushPanel />}
          {panel === 'presets' && <PresetsPanel />}
          {panel === 'rules' && <RulesPanel />}
          {panel === 'look' && <LookPanel />}
          {panel === 'telemetry' && <TelemetryPanel />}
          {panel === 'shortcuts' && <ShortcutList />}
        </Popover>
      )}
    </div>
  );
}

function Button({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded p-1.5 transition-colors ${
        active ? 'bg-alive/15 text-alive' : 'text-muted hover:bg-border/60 hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

const Trigger = Button;

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}

function ShortcutList() {
  const rows: [string, string][] = [
    ['space', 'run / draw'],
    ['→', 'step'],
    ['r', 'reset to seed'],
    ['c', 'clear'],
    ['n', 'random fill'],
    ['[ ]', 'brush size'],
    ['b', 'brush shape'],
    ['g', 'cycle glow'],
    ['p', 'presets'],
    ['h', 'hide dock'],
    ['f', 'fullscreen'],
    ['wheel', 'brush size'],
    ['ctrl+wheel', 'cell size'],
    ['ctrl+c / ctrl+v', 'copy / paste RLE'],
    ['esc', 'close / disarm'],
    ['?', 'this list'],
  ];

  return (
    <div className="space-y-1 text-xs text-muted">
      {rows.map(([key, action]) => (
        <p key={key} className="flex justify-between gap-3">
          <span className="font-mono text-text">{key}</span>
          <span>{action}</span>
        </p>
      ))}
    </div>
  );
}

export async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await document.documentElement.requestFullscreen();
  }
}

function snap(position: { x: number; y: number }, element: HTMLElement) {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const centreX = (window.innerWidth - width) / 2;
  const centreY = (window.innerHeight - height) / 2;
  const right = window.innerWidth - width - MARGIN;
  const bottom = window.innerHeight - height - MARGIN;

  const nearest = (value: number, targets: number[]) =>
    targets.find((target) => Math.abs(value - target) < SNAP) ?? value;

  return {
    x: nearest(position.x, [MARGIN, centreX, right]),
    y: nearest(position.y, [MARGIN, centreY, bottom]),
  };
}

function toSlider(generationsPerSecond: number): number {
  const ratio = Math.log(generationsPerSecond / SPEED_MIN) / Math.log(SPEED_MAX / SPEED_MIN);
  return Math.round(ratio * SPEED_STEPS);
}

function fromSlider(value: number): number {
  return SPEED_MIN * (SPEED_MAX / SPEED_MIN) ** (value / SPEED_STEPS);
}

function format(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}
