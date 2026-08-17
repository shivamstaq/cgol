import { useStore } from '../store/store';

export function Readout() {
  const backend = useStore((s) => s.backend);
  const device = useStore((s) => s.device);
  const stats = useStore((s) => s.stats);
  const fatal = useStore((s) => s.fatal);

  return (
    <div className="pointer-events-none fixed top-4 left-4 rounded-md border border-border bg-surface/95 px-3 py-2 text-xs leading-5 text-muted shadow-lg">
      {fatal ? (
        <p className="text-death">{fatal}</p>
      ) : (
        <>
          <Row label="backend" value={backend ?? 'starting…'} />
          <Row label="device" value={device || '—'} />
          <Row label="grid" value={stats ? `${stats.cols} × ${stats.rows}` : '—'} />
          <Row label="cells" value={stats ? stats.cells.toLocaleString() : '—'} />
          <Row
            label="fps"
            value={stats ? `${stats.fps.toFixed(0)} (${stats.frameMs.toFixed(1)} ms)` : '—'}
          />
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex gap-3">
      <span className="w-14 shrink-0">{label}</span>
      <span className="text-text">{value}</span>
    </p>
  );
}
