export function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isPolicyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  return name === 'SecurityError' || /permissions policy|disallowed/i.test(msg);
}

export function isUserCancel(err: unknown): boolean {
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err);
  return name === 'NotFoundError' || name === 'AbortError' || /cancel/i.test(msg);
}

export function bluetoothReady(): boolean {
  return Boolean(window.isSecureContext && navigator.bluetooth && !inIframe());
}

export function openAppWindow(): Window | null {
  const url = new URL(location.href);
  url.searchParams.set('pair', '1');
  return window.open(url.toString(), 'soundcontrol', 'noopener,noreferrer');
}
