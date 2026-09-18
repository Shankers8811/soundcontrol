import { useState } from 'react';
import { isDesktop } from '../lib/appSettings';
import { buildFeedbackText, copyText, downloadText, githubIssueUrl } from '../lib/reporting';
import { IconExternal, IconStar } from './Icons';
import { Button } from './ui';

/**
 * Settings → Feedback & Rating (Pass 8). Truthfulness contract:
 *
 * SoundControl has NO feedback backend. Nothing here performs a network
 * submission and nothing ever says "submitted successfully" — because no
 * submission occurs. What the primary action really does:
 *
 *  1. assembles the feedback text from the actual rating/comment/version,
 *  2. copies it to the clipboard (real Clipboard API, legacy fallback),
 *  3. saves it locally as a .txt file (real Blob download), and
 *  4. offers the project's real destination — a GitHub issue form
 *     pre-filled with that text — as an explicit, user-driven step.
 *
 * The result message states exactly which of those local actions succeeded
 * and repeats that nothing was uploaded.
 */

const BUILD_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export function FeedbackSection() {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [result, setResult] = useState<{ copied: boolean; issueUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (rating === 0 && !text.trim()) {
      setValidation('Pick a star rating or write a few words first — an empty feedback has nothing to carry.');
      setResult(null);
      return;
    }
    setValidation(null);
    setBusy(true);
    const payload = buildFeedbackText({
      rating,
      text,
      version: BUILD_VERSION,
      platform: isDesktop() ? 'Windows desktop app' : 'browser session',
    });
    const copied = await copyText(payload);
    downloadText('soundcontrol-feedback.txt', payload);
    setResult({ copied, issueUrl: githubIssueUrl(`Feedback: ${rating}/5 stars`, payload) });
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      {/* Rating: five real toggle buttons; re-clicking the current value clears to 0. */}
      <div role="group" aria-label="Rating, 0 to 5 stars" className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = n <= rating;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              aria-label={`${n} star${n > 1 ? 's' : ''}${n === rating ? ' (click again to clear)' : ''}`}
              onClick={() => setRating(n === rating ? 0 : n)}
              className={`rounded-lg p-1.5 transition-colors duration-150 ${
                on ? 'text-warn' : 'text-faint hover:text-mute'
              }`}
            >
              <IconStar size={22} fill={on ? 'currentColor' : 'none'} />
            </button>
          );
        })}
        <span className="ml-2 font-mono text-xs text-mute" aria-live="polite">
          {rating}/5
        </span>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-mute">
          Comments <span className="text-faint">(optional)</span>
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="What works, what doesn't, what you'd like next…"
          className="w-full resize-y rounded-xl border border-edge bg-sunken px-3 py-2 text-xs text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
        />
      </label>

      {validation && (
        <p className="text-[11px] font-medium text-warn" role="alert">
          {validation}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Preparing…' : 'Prepare feedback'}
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
            ? 'Feedback copied to your clipboard and saved as soundcontrol-feedback.txt.'
            : 'Clipboard copy was blocked by the environment — feedback was saved as soundcontrol-feedback.txt instead.'}{' '}
          <span className="font-semibold text-ink">
            SoundControl has no feedback server; nothing was uploaded and nothing is sent
            automatically.
          </span>{' '}
          To actually deliver it, open the GitHub issue form and paste — that is the project's
          real, configured destination.
        </p>
      )}
    </div>
  );
}
