import React, { useEffect, useState } from 'react';
import { useUIStore } from '../stores/ui';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Download, RefreshCw, ShieldAlert, Terminal } from 'lucide-react';
import { getFrameLog, exportDiagnostics, checkFirmwareUpdate } from '../api/tauri';
import type { FrameLogEntry } from '../types';

interface FirmwareInfo {
  model: string;
  update_available: boolean;
  cached: any;
}

export const DiagnosticsPage: React.FC = () => {
  const { showToast } = useUIStore();
  const [frameLog, setFrameLog] = useState<FrameLogEntry[]>([]);
  const [firmwareInfo, setFirmwareInfo] = useState<FirmwareInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFrameLog();
  }, []);

  const loadFrameLog = async () => {
    try {
      const log = await getFrameLog(100);
      setFrameLog(log);
    } catch (e) {
      console.error('Failed to load frame log', e);
    }
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      const filePath = await exportDiagnostics();
      showToast(`Diagnostics exported to ${filePath}`, 'success');
    } catch (e) {
      showToast('Failed to export diagnostics', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFirmwareCheck = async () => {
    try {
      setLoading(true);
      const info = await checkFirmwareUpdate('unknown');
      setFirmwareInfo(info as FirmwareInfo);
    } catch (e) {
      showToast('Failed to check firmware', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Diagnostics</h1>
          <p className="text-gray-500 dark:text-gray-400">View device logs and export diagnostic data</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={loadFrameLog}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button onClick={handleExport} disabled={loading}>
            {loading ? 'Exporting...' : (
              <>
                <Download className="w-4 h-4 mr-2" /> Export Diagnostics
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card padding="md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Live Frame Log</h3>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                {frameLog.length} entries
              </span>
            </div>
            <div className="h-96 overflow-y-auto bg-gray-900 rounded-lg p-3 font-mono text-xs text-gray-300">
              {frameLog.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Terminal className="w-12 h-12 text-gray-600 dark:text-gray-400 mb-3" />
                  <p className="text-gray-500">No frame logs available</p>
                </div>
              ) : (
                frameLog.map((entry, index) => (
                  <div key={index} className="flex gap-2 mb-1">
                    <span className="w-16 text-soundcore-500">{entry.direction}</span>
                    <span className="text-gray-400">{entry.frame_data}</span>
                    <span className="ml-auto text-gray-600">{entry.logged_at}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card padding="md">
            <h3 className="text-lg font-semibold mb-4">Actions</h3>
            <div className="space-y-3">
              <Button onClick={handleExport} disabled={loading} className="w-full">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Exporting
                  </span>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" /> Export ZIP
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleFirmwareCheck} className="w-full">
                <ShieldAlert className="w-4 h-4 mr-2" /> Check Firmware
              </Button>
              <Button variant="ghost" onClick={loadFrameLog} className="w-full">
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh Log
              </Button>
            </div>
          </Card>

          {firmwareInfo && (
            <Card padding="md" className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Firmware Info</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Model</span>
                  <span className="text-sm font-mono">{firmwareInfo.model}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Update Available</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${firmwareInfo.update_available ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400'}`}>
                    {firmwareInfo.update_available ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};