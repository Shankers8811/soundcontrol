import { useMemo, useState } from 'react';
import { BLE_COMMAND_MAP } from '../protocol/ble';
import {
  base64ToBytes,
  checksum,
  fromHex,
  toHex,
  verifyFrame,
  verifyXorFrame,
  withChecksum,
  xorChecksum,
} from '../protocol/codec';
import { redactSecrets } from '../lib/reporting';
import { useApp } from '../state/store';
import type { LogEntry } from '../types';

/**
 * Save the activity log — the raw material a bug report needs — with
 * token- and address-shaped strings scrubbed first. Frame bytes are
 * unaffected (raw hex has no separators); only text fields can carry an
 * identifier, and an exported diagnostics snapshot must not.
 */
function downloadLog(log: LogEntry[], kind: 'json' | 'csv') {
  const clean = log.map((r) => ({ ...r, hex: redactSecrets(r.hex), note: redactSecrets(r.note ?? '') }));
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const text =
    kind === 'json'
      ? JSON.stringify(clean, null, 2)
      : [
          'Timestamp,Dir,Hex,Note,ChecksumValid',
          ...clean.map((r) =>
            [
              new Date(r.ts).toISOString(),
              r.dir,
              r.hex,
              esc(r.note ?? ''),
              r.valid === null || r.valid === undefined ? '' : String(r.valid),
            ].join(','),
          ),
        ].join('\n');
  const blob = new Blob([text], {
    type: kind === 'json' ? 'application/json' : 'text/csv',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `soundcontrol-log.${kind}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function HexConsole() {
  const app = useApp();
  const [draft, setDraft] = useState('08 EE 00 00 00 06 81 0E 00 01 05 01');
  const [autoCs, setAutoCs] = useState(true);
  const [filter, setFilter] = useState<'all' | 'tx' | 'rx' | 'sys'>('all');

  const [b64, setB64] = useState('');

  const parsed = useMemo(() => {
    try {
      const raw = fromHex(draft);
      if (!raw.length) return { ok: false, msg: 'Empty', bytes: raw, framed: raw };
      const framed = autoCs ? withChecksum(Array.from(raw)) : raw;
      const valid = verifyFrame(framed);
      const cs = checksum(framed, framed.length - (autoCs ? 1 : 0));
      const xor = xorChecksum(framed, framed.length - (autoCs ? 1 : 0));
      const xorValid = verifyXorFrame(framed);
      return {
        ok: true,
        msg: autoCs
          ? `Σ 0x${framed[framed.length - 1].toString(16).padStart(2, '0').toUpperCase()} · XOR would be 0x${xor.toString(16).padStart(2, '0').toUpperCase()}`
          : `Σ ${cs.toString(16).padStart(2, '0')} · RFCOMM ${valid ? 'valid' : 'mismatch'} · BLE-XOR ${xorValid ? 'valid' : 'mismatch'}`,
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

  const decodedB64 = useMemo(() => {
    if (!b64.trim()) return { ok: true as const, hex: '', msg: 'Paste a Base64 capture to decode it to hex.' };
    try {
      const bytes = base64ToBytes(b64);
      const sum = bytes.length ? verifyFrame(bytes) : null;
      const xor = bytes.length ? verifyXorFrame(bytes) : null;
      const tag =
        bytes.length < 2
          ? ''
          : sum
            ? ' · looks like an RFCOMM frame (Σ ok)'
            : xor
              ? ' · looks like a BLE frame (XOR ok)'
              : ' · checksum does not match Σ or XOR';
      return { ok: true as const, hex: toHex(bytes), msg: `${bytes.length} bytes${tag}` };
    } catch (err) {
      return { ok: false as const, hex: '', msg: err instanceof Error ? err.message : String(err) };
    }
  }, [b64]);

  const rows = app.log.filter((l) => filter === 'all' || l.dir === filter);

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-mute">
        Developer log — TX/RX frames with checksum validation. RFCOMM frames use Σ mod 256; short
        Android BLE captures use an XOR checksum instead. Injection sends the real frame to the
        connected device over the bridge.
      </p>
      <div className="flex flex-wrap gap-1">
        {(['all', 'tx', 'rx', 'sys'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase transition-colors ${
              filter === f
                ? 'bg-accent-deep text-white'
                : 'bg-sunken text-mute hover:text-ink border border-edge'
            }`}
          >
            {f}
          </button>
        ))}
        <button
          onClick={app.clearLog}
          className="rounded-full border border-edge bg-sunken px-3 py-1 font-mono text-[11px] text-mute transition-colors hover:text-ink"
        >
          Clear
        </button>
        {/* Bug reports: attach exactly what the app saw, nothing retyped. */}
        <button
          onClick={() => downloadLog(app.log, 'json')}
          className="rounded-full border border-edge bg-sunken px-3 py-1 font-mono text-[11px] text-mute transition-colors hover:text-accent-soft"
        >
          Export JSON
        </button>
        <button
          onClick={() => downloadLog(app.log, 'csv')}
          className="rounded-full border border-edge bg-sunken px-3 py-1 font-mono text-[11px] text-mute transition-colors hover:text-accent-soft"
        >
          Export CSV
        </button>
      </div>

      <div className="console-well rounded-xl border border-edge p-3">
        <label className="text-[10px] uppercase tracking-wider text-faint" htmlFor="hex-payload">
          Payload
        </label>
        <textarea
          id="hex-payload"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="mt-2 h-20 w-full resize-y rounded-md border border-edge bg-bg p-2 font-mono text-xs text-accent-soft outline-none focus:border-accent/60"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-mute">
            <input
              type="checkbox"
              checked={autoCs}
              onChange={(e) => setAutoCs(e.target.checked)}
              className="accent-[#3d7bff]"
            />
            Append Σ mod 256
          </label>
          <span className={`font-mono text-[11px] ${parsed.ok ? 'text-accent-soft' : 'text-danger'}`}>{parsed.msg}</span>
          <button
            disabled={!app.connected || !parsed.ok}
            onClick={() => {
              if (parsed.ok) void app.inject(parsed.framed).catch(() => {});
            }}
            className="ml-auto rounded-lg bg-accent-deep px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <p className="mt-1 break-all font-mono text-[10px] text-faint">{toHex(parsed.framed)}</p>
      </div>

      <div className="rounded-xl border border-edge bg-sunken p-3">
        <label className="text-[10px] uppercase tracking-wider text-mute" htmlFor="b64-capture">
          Base64 capture → hex
        </label>
        <textarea
          id="b64-capture"
          value={b64}
          onChange={(e) => setB64(e.target.value)}
          spellCheck={false}
          placeholder="Paste a Base64 blob from an Android capture…"
          className="mt-2 h-16 w-full resize-y rounded-md border border-edge bg-bg p-2 font-mono text-xs text-ink outline-none placeholder:text-faint focus:border-accent/60"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`font-mono text-[11px] ${decodedB64.ok ? 'text-mute' : 'text-danger'}`}>
            {decodedB64.msg}
          </span>
          {decodedB64.ok && decodedB64.hex && (
            <button
              onClick={() => setDraft(decodedB64.hex)}
              className="ml-auto rounded-lg border border-edge bg-panel px-3 py-1 text-xs font-semibold text-accent-soft transition-colors hover:border-accent/50"
            >
              Load into payload
            </button>
          )}
        </div>
        {decodedB64.ok && decodedB64.hex && (
          <p className="mt-1 break-all font-mono text-[10px] text-faint">{decodedB64.hex}</p>
        )}
      </div>

      <div className="rounded-xl border border-edge bg-sunken p-3">
        <p className="text-[10px] uppercase tracking-wider text-mute">Android BLE → RFCOMM map</p>
        <ul className="mt-2 space-y-1.5">
          {BLE_COMMAND_MAP.map((c) => (
            <li key={c.ble} className="text-xs text-mute">
              <span className="font-mono font-bold text-ink">
                BLE 0x{c.ble.toString(16).padStart(2, '0').toUpperCase()}
              </span>{' '}
              {c.name} → <span className="font-mono">{c.rfcomm}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-faint">
          GATT ab00 (TX ab01 / RX ab02). Windows sends the RFCOMM column; this table only decodes
          captures — SoundControl never transmits BLE.
        </p>
      </div>

      <div className="console-well h-[280px] overflow-auto rounded-xl border border-edge font-mono text-[11px] text-ink">
        {rows.length === 0 && <p className="p-4 text-faint">No frames yet.</p>}
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[72px_32px_1fr] gap-2 border-b border-edge-soft px-3 py-1.5">
            <span className="text-faint">{formatMs(row.ts)}</span>
            <span className={row.dir === 'tx' ? 'text-accent-soft' : row.dir === 'rx' ? 'text-[#7ee0c8]' : 'text-faint'}>
              {row.dir.toUpperCase()}
            </span>
            <div className="min-w-0">
              <span className="break-all">{row.hex || row.note}</span>
              {row.hex && row.note && <span className="ml-2 text-faint">{row.note}</span>}
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
