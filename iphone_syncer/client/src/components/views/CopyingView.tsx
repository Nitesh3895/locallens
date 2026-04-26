import { motion } from 'framer-motion';
import { Pause, X, Zap } from 'lucide-react';
import { useStore } from '../../stores/appStore';
import { api } from '../../lib/api';
import { formatBytes, formatSpeed, formatEta } from '../../lib/format';

export function CopyingView() {
  const { progress } = useStore();

  if (!progress || !progress.active) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ color: 'var(--text-tertiary)' }}>Starting backup...</p>
      </div>
    );
  }

  const totalFiles = progress.totalFiles ?? 0;
  const copiedFiles = progress.copiedFiles ?? 0;
  const skippedFiles = progress.skippedFiles ?? 0;
  const failedFiles = progress.failedFiles ?? 0;
  const totalBytes = progress.totalBytes ?? 0;
  const copiedBytes = progress.copiedBytes ?? 0;
  const percent = totalBytes > 0 ? (copiedBytes / totalBytes) * 100 : 0;
  const filePercent = totalFiles > 0 ? ((copiedFiles + skippedFiles) / totalFiles) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto pt-8"
    >
      {/* Big arc progress */}
      <div className="flex items-center justify-center mb-8">
        <div className="relative">
          <svg width="200" height="200" viewBox="0 0 200 200">
            {/* Background arc */}
            <circle
              cx="100" cy="100" r="88"
              fill="none"
              stroke="var(--bg-overlay)"
              strokeWidth="8"
              strokeLinecap="round"
            />
            {/* Progress arc */}
            <motion.circle
              cx="100" cy="100" r="88"
              fill="none"
              stroke="var(--accent-green)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 88}
              strokeDashoffset={2 * Math.PI * 88 * (1 - percent / 100)}
              transform="rotate(-90 100 100)"
              initial={{ strokeDashoffset: 2 * Math.PI * 88 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 88 * (1 - percent / 100) }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {Math.round(percent)}%
            </span>
            <span className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {copiedFiles} / {totalFiles} files
            </span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatBox
          label="Speed"
          value={formatSpeed(progress.currentSpeedBps ?? 0)}
          icon={<Zap className="w-3.5 h-3.5" />}
          color="var(--accent-amber)"
        />
        <StatBox
          label="Transferred"
          value={formatBytes(copiedBytes)}
          sublabel={`of ${formatBytes(totalBytes)}`}
          color="var(--accent-green)"
        />
        <StatBox
          label="ETA"
          value={formatEta(progress.estimatedSecondsRemaining ?? 0)}
          color="var(--text-secondary)"
        />
      </div>

      {/* File progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs mb-1.5">
          <span style={{ color: 'var(--text-secondary)' }}>Overall progress</span>
          <span className="font-mono" style={{ color: 'var(--text-tertiary)' }}>
            {formatBytes(copiedBytes)} / {formatBytes(totalBytes)}
          </span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-overlay)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'var(--accent-green)' }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Active file copies */}
      {progress.activeFiles && progress.activeFiles.length > 0 && (
        <div className="space-y-2 mb-6">
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            Currently copying
          </p>
          {progress.activeFiles.map((f, i) => (
            <div key={i} className="rounded-lg p-3" style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
            }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                  {f.filename}
                </span>
                <span className="text-xs font-mono ml-2" style={{ color: 'var(--accent-amber)' }}>
                  {formatSpeed(f.speedBps)}
                </span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-overlay)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'var(--accent-amber)' }}
                  animate={{ width: `${f.progress * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Counters */}
      <div className="flex gap-4 mb-6 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <span>Copied: <strong style={{ color: 'var(--accent-green)' }}>{copiedFiles}</strong></span>
        <span>Skipped: <strong>{skippedFiles}</strong></span>
        {failedFiles > 0 && (
          <span>Failed: <strong style={{ color: 'var(--accent-red)' }}>{failedFiles}</strong></span>
        )}
      </div>

      {/* Control buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => api.pauseBackup()}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: 'var(--accent-amber-dim)',
            color: 'var(--accent-amber)',
            border: '1px solid rgba(245,158,11,0.2)',
          }}
        >
          <Pause className="w-4 h-4" />
          Pause
        </button>
        <button
          onClick={() => api.cancelBackup()}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: 'var(--accent-red-dim)',
            color: 'var(--accent-red)',
            border: '1px solid rgba(239,68,68,0.15)',
          }}
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

function StatBox({
  label, value, sublabel, icon, color,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-lg p-3 text-center" style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
    }}>
      {icon && <div className="flex justify-center mb-1" style={{ color }}>{icon}</div>}
      <p className="text-sm font-mono font-semibold" style={{ color }}>{value}</p>
      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      {sublabel && <p className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{sublabel}</p>}
    </div>
  );
}
