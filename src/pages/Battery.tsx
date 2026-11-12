import { useEffect, useState } from 'react';
import { 
  Battery, 
  BatteryCharging, 
  BatteryLow,
  AlertTriangle,
  Bell,
  Clock,
  TrendingUp
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useDevicesStore } from '../stores/devices';
import { useUIStore } from '../stores/ui';
import { Card } from '../components/ui/Card';
import { BatteryRing } from '../components/ui/BatteryRing';
import { Button } from '../components/ui/Button';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';

export const BatteryPage = () => {
  const { activeDevice, getBatteryHistory } = useDevicesStore();
  const { showSuccess, showError } = useUIStore();
  
  const [history, setHistory] = useState<Array<{timestamp: string, left: number | null, right: number | null, case: number | null, charging: boolean}>>([]);
  const [timeRange, setTimeRange] = useState(24);
  const [lowBatteryThreshold, setLowBatteryThreshold] = useState(20);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  
  useEffect(() => {
    if (activeDevice) {
      loadHistory();
    }
  }, [activeDevice, timeRange]);
  
  const loadHistory = async () => {
    if (!activeDevice) return;
    try {
      const data = await getBatteryHistory(activeDevice.mac, timeRange);
      setHistory(data.map(d => ({
        timestamp: d.timestamp,
        left: d.left_pct,
        right: d.right_pct,
        case: d.case_pct,
        charging: d.charging,
      })));
    } catch (e) {
      console.error('Failed to load battery history:', e);
    }
  };
  
  if (!activeDevice) {
    return (
      <div className="space-y-6">
        <h1 className="text-h1 font-bold">Battery</h1>
        <Card className="p-8 text-center">
          <Battery className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-h3 font-medium mb-2">No Device Connected</h3>
          <p className="text-text-muted">Connect a Soundcore device to view battery status</p>
        </Card>
      </div>
    );
  }
  
  const leftPct = activeDevice.battery?.leftPct ?? null;
  const rightPct = activeDevice.battery?.rightPct ?? null;
  const casePct = activeDevice.battery?.casePct ?? null;
  const leftCharging = activeDevice.battery?.leftCharging ?? false;
  const rightCharging = activeDevice.battery?.rightCharging ?? false;
  const caseCharging = activeDevice.battery?.caseCharging ?? false;
  
  const avgPct = [leftPct, rightPct, casePct].filter((v): v is number => v !== null).reduce((a, b) => a + b, 0) / 
    [leftPct, rightPct, casePct].filter((v): v is number => v !== null).length || 0;
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-h1 font-bold">Battery</h1>
          <p className="text-text-muted mt-1">{activeDevice.name || activeDevice.mac}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(parseInt(e.target.value))}
            className="px-3 py-2 rounded-md bg-bg-elevated border border-border-input text-text text-sm focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value={1}>1 Hour</option>
            <option value={6}>6 Hours</option>
            <option value={24}>24 Hours</option>
            <option value={168}>7 Days</option>
          </select>
        </div>
      </div>
      
      {/* Battery Overview */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-6 text-center">
          <div className="flex flex-col items-center">
            <BatteryRing 
              percent={leftPct} 
              charging={leftCharging}
              size="lg" 
              label="Left"
            />
            <p className="mt-2 font-medium text-body">Left Earbud</p>
            <p className="text-caption text-text-muted">
              {leftCharging ? 'Charging' : leftPct !== null ? `${leftPct}%` : 'Unknown'}
            </p>
          </div>
        </Card>
        
        <Card className="p-6 text-center">
          <div className="flex flex-col items-center">
            <BatteryRing 
              percent={rightPct} 
              charging={rightCharging}
              size="lg" 
              label="Right"
            />
            <p className="mt-2 font-medium text-body">Right Earbud</p>
            <p className="text-caption text-text-muted">
              {rightCharging ? 'Charging' : rightPct !== null ? `${rightPct}%` : 'Unknown'}
            </p>
          </div>
        </Card>
        
        <Card className="p-6 text-center">
          <div className="flex flex-col items-center">
            <BatteryRing 
              percent={casePct} 
              charging={caseCharging}
              size="lg" 
              label="Case"
            />
            <p className="mt-2 font-medium text-body">Charging Case</p>
            <p className="text-caption text-text-muted">
              {caseCharging ? 'Charging' : casePct !== null ? `${casePct}%` : 'Not Available'}
            </p>
          </div>
        </Card>
      </div>
      
      {/* Battery History Chart */}
      <Card>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-h3 font-medium">Battery History ({timeRange}h)</h2>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-text-muted" />
            <span className="text-caption text-text-muted">
              {history.length} data points
            </span>
          </div>
        </div>
        <div className="p-4 h-64">
          {history.length > 0 ? (
            <div className="w-full h-full relative">
              <svg className="w-full h-full" viewBox="0 0 800 256" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="battery-gradient-left" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="battery-gradient-right" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4da3ff" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#4da3ff" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="battery-gradient-case" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#eab308" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Grid lines */}
                <g stroke="#333333" strokeWidth="0.5" opacity="0.3">
                  {[25, 50, 75, 100].map(p => (
                    <line key={p} x1="40" y1={200 - (p * 1.6)} x2="760" y2={200 - (p * 1.6)} />
                  ))}
                </g>
                {/* Left earbud */}
                {history.map((d, i) => 
                  d.left !== null && (
                    <line 
                      key={`left-${i}`}
                      x1={40 + (i / Math.max(1, history.length - 1)) * 720}
                      y1={200 - (d.left * 1.6)}
                      x2={40 + ((i + 1) / Math.max(1, history.length - 1)) * 720}
                      y2={history[i + 1]?.left !== null ? 200 - (history[i + 1].left! * 1.6) : 200 - (d.left * 1.6)}
                      stroke="#16a34a"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  )
                )}
                {/* Right earbud */}
                {history.map((d, i) => 
                  d.right !== null && (
                    <line 
                      key={`right-${i}`}
                      x1={40 + (i / Math.max(1, history.length - 1)) * 720}
                      y1={200 - (d.right * 1.6)}
                      x2={40 + ((i + 1) / Math.max(1, history.length - 1)) * 720}
                      y2={history[i + 1]?.right !== null ? 200 - (history[i + 1].right! * 1.6) : 200 - (d.right * 1.6)}
                      stroke="#4da3ff"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  )
                )}
                {/* Case */}
                {history.map((d, i) => 
                  d.case !== null && (
                    <line 
                      key={`case-${i}`}
                      x1={40 + (i / Math.max(1, history.length - 1)) * 720}
                      y1={200 - (d.case * 1.6)}
                      x2={40 + ((i + 1) / Math.max(1, history.length - 1)) * 720}
                      y2={history[i + 1]?.case !== null ? 200 - (history[i + 1].case! * 1.6) : 200 - (d.case * 1.6)}
                      stroke="#eab308"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  )
                )}
              </svg>
              
              {/* Legend */}
              <div className="absolute bottom-4 left-4 flex gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-2 bg-green-500 rounded" />
                  <span className="text-text-muted">Left</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-2 bg-blue-400 rounded" />
                  <span className="text-text-muted">Right</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-2 bg-yellow-500 rounded" />
                  <span className="text-text-muted">Case</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted">
            <p>No battery history available yet. Connect your device to start recording.</p>
          </div>
        )}
      </div>
    </Card>
    
    {/* Low Battery Alerts */}
    <Card>
      <div className="p-4 border-b border-border">
        <h2 className="text-h3 font-medium">Low Battery Alerts</h2>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Enable Alerts</h3>
            <p className="text-text-muted text-sm">Get notified when battery is low</p>
          </div>
          <ToggleSwitch
            checked={alertsEnabled}
            onChange={setAlertsEnabled}
            label="Alerts Enabled"
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Alert Threshold</h3>
            <p className="text-text-muted text-sm">Notify when any battery drops below</p>
          </div>
          <select
            value={lowBatteryThreshold}
            onChange={(e) => setLowBatteryThreshold(parseInt(e.target.value))}
            className="px-3 py-2 rounded-md bg-bg-elevated border border-border-input text-text text-sm focus:border-accent focus:ring-1 focus:ring-accent w-32"
          >
            <option value={10}>10%</option>
            <option value={15}>15%</option>
            <option value={20}>20%</option>
            <option value={25}>25%</option>
            <option value={30}>30%</option>
          </select>
        </div>
      </div>
    </Card>
    
    {/* Current Status */}
    <Card>
      <div className="p-4 border-b border-border">
        <h2 className="text-h3 font-medium">Current Status</h2>
      </div>
      <div className="p-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <h3 className="font-medium">Left Earbud</h3>
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-border rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 rounded-full transition-all duration-300"
                style={{ width: `${leftPct ?? 0}%` }}
              />
            </div>
            <span className="text-sm font-mono tabular-nums w-12 text-right">
              {leftPct !== null ? `${leftPct}%` : 'N/A'}
            </span>
            {leftCharging && <span className="text-xs text-warning flex items-center gap-1">⚡ Charging</span>}
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Right Earbud</h3>
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-border rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${rightPct ?? 0}%` }}
              />
            </div>
            <span className="text-sm font-mono tabular-nums w-12 text-right">
              {rightPct !== null ? `${rightPct}%` : 'N/A'}
            </span>
            {rightCharging && <span className="text-xs text-warning flex items-center gap-1">⚡ Charging</span>}
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Charging Case</h3>
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-border rounded-full overflow-hidden">
              <div 
                className="h-full bg-yellow-500 rounded-full transition-all duration-300"
                style={{ width: `${casePct ?? 0}%` }}
              />
            </div>
            <span className="text-sm font-mono tabular-nums w-12 text-right">
              {casePct !== null ? `${casePct}%` : 'N/A'}
            </span>
            {caseCharging && <span className="text-xs text-warning flex items-center gap-1">⚡ Charging</span>}
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Average</h3>
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-border rounded-full overflow-hidden">
              <div 
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${avgPct}%` }}
              />
            </div>
            <span className="text-sm font-mono tabular-nums w-12 text-right">
              {Math.round(avgPct)}%
            </span>
          </div>
        </div>
      </div>
    </Card>
    </div>
  );
};