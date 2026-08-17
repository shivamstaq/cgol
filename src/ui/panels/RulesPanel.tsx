import { useState } from 'react';
import { RULES } from '../../engine/rules';
import { useStore } from '../../store/store';

export function RulesPanel() {
  const rule = useStore((s) => s.rule);
  const setRule = useStore((s) => s.setRule);
  const [draft, setDraft] = useState(rule);
  const [invalid, setInvalid] = useState(false);

  const apply = (notation: string) => {
    setDraft(notation);
    setInvalid(!setRule(notation));
  };

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-1">
        {RULES.map((entry) => (
          <button
            key={entry.notation}
            type="button"
            onClick={() => {
              apply(entry.notation);
            }}
            className={`rounded px-2 py-1 text-left text-xs transition-colors ${
              entry.notation === rule
                ? 'bg-alive/15 text-alive'
                : 'text-muted hover:bg-border/60 hover:text-text'
            }`}
          >
            {entry.name}
          </button>
        ))}
      </div>

      <label className="block text-xs text-muted">
        <span className="mb-1 block">custom</span>
        <input
          value={draft}
          onChange={(event) => {
            apply(event.target.value);
          }}
          spellCheck={false}
          className={`w-full rounded border bg-bg px-2 py-1 font-mono text-xs text-text outline-none ${
            invalid ? 'border-death' : 'border-border focus:border-alive'
          }`}
        />
      </label>
    </>
  );
}
