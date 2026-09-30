/** Host enumeration is evidence only for the exact connected address.
 * Two explicit, consecutive "false" reports are required; a missing row,
 * unsupported property or failed scan never proves a disconnect.
 */
export function hostDisconnectObservation(
  mac: string,
  devices: Array<{ mac?: string; connected?: boolean }>,
  previous: number,
  scanFailed = false,
): { misses: number; disconnect: boolean } {
  if (scanFailed) return { misses: 0, disconnect: false };
  const device = devices.find((d) => d.mac?.toUpperCase() === mac.toUpperCase());
  const misses = device?.connected === false ? previous + 1 : 0;
  return { misses, disconnect: misses >= 2 };
}
