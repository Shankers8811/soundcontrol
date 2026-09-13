import { useMemo, useState } from 'react';
import { checksum, fromHex, toHex, verifyFrame, withChecksum } from '../protocol/codec';
import { useApp } from '../state/store';

export function HexConsole() {
  const app = useApp();
  const [draft, setDraft] = useState('08 EE 00 00 00 06 81 0E 00 01 05 01');
  const [autoCs, setAutoCs] = useState(true);
  const [filter, setFilter] = useState<'all' | 'tx' | 'rx' | 'sys'>('all');

  const parsed = useMemo(() => {
    try {
      const raw = fromHex(draft);
      if (!raw.length) return { ok: false, msg: 'Empty', bytes: raw, framed: raw };
      const framed = autoCs ? withChecksum(Array.from(raw)) : raw;
      const valid = verifyFrame(framed);
      const cs = checksum(framed, framed.length - (autoCs ? 1 : 0));
      return {
        ok: true,
        msg: autoCs
          ? `checksum 0x${framed[framed.length - 1].toString(16).padStart(2, '0').toUpperCase()}`
          : `Σ ${cs.toString(16).padStart(2, '0')} · frame ${valid ? 'valid' : 'mismatch'}`,
        bytes: raw,
        framed,
        valid,
      };
    } catch (err) {
      return {
        ok: false,
        msg: err instanceof Error ? err.message : String(err),
        bytes: new Uint8Array(),
        framed: new Uint8Array(),
      };
    }
  }, [draft, autoCs]);

  const rows = app.log.filter((l) => filter === 'all' || l.dir === filter);

  return (
    <div className="space-y-3 px-4 py-3 pb-6">
      <p className="text-sm text-mute">
        Developer log — not part of the consumer soundcore app. TX/RX frames with checksum check.
      </p>
      <div className="flex flex-wrap gap-1">
        {(['all', 'tx', 'rx', 'sys'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase ${
              filter === f ? 'bg-blue text-white' : 'bg-wash text-mute'
            }`}
          >
            {f}
          </button>
        ))}
        <button onClick={app.clearLog} className="rounded-full px-3 py-1 font-mono text-[11px] text-mute">
          Clear
        </button>
      </div>

      <div className="rounded-2xl bg-[#111318] p-3 text-white">
        <label className="text-[10px] uppercase tracking-wider text-[#8b919c]">Payload</label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="mt-2 h-20 w-full resize-y rounded-md bg-[#0b0d12] p-2 font-mono text-xs text-[#7ee0c8] outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-[#8b919c]">
            <input type="checkbox" checked={autoCs} onChange={(e) => setAutoCs(e.target.checked)} />
            Append Σ mod 256
          </label>
          <span className={`font-mono text-[11px] ${parsed.ok ? 'text-[#7ee0c8]' : 'text-[#fb7185]'}`}>{parsed.msg}</span>
          <button
            disabled={!app.connected || !parsed.ok}
            onClick={() => parsed.ok && app.inject(parsed.framed)}
            className="ml-auto rounded-full bg-blue px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <p className="mt-1 break-all font-mono text-[10px] text-[#6b7280]">{toHex(parsed.framed)}</p>
      </div>

      <div className="h-[280px] overflow-auto rounded-2xl bg-[#111318] font-mono text-[11px] text-white">
        {rows.length === 0 && <p className="p-4 text-[#8b919c]">No frames yet.</p>}
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[72px_32px_1fr] gap-2 border-b border-white/5 px-3 py-1.5">
            <span className="text-[#6b7280]">{formatMs(row.ts)}</span>
            <span className={row.dir === 'tx' ? 'text-[#93c5fd]' : row.dir === 'rx' ? 'text-[#7ee0c8]' : 'text-[#6b7280]'}>
              {row.dir.toUpperCase()}
            </span>
            <div>
              <span>{row.hex || row.note}</span>
              {row.hex && row.note && <span className="ml-2 text-[#6b7280]">{row.note}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMs(ts: number) {
  const s = Math.floor(ts / 1000)
    .toString()
    .padStart(3, '0');
  const ms = Math.floor(ts % 1000)
    .toString()
    .padStart(3, '0');
  return `${s}.${ms}`;
}
