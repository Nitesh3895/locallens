import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Image, HardDrive, ArrowRight, FolderOpen } from 'lucide-react';
import { useStore } from '../../stores/appStore';
import { api } from '../../lib/api';
import { formatBytes } from '../../lib/format';

export function ConnectedView() {
  const { activeDevice, selectedDisk, destFolder, setPhase, setCompareResult } = useStore();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canScan = !!activeDevice && !!destFolder;

  const handleScan = async () => {
    if (!activeDevice || !destFolder) return;
    setScanning(true);
    setError(null);
    setPhase('scanning');

    try {
      const result = await api.compare(activeDevice.udid, destFolder);
      setCompareResult(result);
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
      setPhase('connected');
    } finally {
      setScanning(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto pt-8"
    >
      <h2 className="font-display text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        Ready to scan
      </h2>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
        Compare your iPhone library against the destination folder to find new photos and videos.
      </p>

      {/* Source + Destination cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-lg p-4" style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--accent-amber-dim)' }}>
              <Image className="w-4 h-4" style={{ color: 'var(--accent-amber)' }} />
            </div>
            <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Source
            </span>
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {activeDevice?.name || 'No device'}
          </p>
          {activeDevice && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              iOS {activeDevice.iosVersion} — connected via USB
            </p>
          )}
        </div>

        <div className="rounded-lg p-4" style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--accent-green-dim)' }}>
              <HardDrive className="w-4 h-4" style={{ color: 'var(--accent-green)' }} />
            </div>
            <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Destination
            </span>
          </div>
          {selectedDisk ? (
            <>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {selectedDisk.name}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {selectedDisk.availableGB} GB available
              </p>
              {destFolder && (
                <div className="mt-2 flex items-center gap-1.5">
                  <FolderOpen className="w-3 h-3" style={{ color: 'var(--accent-amber)' }} />
                  <p className="text-xs font-mono truncate" style={{ color: 'var(--accent-amber)' }}>
                    {destFolder.split('/').slice(-2).join('/')}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs" style={{ color: 'var(--accent-red)' }}>
              Select a destination drive
            </p>
          )}
        </div>
      </div>

      {/* How it works hint */}
      <div className="mb-6 px-4 py-3 rounded-lg" style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Smart sync:</strong>{' '}
          VaultSync compares your iPhone DCIM folders against the destination and only copies new files.
          Existing files with matching sizes are automatically skipped.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{
          background: 'var(--accent-red-dim)',
          color: 'var(--accent-red)',
          border: '1px solid rgba(239,68,68,0.15)',
        }}>
          {error}
        </div>
      )}

      {/* Scan button */}
      <button
        onClick={handleScan}
        disabled={!canScan || scanning}
        className="w-full flex items-center justify-center gap-3 py-4 rounded-xl text-base font-medium transition-all disabled:opacity-40"
        style={{
          background: canScan ? 'var(--accent-amber)' : 'var(--bg-elevated)',
          color: canScan ? '#000' : 'var(--text-tertiary)',
          border: canScan ? 'none' : '1px solid var(--border-default)',
        }}
      >
        <Search className="w-5 h-5" />
        {scanning ? 'Comparing files...' : 'Scan & Compare'}
        {canScan && !scanning && <ArrowRight className="w-4 h-4" />}
      </button>

      {!canScan && (
        <p className="text-xs text-center mt-3" style={{ color: 'var(--text-tertiary)' }}>
          {!activeDevice
            ? 'Connect your iPhone first'
            : 'Navigate to your backup folder using the folder picker on the left'}
        </p>
      )}
    </motion.div>
  );
}
