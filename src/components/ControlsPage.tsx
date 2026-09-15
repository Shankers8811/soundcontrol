import { useApp } from '../state/store';
import type { GestureAction, TouchMap } from '../types';
import { IconGame } from './Icons';

const ACTIONS: { id: GestureAction; label: string }[] = [
  { id: 'play', label: 'Play / Pause' },
  { id: 'next', label: 'Next Track' },
  { id: 'prev', label: 'Previous Track' },
  { id: 'vol-up', label: 'Volume Up (+)' },
  { id: 'vol-down', label: 'Volume Down (-)' },
  { id: 'anc', label: 'Cycle Ambient (ANC / Trans / Normal)' },
  { id: 'trans', label: 'Transparency Mode' },
  { id: 'voice-assistant', label: 'Voice Assistant' },
  { id: 'game', label: 'Game Mode (Low Latency)' },
  { id: 'off', label: 'None / Disabled' },
];

const GESTURES: { key: keyof TouchMap; title: string; side: 'left' | 'right' }[] = [
  { key: 'leftSingle', title: 'Single Tap', side: 'left' },
  { key: 'leftDouble', title: 'Double Tap', side: 'left' },
  { key: 'leftTriple', title: 'Triple Tap', side: 'left' },
  { key: 'leftHold', title: 'Hold (2s)', side: 'left' },
  { key: 'rightSingle', title: 'Single Tap', side: 'right' },
  { key: 'rightDouble', title: 'Double Tap', side: 'right' },
  { key: 'rightTriple', title: 'Triple Tap', side: 'right' },
  { key: 'rightHold', title: 'Hold (2s)', side: 'right' },
];

