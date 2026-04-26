import { motion } from 'framer-motion';
import { CheckCircle, AlertTriangle, RotateCcw } from 'lucide-react';
import { useStore } from '../../stores/appStore';
import { api } from '../../lib/api';
import { formatBytes, formatDuration } from '../../lib/format';

export function CompletedView() {
  const { currentJob, progress, setPhase, setCompareResult, setCurrentJob, setProgress } = useStore();

  const copiedFiles = progress?.copiedFiles ?? currentJob?.copied_files ?? 0;
  const skippedFiles = progress?.skippedFiles ?? currentJob?.skipped_files ?? 0;
  const failedFiles = progress?.failedFiles ?? currentJob?.failed_files ?? 0;
  const totalBytes = progress?.copiedBytes ?? currentJob?.copied_bytes ?? 0;

  const startedAt = currentJob?.started_at ? new Date(currentJob.started_at).getTime() : 0;
  const duration = startedAt > 0 ? Math.round((Date.now() - startedAt) / 1000) : 0;

  const handleNewBackup = () => {
    setCompareResult(null);
    setCurrentJob(null);
    setProgress(null);
    setPhase('connected');
  };

  const handleRetryFailed = async () => {
    if (!currentJob) return;
    try {
      await api.retryFailed(currentJob.id);
      await api.resumeBackup(currentJob.id);
      setPhase('copying');
    } catch (err) {
      console.error('Retry failed:', err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-lg mx-auto pt-12 text-center"
    >
      <motion.div
        className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
        style={{
          background: failedFiles > 0 ? 'var(--accent-amber-dim)' : 'var(--accent-green-dim)',
          border: `1px solid ${failedFiles > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}`,
        }}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      >
        {failedFiles > 0 ? (
          <AlertTriangle className="w-8 h-8" style={{ color: 'var(--accent-amber)' }} />
        ) : (
          <CheckCircle className="w-8 h-8" style={{ color: 'var(--accent-green)' }} />
        )}
      </motion.div>

      <h2 className="font-display text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        {failedFiles > 0 ? 'Backup Completed with Errors' : 'Backup Complete'}
      </h2>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
        {failedFiles > 0
          ? `${failedFiles} file${failedFiles > 1 ? 's' : ''} failed to copy`
          : 'All files have been safely backed up and verified'}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-8">
        <StatCard label="Files Copied" value={copiedFiles.toLocaleString()} color="var(--accent-green)" />
        <StatCard label="Already Existed" value={skippedFiles.toLocaleString()} color="var(--text-secondary)" />
        <StatCard label="Data Transferred" value={formatBytes(totalBytes)} color="var(--accent-amber)" />
        <StatCard label="Duration" value={formatDuration(duration)} color="var(--text-secondary)" />
      </div>

      {failedFiles > 0 && (
        <div className="mb-6 p-4 rounded-lg text-left" style={{
          background: 'var(--accent-red-dim)',
          border: '1px solid rgba(239,68,68,0.15)',
        }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--accent-red)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--accent-red)' }}>
              {failedFiles} failed file{failedFiles > 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={handleRetryFailed}
            className="text-xs underline"
            style={{ color: 'var(--accent-red)' }}
          >
            Retry failed files
          </button>
        </div>
      )}

      <div className="space-y-3">
        <button
          onClick={handleNewBackup}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium"
          style={{
            background: 'var(--accent-amber-dim)',
            color: 'var(--accent-amber)',
            border: '1px solid rgba(245,158,11,0.2)',
          }}
        >
          <RotateCcw className="w-4 h-4" />
          Scan Again
        </button>
      </div>
    </motion.div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg p-4"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      <p className="font-mono text-lg font-semibold" style={{ color }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
    </motion.div>
  );
}
