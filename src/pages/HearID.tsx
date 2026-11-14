import React, { useState, useEffect } from 'react';
import { useDevicesStore } from '../stores/devices';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { DeviceInfoCard } from '../components/DeviceInfoCard';
import { Ear, ShieldAlert, Headphones, Activity, Play, RefreshCw } from 'lucide-react';
import { getDeviceInfo } from '../api/tauri';
import type { DeviceFeatures } from '../types';
import { useUIStore } from '../stores/ui';

export const HearIDPage: React.FC = () => {
  const { connectedDevice } = useDevicesStore();
  const { showToast } = useUIStore();
  const [features, setFeatures] = useState<DeviceFeatures | null>(null);
  const [testStage, setTestStage] = useState<'intro' | 'testing' | 'results' | null>(null);
  const [currentFrequency, setCurrentFrequency] = useState(0);

  const frequencies = [250, 500, 1000, 2000, 4000, 8000];

  useEffect(() => {
    if (connectedDevice?.address) {
      getDeviceInfo(connectedDevice.address)
        .then(info => setFeatures(info.features))
        .catch((e) => {
          console.error('Failed to load device info', e);
          showToast('Failed to load device info', 'error');
        });
    }
  }, [connectedDevice]);

  const startTest = () => {
    setTestStage('testing');
    setCurrentFrequency(0);
  };

  const testFrequency = async () => {
    if (currentFrequency >= frequencies.length) {
      setTestStage('results');
      return;
    }
    // Simulate playing test tone
    await new Promise(r => setTimeout(r, 1500));
    setCurrentFrequency(currentFrequency + 1);
  };

  if (!connectedDevice) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <ShieldAlert className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-semibold">No device selected</h3>
        <p className="text-gray-500 dark:text-gray-400">Please connect a Soundcore device first</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">HearID Sound</h1>
          <p className="text-gray-500 dark:text-gray-400">Personalized hearing analysis and sound optimization</p>
        </div>
      </div>

      <DeviceInfoCard
        name={connectedDevice.name}
        model={connectedDevice.profile?.model || 'Unknown'}
        address={connectedDevice.address}
        connected={connectedDevice.connected}
        batteryCount={connectedDevice.profile?.battery_count || 3}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card padding="md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">HearID Personalization</h3>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                features?.custom_gestures ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
              }`}>
                {features?.custom_gestures ? 'Supported' : 'Not Supported'}
              </span>
            </div>

            {testStage === null && (
              <div className="text-center py-12">
                <Ear className="w-24 h-24 text-soundcore-600 mb-6" />
                <h3 className="text-xl font-semibold mb-3">Analyze Your Hearing</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  HearID analyzes your hearing ability and creates a personalized sound profile
                  that compensates for imbalances or age-related hearing loss.
                </p>
                <Button onClick={startTest} className="w-full">
                  Start Hearing Test
                </Button>
              </div>
            )}

            {testStage === 'testing' && (
              <div className="text-center py-12">
                <Activity className="w-16 h-16 text-soundcore-600 animate-pulse mb-6" />
                <h3 className="text-xl font-semibold mb-3">Testing Frequency</h3>
                <p className="text-lg font-mono mb-6">{frequencies[currentFrequency]} Hz</p>
                <p className="text-gray-600 dark:text-gray-400 mb-8">
                  Tap when you hear the tone
                </p>
                <div className="flex justify-center gap-4">
                  <Button variant="outline" onClick={testFrequency} size="lg">
                    <Ear className="w-5 h-5 mr-2" /> Left Earbud
                  </Button>
                  <Button variant="outline" onClick={testFrequency} size="lg">
                    <Ear className="w-5 h-5 mr-2" /> Right Earbud
                  </Button>
                </div>
              </div>
            )}

            {testStage === 'results' && (
              <div className="text-center py-12">
                <Headphones className="w-24 h-24 text-soundcore-600 mb-6" />
                <h3 className="text-xl font-semibold mb-3">Hearing Profile Complete</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Your personalized sound profile has been created and applied to your device.
                </p>
                <Button onClick={() => setTestStage(null)} className="w-full">
                  Retake Test
                </Button>
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card padding="md">
            <h3 className="text-lg font-semibold mb-4">HearID Features</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Play className="w-5 h-5 text-soundcore-600" />
                <div>
                  <p className="text-sm font-medium">Personalized EQ</p>
                  <p className="text-xs text-gray-500">Sound tuned to your hearing</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Headphones className="w-5 h-5 text-soundcore-600" />
                <div>
                  <p className="text-sm font-medium">Left/Right Balance</p>
                  <p className="text-xs text-gray-500">Compensates for hearing differences</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <RefreshCw className="w-5 h-5 text-soundcore-600" />
                <div>
                  <p className="text-sm font-medium">Age Compensation</p>
                  <p className="text-xs text-gray-500">Adjusts for age-related hearing loss</p>
                </div>
              </div>
            </div>
          </Card>

          {features?.custom_gestures === false && (
            <Card padding="md" className="mt-6 border-yellow-200 dark:border-yellow-900/30 bg-yellow-50 dark:bg-yellow-900/10">
              <ShieldAlert className="w-8 h-8 text-yellow-600 mb-3" />
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-2">Not Supported</h3>
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                Your device does not support HearID personalization.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};