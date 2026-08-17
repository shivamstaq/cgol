import { useStore } from '../store/store';

export function Readout() {
  const mode = useStore((s) => s.mode);
  const backend = useStore((s) => s.backend);
  const device = useStore((s) => s.device);
  const simulates = useStore((s) => s.simulates);
  const speed = useStore((s) => s.speed);
  const stats = useStore((s) => s.stats);
  const fatal = useStore((s) => s.fatal);

  return (
    <div className="pointer-events-none fixed top-4 left-4 rounded-md border border-border bg-surface/95 px-3 py-2 text-xs leading-5 text-muted shadow-lg">
      {fatal ? (
        <p className="text-death">{fatal}</p>
      ) : (
        <>
          <Row label="mode" value={mode} accent={mode === 'running'} />
          <Row label="backend" value={backend ?? 'starting…'} />
          <Row label="device" value={device || '—'} />
          <Row label="grid" value={stats ? `${stats.cols} × ${stats.rows}` : '—'} />
          <Row label="cells" value={stats ? stats.cells.toLocaleString() : '—'} />
          <Row label="gen" value={stats ? stats.generation.toLocaleString() : '—'} />
          <Row
            label="gen/s"
            value={`${stats ? stats.generationsPerSecond.toFixed(0) : '—'}${speed.turbo ? ' turbo' : ''}`}
            accent={speed.turbo}
          />
          <Row
            label="fps"
            value={stats ? `${stats.fps.toFixed(0)} (${stats.frameMs.toFixed(1)} ms)` : '—'}
          />
          <p className="mt-2 text-[11px] text-muted/70">
            drag to draw · space {simulates ? 'run/draw' : '(sim needs webgpu)'} · → step · r reset
            · c clear · t turbo
          </p>
        </>
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <p className="flex gap-3">
      <span className="w-14 shrink-0">{label}</span>
      <span className={accent ? 'text-alive' : 'text-text'}>{value}</span>
    </p>
  );
}
