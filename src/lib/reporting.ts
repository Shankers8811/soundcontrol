import type { LogEntry } from '../types';
import { LATEST_RELEASE_URL, REPO_URL } from './downloads';

/**
 * Honest feedback / problem-report / update plumbing (Pass 8).
 *
 * SoundControl has NO feedback server, NO issue-reporting backend and NO
 * background updater — so nothing in this module ever pretends otherwise.
 * What it does provide is real:
 *
 *  - text builders that assemble a report from ACTUAL app state (device
 *    profile, firmware/serial read over 01:05, the real TX/RX log),
 *  - secret redaction (the bridge session token must never leave in a
 *    report, even though the helper already keeps it out of the log),
 *  - clipboard copy + local file download (both real, local-only actions),
 *  - a pre-filled GitHub issue URL — the project's real, configured
 *    destination (REPO_URL is injected at build time), and
 *  - an update check against the official GitHub Releases API for THIS
 *    repository: a trusted, read-only source. The response is validated
 *    before anything is displayed; failures are shown as failures.
 */

/**
 * Strip token- and address-shaped strings — belt and braces on top of the
 * helper's own redaction. Bluetooth addresses are stable device identifiers:
 * a diagnostics snapshot that leaves the app must not carry them, so any
 * colon- or dash-separated MAC (case-insensitive) is scrubbed here. This is
 * applied to every report, feedback file and console export, not just the
 * free-text fields.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/token=[A-Za-z0-9._~+/=-]+/gi, 'token=[redacted]')
    .replace(/(authorization:\s*)bearer\s+[^\s]+/gi, '$1Bearer [redacted]')
    .replace(/\b[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}\b/g, '[mac removed]');
}

export function buildFeedbackText(input: {
  rating: number;
  text: string;
  version: string;
  platform: string;
}): string {
  return redactSecrets(
    [
      'SoundControl feedback',
      `Rating: ${input.rating}/5`,
      `Version: ${input.version}`,
      `Platform: ${input.platform}`,
      '',
      input.text.trim() || '(no written feedback)',
    ].join('\n'),
  );
}

export function buildReportText(input: {
  description: string;
  device: { name: string; model: string; firmware: string; serial: string | null };
  version: string;
  platform: string;
  diagnostics: LogEntry[] | null;
  attachmentNames: string[];
}): string {
  const parts = [
    'SoundControl problem report',
    `Version: ${input.version}`,
    `Platform: ${input.platform}`,
    '',
    'Device:',
    `  Name:     ${input.device.name || '(not connected)'}`,
    `  Model:    ${input.device.model || '(unknown)'}`,
    `  Firmware: ${input.device.firmware || 'Unknown'}`,
    `  Serial:   ${input.device.serial || '(not read)'}`,
    '',
    'Description:',
    input.description.trim(),
  ];
  if (input.attachmentNames.length) {
    parts.push(
      '',
      'Attachments (listed by name only — SoundControl has no upload backend;',
      'attach these files manually in the GitHub issue form):',
      ...input.attachmentNames.map((n) => `  - ${n}`),
    );
  }
  if (input.diagnostics && input.diagnostics.length) {
    parts.push(
      '',
      `Protocol diagnostics (last ${Math.min(input.diagnostics.length, 200)} of ${input.diagnostics.length} log entries):`,
      ...input.diagnostics
        .slice(-200)
        .map(
          (r) =>
            `${new Date(r.ts).toISOString()} ${r.dir.toUpperCase()} ${r.hex}${r.note ? ` — ${r.note}` : ''}`,
        ),
    );
  }
  return redactSecrets(parts.join('\n'));
}

/** Real clipboard write with a legacy fallback; resolves false if neither works. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Local file download (Blob + <a download>) — the same mechanism the console export uses. */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Pre-filled GitHub new-issue URL — the project's real issue tracker.
 * GitHub caps query-string size, so the body is truncated with a marker;
 * the full text is always available via copy/download.
 */
export function githubIssueUrl(title: string, body: string): string {
  const MAX = 6000;
  const truncated =
    body.length > MAX ? `${body.slice(0, MAX)}\n\n[truncated — full text was copied/downloaded]` : body;
  return `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(truncated)}`;
}

/** Numeric semver-ish compare: -1 (a<b), 0, 1. Non-numeric parts compare as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Official GitHub Releases API endpoint for THIS repository (derived from the build-time repo URL). */
export function latestReleaseApiUrl(): string | null {
  const m = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)/.exec(REPO_URL);
  if (!m) return null;
  return `https://api.github.com/repos/${m[1]}/${m[2]}/releases/latest`;
}

export interface ReleaseInfo {
  tag: string;
  url: string;
}

export type UpdateCheckResult =
  | { kind: 'unconfigured' }
  | { kind: 'none' }
  | { kind: 'latest'; release: ReleaseInfo }
  | { kind: 'available'; release: ReleaseInfo }
  | { kind: 'error'; message: string };

/**
 * Check the official GitHub Releases API and validate the response before
 * believing it. Never fabricates a version; every failure path is explicit.
 */
export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  const url = latestReleaseApiUrl();
  if (!url) return { kind: 'unconfigured' };
  try {
    // Bounded on purpose: a hung connection must not leave the section in
    // "Checking…" forever (the button is disabled while a check runs). An
    // abort lands in the same honest error path as any network failure.
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) return { kind: 'none' };
    if (!res.ok) return { kind: 'error', message: `GitHub replied HTTP ${res.status}` };
    const data: unknown = await res.json();
    const tag = typeof (data as { tag_name?: unknown }).tag_name === 'string' ? (data as { tag_name: string }).tag_name : '';
    const htmlUrl =
      typeof (data as { html_url?: unknown }).html_url === 'string' &&
      /^https:\/\/github\.com\//.test((data as { html_url: string }).html_url)
        ? (data as { html_url: string }).html_url
        : LATEST_RELEASE_URL;
    if (!tag) return { kind: 'error', message: 'Release response contained no version tag' };
    const release = { tag, url: htmlUrl };
    return compareVersions(tag, currentVersion) > 0 ? { kind: 'available', release } : { kind: 'latest', release };
  } catch (err) {
    return {
      kind: 'error',
      message: err instanceof Error ? `Could not reach GitHub (${err.message})` : 'Could not reach GitHub',
    };
  }
}
