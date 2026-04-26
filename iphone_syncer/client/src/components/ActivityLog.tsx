import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, SkipForward, AlertCircle, Loader2, Image, Film, ChevronDown, ChevronUp } from 'lucide-react';
import { useStore } from '../stores/appStore';

export function ActivityLog() {
  const { fileLog } = useStore();
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div
      className="border-t overflow-hidden flex flex-col"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'var(--bg-surface)',
        height: collapsed ? '36px' : '160px',
        transition: 'height 0.2s ease',
      }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between px-4 py-2 flex-shrink-0 w-full hover:bg-white/[0.02] transition-colors"
        style={{ borderBottom: collapsed ? 'none' : '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            Activity
          </span>
          {fileLog.length > 0 && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{
              background: 'var(--bg-overlay)',
              color: 'var(--text-tertiary)',
            }}>
              {fileLog.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {collapsed && fileLog.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Last: {fileLog[0]?.filename}
            </span>
          )}
          {collapsed ? (
            <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {fileLog.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                File activity will appear here during backup
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {fileLog.map((entry) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex items-center gap-2 px-2 py-1 text-xs"
                >
                  <StatusIcon status={entry.status} />
                  <FileIcon filename={entry.filename} />
                  <span className="truncate flex-1 font-mono" style={{ color: 'var(--text-primary)' }}>
                    {entry.filename}
                  </span>
                  <StatusLabel status={entry.status} error={entry.error} />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'done':
      return <CheckCircle className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />;
    case 'skipped':
      return <SkipForward className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />;
    case 'failed':
      return <AlertCircle className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--accent-red)' }} />;
    case 'copying':
      return <Loader2 className="w-3 h-3 flex-shrink-0 animate-spin" style={{ color: 'var(--accent-amber)' }} />;
    default:
      return null;
  }
}

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const isVideo = ['mov', 'mp4', 'm4v', 'avi', 'mkv'].includes(ext);

  return isVideo ? (
    <Film className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--accent-blue)' }} />
  ) : (
    <Image className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--accent-amber)' }} />
  );
}

function StatusLabel({ status, error }: { status: string; error?: string }) {
  switch (status) {
    case 'done':
      return <span style={{ color: 'var(--accent-green)' }}>copied</span>;
    case 'skipped':
      return <span style={{ color: 'var(--text-tertiary)' }}>skipped</span>;
    case 'failed':
      return (
        <span style={{ color: 'var(--accent-red)' }} title={error}>
          failed
        </span>
      );
    case 'copying':
      return <span style={{ color: 'var(--accent-amber)' }}>copying</span>;
    default:
      return null;
  }
}
