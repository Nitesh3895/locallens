import { motion } from 'framer-motion';
import { Pause, Play, X } from 'lucide-react';
import { useStore } from '../../stores/appStore';
import { api } from '../../lib/api';
import { formatBytes } from '../../lib/format';

export function PausedView() {
  const { progress, pauseReason, currentJob } = useStore();

  const copiedFiles = progress?.copiedFiles ?? currentJob?.copied_files ?? 0;
  const totalFiles = progress?.totalFiles ?? currentJob?.total_files ?? 0;
  const remaining = totalFiles - copiedFiles - (progress?.skippedFiles ?? currentJob?.skipped_files ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-lg mx-auto pt-16 text-center"
    >
      <motion.div
        className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--accent-amber-dim)', border: '1px solid rgba(245,158,11,0.2)' }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <Pause className="w-8 h-8" style={{ color: 'var(--accent-amber)' }} />
      </motion.div>

      <h2 className="font-display text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        Backup Paused
      </h2>

      {pauseReason && (
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 text-sm" style={{
          background: 'var(--accent-amber-dim)',
          color: 'var(--accent-amber)',
          border: '1px solid rgba(245,158,11,0.2)',
        }}>
          {pauseReason}
        </div>
      )}

      <div className="flex justify-center gap-8 mb-8" style={{ color: 'var(--text-secondary)' }}>
        <div>
          <p className="font-mono text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {copiedFiles}
          </p>
          <p className="text-xs">Files copied</p>
        </div>
        <div>
          <p className="font-mono text-xl font-semibold" style={{ color: 'var(--accent-amber)' }}>
            {remaining}
          </p>
          <p className="text-xs">Remaining</p>
        </div>
        {progress?.copiedBytes && (
          <div>
            <p className="font-mono text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              {formatBytes(progress.copiedBytes)}
            </p>
            <p className="text-xs">Transferred</p>
          </div>
        )}
      </div>

      <div className="flex gap-3 justify-center">
        <button
          onClick={() => api.resumeBackup()}
          className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: 'var(--accent-green)',
            color: '#000',
          }}
        >
          <Play className="w-4 h-4" />
          Resume Backup
        </button>
        <button
          onClick={() => api.cancelBackup()}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-colors"
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
