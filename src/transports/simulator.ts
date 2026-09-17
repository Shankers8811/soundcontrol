import { checksum } from '../protocol/codec';
import type { DeviceProfile, Transport } from '../types';

function ack(tx: Uint8Array): Uint8Array {
  const body = Array.from(tx);
  if (body.length) {
    body[0] = 0x09;
    body[1] = 0xff;
  }
  if (body.length >= 5) body[4] = 0x01;
  const out = new Uint8Array(body.length);
  out.set(body);
  if (out.length) out[out.length - 1] = checksum(out, out.length - 1);
  return out;
}

function header(cat: number, typ: number, payload: Uint8Array): Uint8Array {
  const body = [0x09, 0xff, 0x00, 0x00, 0x01, cat, typ];
  const total = 10 + payload.length;
  body.push(total & 0xff, (total >> 8) & 0xff);
  const out = [...body, ...payload];
  return new Uint8Array([...out, checksum(out)]);
}

/**
 * `01:05` reply: 10 bytes of ASCII firmware ("04.88" + "04.88") then 16 bytes
 * of ASCII serial, matching OpenSCQ30's `SerialNumberAndFirmwareVersion`.
 */
function deviceInfoFrame(): Uint8Array {
  const text = `${'04.88'}${'04.88'}SIM0000000000001`;
  const payload = new Uint8Array(26);
  for (let i = 0; i < 26 && i < text.length; i++) payload[i] = text.charCodeAt(i);
  return header(0x01, 0x05, payload);
}

/**
 * `01:01` state update with the battery written at the offsets the selected
 * profile actually uses, so the simulator exercises the same parsing path as
 * real hardware instead of a hardcoded layout.
 */
function stateFrame(profile: DeviceProfile): Uint8Array {
  const o = profile.state;
  const highest = Math.max(
    o.batteryLeft,
    o.batteryRight ?? 0,
    o.batteryCase ?? 0,
    o.batteryChargingLeft ?? 0,
    o.batteryChargingRight ?? 0,
    o.soundModes ?? 0,
    (o.soundModes ?? 0) + 7,
  );
  const payload = new Uint8Array(Math.max(48, highest + 8));
  payload[o.batteryLeft] = 4;
  if (o.batteryRight !== null) payload[o.batteryRight] = 4;
  if (o.batteryCase !== null) payload[o.batteryCase] = 3;
  if (o.batteryChargingLeft !== null) payload[o.batteryChargingLeft] = 0;
  if (o.batteryChargingRight !== null) payload[o.batteryChargingRight] = 0;
  if (o.soundModes !== null) {
    // ANC on, manual level 5 — the shape a `06:01` report has.
    payload[o.soundModes] = 0x00;
    payload[o.soundModes + 1] = 0x50;
  }
  return header(0x01, 0x01, payload);
}

/** `06:01` sound-mode report, so the UI's mirror-back path is exercised too. */
function soundModesFrame(profile: DeviceProfile): Uint8Array {
  const payload = new Uint8Array(profile.ancLayout === 'tws-l3pro' ? 6 : 7);
  payload[0] = 0x00;
  payload[1] = 0x50;
  return header(0x06, 0x01, payload);
}

function batteryFrame(profile: DeviceProfile): Uint8Array {
  const payload = new Uint8Array(profile.state.batteryRight === null ? 1 : 2);
  payload[0] = 4;
  if (payload.length > 1) payload[1] = 4;
  return header(0x01, 0x03, payload);
}

export function connectSimulator(
  onRx: (data: Uint8Array) => void,
  profile: DeviceProfile,
): {
  transport: Transport;
  name: string;
  battery: { left: number; right: number };
} {
  const transport: Transport = {
    kind: 'sim',
    label: 'Hardware simulator',
    async write(data) {
      window.setTimeout(() => {
        onRx(ack(data));
        if (data[5] === 0x01 && data[6] === 0x01) {
          onRx(stateFrame(profile));
          if (profile.ancLayout !== 'none') onRx(soundModesFrame(profile));
        }
        if (data[5] === 0x01 && data[6] === 0x05) onRx(deviceInfoFrame());
        if (data[5] === 0x01 && data[6] === 0x03) onRx(batteryFrame(profile));
      }, 28 + Math.random() * 40);
    },
    async close() {
      /* noop */
    },
  };

  window.setTimeout(() => onRx(stateFrame(profile)), 120);

  return {
    transport,
    name: `${profile.name} (sim)`,
    battery: { left: 82, right: 79 },
  };
}
