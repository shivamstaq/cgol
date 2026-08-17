import { useEffect, useRef } from 'react';
import { useStore } from '../../store/store';

const HISTORY = 60;

export function TelemetryPanel() {
  const backend = useStore((s) => s.backend);
  const device = useStore((s) => s.device);
  const stats = useStore((s) => s.stats);
  const history = useRef<number[]>([]);

  useEffect(() => {
    if (!stats) return;
    history.current = [...history.current, stats.frameMs].slice(-HISTORY);
  }, [stats]);

  const frames = history.current;
  const peak = Math.max(20, ...frames);

  return (
    <div className="space-y-1 text-xs text-muted">
      <Line label="backend" value={backend ?? '—'} />
      <Line label="device" value={device || '—'} />
      <Line label="grid" value={stats ? `${stats.cols} × ${stats.rows}` : '—'} />
      <Line label="cells" value={stats ? stats.cells.toLocaleString() : '—'} />
      <Line
        label="cells/s"
        value={stats ? formatRate(stats.generationsPerSecond * stats.cells) : '—'}
      />
      <Line label="frame" value={stats ? `${stats.frameMs.toFixed(1)} ms` : '—'} />

      <svg viewBox={`0 0 ${HISTORY} 24`} preserveAspectRatio="none" className="mt-2 h-8 w-full">
        <polyline
          points={frames
            .map((value, index) => `${index},${24 - Math.min(24, (value / peak) * 24)}`)
            .join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="text-alive"
        />
      </svg>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="truncate text-text">{value}</span>
    </p>
  );
}

function formatRate(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}
