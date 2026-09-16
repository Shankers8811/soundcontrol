/** Matches transient Bluetooth/RFCOMM busy failures in the Windows helper. */
export function isTransportBusyError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /already in progress|gatt.*(busy|in progress|in use)|operation in progress|device is busy|busy/i.test(
    message,
  );
}
