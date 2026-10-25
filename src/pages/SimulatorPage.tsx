import { DEVICES } from '../protocol/devices';
import { Card, PageHeader } from '../components/ui';

/**
 * Simulator page for GitHub Pages demo mode.
 * Allows testing the UI with simulated device data without Bluetooth hardware.
 */
export function SimulatorPage() {

  if (!__DEMO__) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Device Simulator"
        sub={
          <>
            <span className="font-mono text-[10px] text-faint">DEMO MODE</span>
          </>
        }
      />

      <Card title="Select Device to Simulate" subtitle="Choose a verified Soundcore device to simulate">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEVICES.filter(d => d.verified).map((device) => (
            <div
              key={device.id}
              className="relative rounded-xl border border-edge bg-sunken p-4 transition-all hover:border-accent/50 cursor-pointer"
              onClick={() => {
                // navigate to simulator
                // For now just show an alert since simulator is not fully implemented in demo
                alert(`Simulating ${device.name} (${device.sku})`);
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{device.name}</span>
                    <span className="font-mono text-[11px] text-faint">{device.sku}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {device.gaming && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-accent/15 text-accent">Gaming</span>}
                    {device.surround && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-purple-500/15 text-purple-400">Surround</span>}
                    {device.dual && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-emerald-500/15 text-emerald-400">Dual</span>}
                    {device.ldac && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-orange-500/15 text-orange-400">LDAC</span>}
                    {device.ancLevels && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-blue-500/15 text-blue-400">ANC</span>}
                    {device.transparency && <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-green-500/15 text-green-400">Transparency</span>}
                  </div>
                  <p className="mt-2 text-[11px] text-faint truncate">{device.source}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}