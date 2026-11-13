export function isSoundcoreDevice(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("soundcore") ||
    lower.includes("anker") ||
    lower.includes("life ") ||
    lower.includes("liberty") ||
    lower.includes("dot ") ||
    lower.includes("vortex") ||
    lower.includes("p20") ||
    lower.includes("p30") ||
    lower.includes("p40") ||
    lower.includes("r20") ||
    lower.includes("r30") ||
    lower.includes("r40") ||
    lower.includes("r50") ||
    lower.includes("aero") ||
    lower.includes("space ") ||
    lower.includes("sleep ")
  );
}

export function formatBattery(level: number | null): string {
  return level === null ? "N/A" : `${level}%`;
}

export function getFeatureStatusText(supported: boolean, featureName: string): string {
  if (supported) {
    return "Supported";
  }
  return `Not supported on this device`;
}
