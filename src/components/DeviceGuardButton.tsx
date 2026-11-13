import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Button } from './Button';

interface DeviceGuardButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  feature: string;
  supported: boolean;
  deviceName?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

export const DeviceGuardButton: React.FC<DeviceGuardButtonProps> = ({
  feature,
  supported,
  deviceName,
  onClick,
  children,
  ...props
}) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!supported) {
      e.preventDefault();
      alert(`Your device ${deviceName || 'connected device'} does not support ${feature}.`);
      return;
    }
    onClick?.();
  };

  return (
    <Button
      variant={supported ? 'primary' : 'ghost'}
      onClick={handleClick}
      disabled={!supported}
      className={!supported ? 'opacity-50 cursor-not-allowed' : ''}
      title={!supported ? `Your device does not support ${feature}` : undefined}
      {...props}
    >
      {!supported && <ShieldAlert className="w-4 h-4 mr-2 opacity-50" />}
      {children}
      {!supported && <span className="text-xs opacity-70 ml-1">(unsupported)</span>}
    </Button>
  );
};
