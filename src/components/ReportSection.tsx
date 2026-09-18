import { useRef, useState } from 'react';
import { useApp } from '../state/store';
import { isDesktop } from '../lib/appSettings';
import { buildReportText, copyText, downloadText, githubIssueUrl } from '../lib/reporting';
import { IconExternal } from './Icons';
import { Button, InfoRow, Toggle } from './ui';

/**
 * Settings → Report a Problem (Pass 8). Same truthfulness contract as
 * feedback: there is NO reporting backend, so nothing is uploaded and no
 * success-of-upload is ever claimed. The section assembles a real report
 * from ACTUAL app state:
 *
 *  - device context straight from the store (name, model/SKU, firmware and
 *    serial read over 01:05 — "Unknown"/"(not read)" until hardware answers),
 *  - optionally the real TX/RX protocol log (the same entries the
 *    diagnostics console exports), with token-shaped strings redacted,
 *  - optional image/video attachment PICKERS: because nothing can be
 *    uploaded, selected files are listed by name in the report and the user
 *    is told to attach them manually in the GitHub issue form — the report
 *    never claims to carry the binaries.
 *
 * Actions: copy to clipboard, save as .txt (both real, local), and open the
 * project's real issue tracker pre-filled.
 */

const BUILD_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export function ReportSection() {
  const app = useApp();
  const [description, setDescription] = useState('');
  const [includeDiag, setIncludeDiag] = useState(true);
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [validation, setValidation] = useState<string | null>(null);
  const [result, setResult] = useState<{ copied: boolean; issueUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  const names = (files: FileList | null) => Array.from(files ?? []).map((f) => f.name);

  const submit = async () => {
    if (!description.trim()) {
      setValidation('Describe the problem first — an empty report helps nobody.');
      setResult(null);
      return;
    }
    setValidation(null);
    setBusy(true);
    const payload = buildReportText({
      description,
      device: {
        name: app.connected ? app.deviceName : '',
        model: app.connected ? `${app.profile.name} (${app.profile.sku})` : '',
        firmware: app.connected ? app.firmware : '',
        serial: app.connected ? app.serial : null,
      },
      version: BUILD_VERSION,
      platform: isDesktop() ? 'Windows desktop app' : 'browser session',
      diagnostics: includeDiag ? app.log : null,
      attachmentNames: [...images, ...videos],
    });
    const copied = await copyText(payload);
    downloadText('soundcontrol-problem-report.txt', payload);
    setResult({ copied, issueUrl: githubIssueUrl('Problem report', payload) });
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-edge bg-sunken px-4 py-2.5">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
          Device context (added automatically)
        </p>
        {app.connected ? (
          <>
            <InfoRow label="Device" value={app.deviceName} />
            <InfoRow label="Model" value={`${app.profile.name} (${app.profile.sku})`} />
            <InfoRow label="Firmware" value={app.firmware} mono />
            <InfoRow label="Serial" value={app.serial ?? '(not read)'} mono />
          </>
        ) : (
          <p className="text-xs text-mute">
            No device connected — the report will say so instead of guessing one.
          </p>
        )}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-mute">Problem description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="What happened, what you expected, and how to reproduce it…"
          className="w-full resize-y rounded-xl border border-edge bg-sunken px-3 py-2 text-xs text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
        />
      </label>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Include protocol diagnostics</p>
          <p className="mt-0.5 text-xs leading-relaxed text-mute">
            Adds the real TX/RX frame log ({app.log.length} entries). Session tokens are
            redacted — they never appear in the log or the report.
          </p>
        </div>
        <Toggle label="Include protocol diagnostics" checked={includeDiag} onChange={setIncludeDiag} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-mute">
            Images <span className="text-faint">(optional)</span>
          </span>
          <input
            ref={imgRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setImages(names(e.target.files))}
            className="block w-full text-[11px] text-mute file:mr-2 file:rounded-lg file:border file:border-edge file:bg-sunken file:px-2.5 file:py-1.5 file:text-[11px] file:font-semibold file:text-ink hover:file:border-accent/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-mute">
            Video <span className="text-faint">(optional)</span>
          </span>
          <input
            ref={vidRef}
            type="file"
            accept="video/*"
            onChange={(e) => setVideos(names(e.target.files))}
            className="block w-full text-[11px] text-mute file:mr-2 file:rounded-lg file:border file:border-edge file:bg-sunken file:px-2.5 file:py-1.5 file:text-[11px] file:font-semibold file:text-ink hover:file:border-accent/40"
          />
        </label>
      </div>
      {(images.length > 0 || videos.length > 0) && (
        <p className="text-[11px] leading-relaxed text-faint">
          SoundControl has no upload backend, so attachments are listed by name in the report
          ({[...images, ...videos].join(', ')}) — attach the actual files manually in the
          GitHub issue form.
        </p>
      )}

      {validation && (
        <p className="text-[11px] font-medium text-warn" role="alert">
          {validation}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Preparing…' : 'Prepare report'}
        </Button>
        {result && (
          <a
            href={result.issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-sunken px-2.5 py-1.5 text-xs font-semibold text-accent-soft transition-colors hover:border-accent/50"
          >
            Open GitHub issue form <IconExternal size={12} />
          </a>
        )}
      </div>

      {result && (
        <p className="rounded-lg border border-edge bg-sunken px-3 py-2 text-[11px] leading-relaxed text-mute" role="status">
          {result.copied
            ? 'Report copied to your clipboard and saved as soundcontrol-problem-report.txt.'
            : 'Clipboard copy was blocked by the environment — the report was saved as soundcontrol-problem-report.txt instead.'}{' '}
          <span className="font-semibold text-ink">
            Nothing was uploaded: SoundControl has no reporting server.
          </span>{' '}
          To deliver it, open the GitHub issue form, paste, and attach any files there.
        </p>
      )}
    </div>
  );
}
