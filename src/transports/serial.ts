import type { Transport } from '../types';

export async function connectSerial(
  onRx: (data: Uint8Array) => void,
  baudRate = 9600,
): Promise<{ transport: Transport; name: string }> {
  if (!navigator.serial) {
    throw new Error('Web Serial is not available. Use Chrome or Edge and pick the Soundcore virtual COM / SPP port.');
  }

  const port = await navigator.serial.requestPort();
  await port.open({ baudRate, bufferSize: 4096 });

  let closed = false;
  const reader = port.readable?.getReader();

  (async () => {
    if (!reader) return;
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length) onRx(value);
      }
    } catch {
      /* port unplugged */
    }
  })();

  const writer = port.writable?.getWriter();

  const transport: Transport = {
    kind: 'serial',
    label: `Web Serial · ${baudRate} baud`,
    async write(data) {
      if (!writer) throw new Error('Serial port is not writable');
      await writer.write(data);
    },
    async close() {
      closed = true;
      try {
        reader?.releaseLock();
      } catch {
        /* */
      }
      try {
        writer?.releaseLock();
      } catch {
        /* */
      }
      await port.close();
    },
  };

  return { transport, name: 'Soundcore SPP' };
}
