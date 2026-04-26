import { motion } from 'framer-motion';
import { Smartphone, Cable } from 'lucide-react';

export function WaitingView() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full"
    >
      <div className="relative mb-8">
        {/* iPhone outline */}
        <motion.div
          className="w-20 h-36 rounded-2xl flex items-center justify-center"
          style={{
            border: '2px solid var(--border-strong)',
            background: 'var(--bg-elevated)',
          }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Smartphone className="w-8 h-8" style={{ color: 'var(--text-tertiary)' }} />
        </motion.div>

        {/* Pulsing cable */}
        <motion.div
          className="absolute -bottom-6 left-1/2 -translate-x-1/2"
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Cable className="w-6 h-6" style={{ color: 'var(--accent-amber)' }} />
        </motion.div>
      </div>

      <h2 className="font-display text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        Connect your iPhone
      </h2>
      <p className="text-sm text-center max-w-xs" style={{ color: 'var(--text-secondary)' }}>
        Plug in your iPhone via USB cable. When prompted, unlock it and tap <strong>Trust</strong> on the device.
      </p>

      <div className="mt-8 flex items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <motion.div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--accent-amber)' }}
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        Listening for devices...
      </div>
    </motion.div>
  );
}
