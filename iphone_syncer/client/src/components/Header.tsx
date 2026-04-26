import { Shield, Wifi, WifiOff } from 'lucide-react';
import { useStore } from '../stores/appStore';

export function Header() {
  const { wsConnected, activeDevice, phase } = useStore();

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
      <div className="flex items-center gap-3">
        <Shield className="w-5 h-5 text-amber-DEFAULT" />
        <h1 className="font-display font-bold text-lg tracking-tight" style={{ color: 'var(--text-primary)' }}>
          VaultSync
        </h1>
        <span className="text-xs font-mono px-2 py-0.5 rounded"
          style={{ background: 'var(--bg-overlay)', color: 'var(--text-tertiary)' }}>
          v0.1
        </span>
      </div>

      <div className="flex items-center gap-4">
        {activeDevice && (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <StatusDot phase={phase} />
            <span>{activeDevice.name}</span>
            {activeDevice.batteryLevel !== null && (
              <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {activeDevice.batteryLevel}%
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {wsConnected ? (
            <Wifi className="w-3.5 h-3.5" style={{ color: 'var(--accent-green)' }} />
          ) : (
            <WifiOff className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
          )}
          <span className="text-xs" style={{ color: wsConnected ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
            {wsConnected ? 'Connected' : 'Offline'}
          </span>
        </div>
      </div>
    </header>
  );
}

function StatusDot({ phase }: { phase: string }) {
  const colorMap: Record<string, string> = {
    prerequisites: 'var(--text-tertiary)',
    waiting: 'var(--text-tertiary)',
    connected: 'var(--accent-amber)',
    scanning: 'var(--accent-amber)',
    ready: 'var(--accent-amber)',
    copying: 'var(--accent-green)',
    paused: 'var(--accent-amber)',
    completed: 'var(--accent-green)',
  };

  const shouldPulse = phase === 'scanning' || phase === 'copying';

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${shouldPulse ? 'animate-pulse-dot' : ''}`}
      style={{ backgroundColor: colorMap[phase] || 'var(--text-tertiary)' }}
    />
  );
}
