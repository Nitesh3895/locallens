import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Image, Video, Copy, CheckCircle, Clock, Play, ArrowRight,
  FolderOpen, Smartphone, HardDrive, Shield,
} from 'lucide-react';
import { useStore } from '../../stores/appStore';
import { api } from '../../lib/api';
import { formatBytes } from '../../lib/format';

export function ReadyView() {
  const { compareResult, activeDevice, destFolder, setPhase, setCurrentJob } = useStore();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!compareResult) return null;

  const { totalOnPhone, newFiles, existingFiles, modifiedFiles, totalNewBytes,
    totalExistingBytes, photosNew, videosNew, photosExisting, videosExisting,
    newByFolder } = compareResult;

  const toCopy = newFiles + modifiedFiles;
  const estimatedMinutes = Math.ceil((totalNewBytes / (30 * 1024 * 1024)) / 60);

  const handleStart = async () => {
    if (!activeDevice || !destFolder) return;
    setStarting(true);
    setError(null);
    try {
      const { job } = await api.startBackup(activeDevice.udid, destFolder);
      setCurrentJob(job);
      setPhase('copying');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start backup');
    } finally {
      setStarting(false);
    }
  };

  const folderEntries = Object.entries(newByFolder)
    .filter(([, data]) => data.count > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto pt-6"
    >
      <h2 className="font-display text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        Scan Complete
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Compared {totalOnPhone.toLocaleString()} files on iPhone against your backup folder.
      </p>

      {/* Top-level summary: big numbers */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <SummaryCard
          icon={<Smartphone className="w-4 h-4" />}
          label="On iPhone"
          value={totalOnPhone.toLocaleString()}
          sublabel={formatBytes(totalNewBytes + totalExistingBytes)}
          color="var(--text-primary)"
          bgColor="var(--bg-overlay)"
        />
        <SummaryCard
          icon={<CheckCircle className="w-4 h-4" />}
          label="Already Backed Up"
          value={existingFiles.toLocaleString()}
          sublabel={formatBytes(totalExistingBytes)}
          color="var(--accent-green)"
          bgColor="var(--accent-green-dim)"
        />
        <SummaryCard
          icon={<Copy className="w-4 h-4" />}
          label="New to Copy"
          value={toCopy.toLocaleString()}
          sublabel={formatBytes(totalNewBytes)}
          color="var(--accent-amber)"
          bgColor="var(--accent-amber-dim)"
        />
      </div>

      {/* Breakdown: photos vs videos (new) */}
      {toCopy > 0 && (
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
            New files breakdown
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 rounded-lg p-3" style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
            }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--accent-amber-dim)' }}>
                <Image className="w-5 h-5" style={{ color: 'var(--accent-amber)' }} />
              </div>
              <div>
                <p className="font-mono text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {photosNew.toLocaleString()}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  new photos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg p-3" style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
            }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(59,130,246,0.12)' }}>
                <Video className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} />
              </div>
              <div>
                <p className="font-mono text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {videosNew.toLocaleString()}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  new videos
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Folder breakdown for new files */}
      {toCopy > 0 && folderEntries.length > 0 && (
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
            New files by folder
          </p>
          <div className="rounded-lg overflow-hidden" style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
          }}>
            {folderEntries.map(([folder, data], i) => (
              <div
                key={folder}
                className="flex items-center justify-between px-4 py-2.5"
                style={{
                  borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--accent-amber)' }} />
                  <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
                    {folder}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono" style={{ color: 'var(--accent-amber)' }}>
                    {data.count.toLocaleString()} files
                  </span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
                    {formatBytes(data.bytes)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estimate + destination info */}
      {toCopy > 0 && (
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-lg" style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
          }}>
            <Clock className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              ~{estimatedMinutes} min at typical USB speed
            </span>
          </div>
          <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-lg" style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
          }}>
            <Shield className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              DCIM folder structure preserved
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{
          background: 'var(--accent-red-dim)',
          color: 'var(--accent-red)',
          border: '1px solid rgba(239,68,68,0.15)',
        }}>
          {error}
        </div>
      )}

      {/* Action */}
      {toCopy === 0 ? (
        <div className="text-center py-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--accent-green-dim)' }}>
            <CheckCircle className="w-7 h-7" style={{ color: 'var(--accent-green)' }} />
          </div>
          <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
            Everything is already backed up
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            All {existingFiles.toLocaleString()} files on your iPhone are already on the destination.
          </p>
        </div>
      ) : (
        <button
          onClick={handleStart}
          disabled={starting}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-xl text-base font-semibold transition-all disabled:opacity-60"
          style={{
            background: 'var(--accent-green)',
            color: '#000',
          }}
        >
          <Play className="w-5 h-5" />
          {starting
            ? 'Starting...'
            : `Start Backup — ${toCopy.toLocaleString()} files (${formatBytes(totalNewBytes)})`}
          {!starting && <ArrowRight className="w-4 h-4" />}
        </button>
      )}

      {/* Existing files quick summary */}
      {existingFiles > 0 && toCopy > 0 && (
        <p className="text-xs text-center mt-3" style={{ color: 'var(--text-tertiary)' }}>
          {existingFiles.toLocaleString()} files ({photosExisting.toLocaleString()} photos, {videosExisting.toLocaleString()} videos) already backed up — will be skipped
        </p>
      )}
    </motion.div>
  );
}

function SummaryCard({
  icon, label, value, sublabel, color, bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  color: string;
  bgColor: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg p-4"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
        style={{ background: bgColor, color }}>
        {icon}
      </div>
      <p className="font-mono text-xl font-semibold" style={{ color }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      {sublabel && (
        <p className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{sublabel}</p>
      )}
    </motion.div>
  );
}
