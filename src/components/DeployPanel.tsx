import { useState } from 'react';
import { buildProjectZip, downloadBlob, downloadText } from '../lib/exportZip';
import { PROTOCOL_MD } from '../lib/protocolDoc';
import { BRIDGE_PY, ELECTRON_MAIN } from '../lib/embedded';

export function DeployPanel() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const zipAll = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const blob = await buildProjectZip();
      downloadBlob(blob, 'soundcontrol-source.zip');
      setMsg('Packed source archive.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const installPwa = async () => {
    const nav = window as unknown as {
      deferredPrompt?: { prompt: () => Promise<void> };
    };
    if (nav.deferredPrompt) {
      await nav.deferredPrompt.prompt();
      return;
    }
    setMsg('Use Chrome or Edge → Install app. A service worker is already registered.');
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Desktop extras</p>
      <div className="grid gap-2">
        <Action title="Install as app" body="PWA window, no browser chrome." cta="Install" onClick={installPwa} />
        <Action title="Source zip" body="Full project." cta={busy ? 'Packing…' : 'Download'} onClick={zipAll} />
        <Action
          title="RFCOMM bridge"
          body="python3 soundcore_bridge.py"
          cta="Save .py"
          onClick={() => downloadText(BRIDGE_PY, 'soundcore_bridge.py', 'text/x-python')}
        />
        <Action
          title="Electron"
          body="electron-main.cjs"
          cta="Save .cjs"
          onClick={() => downloadText(ELECTRON_MAIN, 'electron-main.cjs', 'text/javascript')}
        />
        <Action
          title="Protocol"
          body="ANC / EQ frame spec"
          cta="Save .md"
          onClick={() => downloadText(PROTOCOL_MD, 'PROTOCOL.md', 'text/markdown')}
        />
      </div>
      {msg && <p className="text-xs text-blue">{msg}</p>}
    </div>
  );
}

function Action({
  title,
  body,
  cta,
  onClick,
}: {
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-wash px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="truncate text-xs text-mute">{body}</p>
      </div>
      <button onClick={onClick} className="shrink-0 rounded-full bg-blue px-3 py-1.5 text-sm font-semibold text-white">
        {cta}
      </button>
    </div>
  );
}
