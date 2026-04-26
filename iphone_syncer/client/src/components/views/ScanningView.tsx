import { motion } from 'framer-motion';
import { Search, FolderOpen, ArrowLeftRight } from 'lucide-react';
import { useStore } from '../../stores/appStore';

export function ScanningView() {
  const { scanStatus } = useStore();

  const scanned = scanStatus?.scanned ?? 0;
  const newSoFar = scanStatus?.newSoFar ?? 0;
  const existingSoFar = scanStatus?.existingSoFar ?? 0;
  const statusText = scanStatus?.statusText ?? 'Connecting to iPhone...';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full"
    >
      <motion.div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
        style={{ background: 'var(--accent-amber-dim)', border: '1px solid rgba(245,158,11,0.2)' }}
        animate={{ rotate: [0, 5, -5, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <ArrowLeftRight className="w-8 h-8" style={{ color: 'var(--accent-amber)' }} />
      </motion.div>

      <h2 className="font-display text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        Comparing Files
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        {statusText}
      </p>

      {scanned > 0 && (
        <div className="text-center mb-6">
          <motion.p
            className="font-mono text-3xl font-semibold mb-2"
            style={{ color: 'var(--accent-amber)' }}
            key={scanned}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
          >
            {scanned.toLocaleString()}
          </motion.p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            files compared
          </p>
        </div>
      )}

      {/* Live counters */}
      {scanned > 0 && (
        <div className="flex gap-6 mb-8">
          <div className="text-center">
            <p className="font-mono text-lg font-semibold" style={{ color: 'var(--accent-green)' }}>
              {newSoFar.toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>new</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {existingSoFar.toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>already backed up</p>
          </div>
        </div>
      )}

      {/* Animated folder items */}
      <div className="space-y-1">
        {['DCIM/100APPLE', 'DCIM/109APPLE', 'DCIM/110APPLE'].map((folder, i) => (
          <motion.div
            key={folder}
            className="flex items-center gap-2 px-3 py-1"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
          >
            <FolderOpen className="w-3 h-3" style={{ color: 'var(--accent-amber)' }} />
            <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
              {folder}/
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
