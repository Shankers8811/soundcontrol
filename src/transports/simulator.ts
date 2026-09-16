import { checksum } from '../protocol/codec';
import type { Transport } from '../types';

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

function infoFrame(): Uint8Array {
  const payload = new Uint8Array(48);
  payload[40] = 4;
  payload[41] = 4;
  payload[42] = 3;
  const body = [0x09, 0xff, 0x00, 0x00, 0x01, 0x01, 0x01, 0x00, 0x00, ...payload];
  const total = 10 + payload.length;
  body[7] = total & 0xff;
  body[8] = (total >> 8) & 0xff;
  return new Uint8Array([...body, checksum(body)]);
}

function batteryFrame(): Uint8Array {
  const body = [0x09, 0xff, 0x00, 0x00, 0x01, 0x01, 0x03, 0x0c, 0x00, 0x04, 0x04];
  return new Uint8Array([...body, checksum(body)]);
}

export function connectSimulator(onRx: (data: Uint8Array) => void): {
  transport: Transport;
  name: string;
  battery: { left: number; right: number; case: number };
} {
  const transport: Transport = {
    kind: 'sim',
    label: 'Hardware simulator',
    async write(data) {
      window.setTimeout(() => {
        onRx(ack(data));
        if (data[5] === 0x01 && data[6] === 0x01) onRx(infoFrame());
        if (data[5] === 0x01 && data[6] === 0x03) onRx(batteryFrame());
      }, 28 + Math.random() * 40);
    },
    async close() {
      /* noop */
    },
  };

  window.setTimeout(() => onRx(infoFrame()), 120);

  return {
    transport,
    name: 'Soundcore R50i NC (sim)',
    battery: { left: 82, right: 79, case: 64 },
  };
}


