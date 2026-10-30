import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { Card, Button, StatusBadge } from './ui';

/**
 * Cleaning & Maintenance Reminder - Based on Soundcore Support videos
 * Shows cleaning reminders and maintenance tips
 */
export function CleaningReminder() {
  const app = useApp();
  const [showDetails, setShowDetails] = useState(false);
  const [lastCleaned, setLastCleaned] = useState<Record<string, number>>({});

  const { connected, profile, earbudState, capabilities } = app;

  // Only show for connected devices
  if (!connected) return null;

  // Load last cleaned dates from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('soundcontrol:cleaning_dates');
      if (saved) setLastCleaned(JSON.parse(saved));
    } catch { }
  }, []);

  const saveCleaningDate = (type: string) => {
    const updated = { ...lastCleaned, [type]: Date.now() };
    setLastCleaned(updated);
    try {
      localStorage.setItem('soundcontrol:cleaning_dates', JSON.stringify(updated));
    } catch { }
  };

  const daysSinceCleaned = (type: string) => {
    const last = lastCleaned[type];
    if (!last) return 999;
    return Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24));
  };

  const cleaningTasks = [
    {
      id: 'earbuds',
      label: 'Earbuds',
      icon: '🎧',
      interval: 7,
      description: 'Clean earbud mesh and ear tips with dry cloth',
      color: 'blue',
    },
    {
      id: 'case',
      label: 'Charging Case',
      icon: '📦',
      interval: 14,
      description: 'Clean charging pins and case interior',
      color: 'purple',
    },
    {
      id: 'eartips',
      label: 'Ear Tips',
      icon: '👂',
      interval: 30,
      description: 'Replace ear tips for best seal and hygiene',
      color: 'green',
    },
    {
      id: 'case_pins',
      label: 'Charging Pins',
      icon: '⚡',
      interval: 7,
      description: 'Clean charging contacts with dry cotton swab',
      color: 'yellow',
    },
  ];

  const overdueTasks = cleaningTasks.filter(t => daysSinceCleaned(t.id) >= t.interval);
  const dueSoonTasks = cleaningTasks.filter(t => daysSinceCleaned(t.id) >= t.interval - 2 && daysSinceCleaned(t.id) < t.interval);

  return (
    <Card
      title="Cleaning & Maintenance"
      subtitle="Keep your earbuds in top condition"
      actions={
        <StatusBadge phase="connected" />
      }
    >
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-edge bg-sunken p-3">
            <p className="text-xs text-faint">Overdue</p>
            <p className="font-mono text-2xl font-bold text-danger">{overdueTasks.length}</p>
            <p className="text-xs text-faint">tasks overdue</p>
          </div>
          <div className="rounded-xl border border-edge bg-sunken p-3">
            <p className="text-xs text-faint">Due Soon</p>
            <p className="font-mono text-2xl font-bold text-warning">{dueSoonTasks.length}</p>
            <p className="text-xs text-faint">tasks due soon</p>
          </div>
        </div>

        {/* Tasks */}
        <div className="space-y-2">
          {cleaningTasks.map(task => {
            const days = daysSinceCleaned(task.id);
            const isOverdue = days >= task.interval;
            const isDueSoon = days >= task.interval - 2 && days < task.interval;
            const progress = Math.min(100, (days / task.interval) * 100);

            return (
              <div
                key={task.id}
                className={`relative rounded-xl border px-4 py-3 transition-colors ${
                  task.color === 'blue' ? 'border-blue-500/30 bg-blue-500/5' :
                  task.color === 'purple' ? 'border-purple-500/30 bg-purple-500/5' :
                  task.color === 'green' ? 'border-green-500/30 bg-green-500/5' :
                  'border-yellow-500/30 bg-yellow-500/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{task.icon}</span>
                    <div>
                      <p className="font-semibold text-ink">{task.label}</p>
                      <p className="text-xs text-faint">Clean every {task.interval} days</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-sm font-medium ${
                      days >= task.interval ? 'text-danger' :
                      days >= task.interval - 2 ? 'text-warning' : 'text-green-400'
                    }`}>
                      {days}d
                    </span>
                    <button
                      onClick={() => saveCleaningDate(task.id)}
                      className="px-3 py-1 rounded-lg bg-accent text-ink text-xs font-medium hover:bg-accent/80"
                    >
                      Mark Done
                    </button>
                  </div>
                </div>

                <div className="mt-2 h-1.5 bg-sunken rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-500"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>

                <p className="mt-1 text-xs text-faint">{task.description}</p>
                <p className="mt-1 text-xs text-faint">
                  Last cleaned: {lastCleaned[task.id]
                    ? new Date(lastCleaned[task.id]).toLocaleDateString()
                    : 'Never'}
                </p>
              </div>
            );
          })}
        </div>

        {/* Tips */}
        <div className="mt-4 rounded-xl border border-edge bg-sunken p-4">
          <h4 className="font-semibold text-ink mb-2">Maintenance Tips</h4>
          <ul className="space-y-1 text-sm text-muted">
            <li>• Use a dry, soft-bristled brush to clean earbud mesh</li>
            <li>• Never use liquids or cleaning solutions on earbuds</li>
            <li>• Clean charging pins with dry cotton swab weekly</li>
            <li>• Replace ear tips every 3-6 months for best seal</li>
            <li>• Store in case when not in use to prevent dust buildup</li>
            <li>• Avoid extreme temperatures and humidity</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}