export function ControlsPage() {
  const app = useApp();

  const getActionLabel = (act: GestureAction) => ACTIONS.find((a) => a.id === act)?.label ?? act;

  return (
    <div className="space-y-3 px-4 py-3 pb-8">
      {/* TWS Gestures Preview Card */}
      <section className="rounded-3xl border border-line bg-wash p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-ink">Touch Controls</h3>
          <button
            onClick={() => app.push('touch')}
            className="rounded-full bg-blue px-3 py-1 text-xs font-semibold text-white hover:bg-blue-2 transition"
          >
            Customize
          </button>
        </div>
        <p className="mt-1 text-xs text-mute">Remap gestures for left and right earbuds</p>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
          {/* Left summary */}
          <div className="space-y-1.5 rounded-2xl bg-white p-3 shadow-2xs">
            <div className="flex items-center gap-1.5 font-bold text-blue text-xs uppercase tracking-wider">
              <span>🎧 Left Earbud</span>
            </div>
            <div className="text-[11px] text-mute">
              <span className="font-medium text-ink">1 Tap:</span> {getActionLabel(app.touch.leftSingle)}
            </div>
            <div className="text-[11px] text-mute">
              <span className="font-medium text-ink">2 Tap:</span> {getActionLabel(app.touch.leftDouble)}
            </div>
            <div className="text-[11px] text-mute">
              <span className="font-medium text-ink">3 Tap:</span> {getActionLabel(app.touch.leftTriple)}
            </div>
            <div className="text-[11px] text-mute">
              <span className="font-medium text-ink">Hold:</span> {getActionLabel(app.touch.leftHold)}
            </div>
          </div>

          {/* Right summary */}
          <div className="space-y-1.5 rounded-2xl bg-white p-3 shadow-2xs">
            <div className="flex items-center gap-1.5 font-bold text-blue text-xs uppercase tracking-wider">
              <span>🎧 Right Earbud</span>
            </div>
            <div className="text-[11px] text-mute">
              <span className="font-medium text-ink">1 Tap:</span> {getActionLabel(app.touch.rightSingle)}
            </div>
            <div className="text-[11px] text-mute">
              <span className="font-medium text-ink">2 Tap:</span> {getActionLabel(app.touch.rightDouble)}
            </div>
            <div className="text-[11px] text-mute">
              <span className="font-medium text-ink">3 Tap:</span> {getActionLabel(app.touch.rightTriple)}
            </div>
            <div className="text-[11px] text-mute">
              <span className="font-medium text-ink">Hold:</span> {getActionLabel(app.touch.rightHold)}
            </div>
          </div>
        </div>
      </section>

      {/* Game Mode */}
      {app.profile.gaming && (
        <section className="rounded-2xl bg-wash p-4 border border-line">
          <div className="flex items-center gap-3">
            <span className="text-blue">
              <IconGame />
            </span>
            <div className="flex-1">
              <p className="font-semibold text-ink">Game Mode (Low Latency)</p>
              <p className="text-xs text-mute">Reduces audio latency to ~80ms for gaming and video editing</p>
            </div>
            <button
              disabled={!app.connected}
              onClick={() => void app.setGaming(!app.gaming)}
              className={`toggle ${app.gaming ? 'on' : ''}`}
              aria-label="Game Mode"
            />
          </div>
        </section>
      )}

      {/* Wear Detection */}
      <section className="rounded-2xl bg-wash p-4 border border-line">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-ink">Wearing Detection</p>
            <p className="text-xs text-mute">Auto-pause playback when taking earbuds out of your ears</p>
          </div>
          <button
            onClick={() => app.setWearDetect(!app.wearDetect)}
            className={`toggle ${app.wearDetect ? 'on' : ''}`}
            aria-label="Wear detection"
          />
        </div>
      </section>

      {/* LDAC */}
      {app.profile.ldac && (
        <section className="rounded-2xl bg-wash p-4 border border-line">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-ink">LDAC High-Resolution Audio</p>
              <p className="text-xs text-mute">Sony 990 kbps codec (earbuds may briefly reconnect when toggled)</p>
            </div>
            <button
              disabled={!app.connected}
              onClick={() => void app.setLdac(!app.ldac)}
              className={`toggle ${app.ldac ? 'on' : ''}`}
              aria-label="LDAC"
            />
          </div>
        </section>
      )}

      {/* Dual Connections */}
      {app.profile.dual && (
        <section className="rounded-2xl bg-wash p-4 border border-line">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-ink">Dual Connection (Multi-point)</p>
              <p className="text-xs text-mute">Connect to your PC and phone simultaneously</p>
            </div>
            <button
              disabled={!app.connected}
              onClick={() => void app.setDual(!app.dual)}
              className={`toggle ${app.dual ? 'on' : ''}`}
              aria-label="Dual connection"
            />
          </div>
        </section>
      )}
    </div>
  );
}

export function TouchPage() {
  const app = useApp();

  const leftGestures = GESTURES.filter((g) => g.side === 'left');
  const rightGestures = GESTURES.filter((g) => g.side === 'right');

  return (
    <div className="space-y-4 px-4 py-3 pb-8">
      <p className="text-xs text-mute">
        Assign functions to earbud taps matching the Soundcore mobile experience.
      </p>

      {/* Left Earbud */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue">Left Earbud Controls</p>
        <div className="space-y-2">
          {leftGestures.map((g) => (
            <label key={g.key} className="block rounded-2xl bg-wash px-3.5 py-2.5 border border-line">
              <span className="text-xs font-bold text-ink">{g.title}</span>
              <select
                className="mt-1 w-full rounded-xl border border-line bg-white px-2.5 py-2 text-xs font-medium text-ink outline-none"
                value={app.touch[g.key]}
                onChange={(e) => app.setTouch(g.key, e.target.value as GestureAction)}
              >
                {ACTIONS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      {/* Right Earbud */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue">Right Earbud Controls</p>
        <div className="space-y-2">
          {rightGestures.map((g) => (
            <label key={g.key} className="block rounded-2xl bg-wash px-3.5 py-2.5 border border-line">
              <span className="text-xs font-bold text-ink">{g.title}</span>
              <select
                className="mt-1 w-full rounded-xl border border-line bg-white px-2.5 py-2 text-xs font-medium text-ink outline-none"
                value={app.touch[g.key]}
                onChange={(e) => app.setTouch(g.key, e.target.value as GestureAction)}
              >
                {ACTIONS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
