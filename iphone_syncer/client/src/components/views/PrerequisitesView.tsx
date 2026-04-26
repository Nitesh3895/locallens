import { useState } from 'react';
import { Check, X, Copy, RefreshCw, Terminal } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '../../stores/appStore';
import { api } from '../../lib/api';

const INSTALL_COMMAND = 'pip install pymobiledevice3 && brew install libimobiledevice';

export function PrerequisitesView() {
  const { prerequisites, setPrerequisites, setPhase } = useStore();
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);

  const items = [
    { key: 'python3', label: 'Python 3', desc: 'Python runtime for AFC bridge' },
    { key: 'pymobiledevice3', label: 'pymobiledevice3', desc: 'iPhone communication over USB (no mounting needed)' },
    { key: 'libimobiledevice', label: 'libimobiledevice', desc: 'Device detection (optional, improves polling)' },
  ];

  const coreReady = prerequisites['python3'] && prerequisites['pymobiledevice3'];

  const recheck = async () => {
    setChecking(true);
    try {
      const { prerequisites: p, ready } = await api.prerequisites();
      setPrerequisites(p);
      if (ready) setPhase('waiting');
    } catch {
      // server not available
    } finally {
      setChecking(false);
    }
  };

  const copyCommand = () => {
    navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-lg mx-auto pt-12"
    >
      <div className="text-center mb-8">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--accent-amber-dim)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <Terminal className="w-7 h-7" style={{ color: 'var(--accent-amber)' }} />
        </div>
        <h2 className="font-display text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          Setup Required
        </h2>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
          VaultSync uses AFC protocol to access your iPhone directly over USB — no mounting or kernel extensions needed.
        </p>
      </div>

      <div className="space-y-2 mb-6">
        {items.map((item) => {
          const ok = prerequisites[item.key];
          const isOptional = item.key === 'libimobiledevice';
          return (
            <div
              key={item.key}
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{
                background: ok
                  ? 'var(--accent-green-dim)'
                  : isOptional
                    ? 'var(--bg-elevated)'
                    : 'var(--accent-red-dim)',
                border: `1px solid ${
                  ok ? 'rgba(16,185,129,0.15)'
                    : isOptional ? 'var(--border-default)'
                    : 'rgba(239,68,68,0.15)'
                }`,
              }}
            >
              {ok ? (
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
              ) : (
                <X className="w-4 h-4 flex-shrink-0" style={{ color: isOptional ? 'var(--text-tertiary)' : 'var(--accent-red)' }} />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium font-mono" style={{ color: 'var(--text-primary)' }}>
                    {item.label}
                  </p>
                  {isOptional && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{
                      background: 'var(--bg-overlay)',
                      color: 'var(--text-tertiary)',
                    }}>
                      optional
                    </span>
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {item.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {!coreReady && (
        <div className="rounded-lg p-4 mb-4" style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
        }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
            Install with:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono px-3 py-2 rounded overflow-x-auto" style={{
              background: 'var(--bg-base)',
              color: 'var(--accent-amber)',
            }}>
              {INSTALL_COMMAND}
            </code>
            <button
              onClick={copyCommand}
              className="p-2 rounded transition-colors hover:bg-white/5"
              title="Copy command"
            >
              {copied ? (
                <Check className="w-4 h-4" style={{ color: 'var(--accent-green)' }} />
              ) : (
                <Copy className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              )}
            </button>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
            No kernel extensions or system modifications required.
          </p>
        </div>
      )}

      <button
        onClick={recheck}
        disabled={checking}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-colors"
        style={{
          background: coreReady ? 'var(--accent-green-dim)' : 'var(--bg-elevated)',
          color: coreReady ? 'var(--accent-green)' : 'var(--text-primary)',
          border: coreReady ? '1px solid rgba(16,185,129,0.2)' : '1px solid var(--border-default)',
        }}
      >
        <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
        {checking ? 'Checking...' : coreReady ? 'All set — continue' : 'Check again'}
      </button>
    </motion.div>
  );
}
