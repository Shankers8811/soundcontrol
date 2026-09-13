import { useApp } from '../state/store';
import type { GestureAction, TouchMap } from '../types';
import { IconGame } from './Icons';

const ACTIONS: { id: GestureAction; label: string }[] = [
  { id: 'play', label: 'Play / Pause' },
  { id: 'next', label: 'Next track' },
  { id: 'prev', label: 'Previous track' },
  { id: 'anc', label: 'Switch ANC' },
  { id: 'trans', label: 'Transparency' },
  { id: 'off', label: 'Off' },
];

const GESTURES: { key: keyof TouchMap; title: string }[] = [
  { key: 'leftSingle', title: 'Left · single tap' },
  { key: 'leftDouble', title: 'Left · double tap' },
  { key: 'leftHold', title: 'Left · press & hold' },
  { key: 'rightSingle', title: 'Right · single tap' },
  { key: 'rightDouble', title: 'Right · double tap' },
  { key: 'rightHold', title: 'Right · press & hold' },
];

export function ControlsPage() {
  const app = useApp();

  return (
    <div className="space-y-3 px-4 py-3 pb-6">
      {app.profile.gaming && (
        <section className="rounded-2xl bg-wash p-4">
          <div className="flex items-center gap-3">
            <span className="text-blue">
              <IconGame />
            </span>
            <div className="flex-1">
              <p className="font-medium">Game Mode</p>
              <p className="text-xs text-mute">Low-latency for games, video, and editors</p>
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

      <section className="rounded-2xl bg-wash p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Wear detection</p>
            <p className="text-xs text-mute">Pause when you take a bud out</p>
          </div>
          <button
            onClick={() => app.setWearDetect(!app.wearDetect)}
            className={`toggle ${app.wearDetect ? 'on' : ''}`}
            aria-label="Wear detection"
          />
        </div>
      </section>

      {app.profile.ldac && (
        <section className="rounded-2xl bg-wash p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">LDAC</p>
              <p className="text-xs text-mute">Device may reconnect after the codec flip</p>
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

      {app.profile.dual && (
        <section className="rounded-2xl bg-wash p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Dual connection</p>
              <p className="text-xs text-mute">Phone + computer at once</p>
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

      <section className="rounded-2xl bg-wash p-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">Controls</p>
          <button onClick={() => app.push('touch')} className="text-sm text-blue">
            Customize
          </button>
        </div>
        <p className="mt-1 text-xs text-mute">Remap taps the same way as the Android app. No voice assistant.</p>
      </section>
    </div>
  );
}

export function TouchPage() {
  const app = useApp();
  return (
    <div className="space-y-3 px-4 py-3 pb-6">
      {GESTURES.map((g) => (
        <label key={g.key} className="block rounded-2xl bg-wash px-3 py-3">
          <span className="text-sm font-medium">{g.title}</span>
          <select
            className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-sm"
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
  );
}
