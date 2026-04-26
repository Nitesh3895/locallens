import { useState, useEffect, useRef } from 'react';
import {
  Smartphone, HardDrive, FolderOpen, Battery, Usb,
  ChevronRight, Plus, Check, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../stores/appStore';
import { api, type FolderEntry } from '../lib/api';

export function LeftPanel() {
  return (
    <aside
      className="w-[280px] flex-shrink-0 border-r flex flex-col overflow-y-auto"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}
    >
      <DeviceCard />
      <DiskCard />
      <FolderPicker />
    </aside>
  );
}

function DeviceCard() {
  const { activeDevice } = useStore();

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Smartphone className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          iPhone
        </span>
      </div>

      <div className="rounded-lg p-4" style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
        {!activeDevice ? (
          <div className="text-center py-3">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center"
              style={{ background: 'var(--bg-overlay)' }}>
              <Usb className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No iPhone detected
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Connect via USB and tap Trust
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {activeDevice.name}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  iOS {activeDevice.iosVersion}
                </p>
              </div>
              {activeDevice.batteryLevel !== null && (
                <div className="flex items-center gap-1">
                  <Battery className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {activeDevice.batteryLevel}%
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-green)' }} />
              <span className="text-xs" style={{ color: 'var(--accent-green)' }}>
                Connected via USB — ready to scan
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DiskCard() {
  const { disks, selectedDisk, setSelectedDisk, setDestFolder } = useStore();

  return (
    <div className="p-4 pt-0">
      <div className="flex items-center gap-2 mb-3">
        <HardDrive className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          Destination SSD
        </span>
      </div>

      <div className="rounded-lg p-4" style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
        {disks.length === 0 ? (
          <div className="text-center py-3">
            <HardDrive className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No external drives
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Connect an SSD or external drive
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {disks.map((disk) => (
              <button
                key={disk.mountPath}
                onClick={() => {
                  setSelectedDisk(disk);
                  setDestFolder(disk.mountPath);
                }}
                className="w-full text-left p-2 rounded-md transition-colors"
                style={{
                  background: selectedDisk?.mountPath === disk.mountPath
                    ? 'var(--accent-amber-dim)'
                    : 'transparent',
                  border: selectedDisk?.mountPath === disk.mountPath
                    ? '1px solid rgba(245,158,11,0.2)'
                    : '1px solid transparent',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {disk.name}
                  </span>
                  {selectedDisk?.mountPath === disk.mountPath && (
                    <Check className="w-3.5 h-3.5" style={{ color: 'var(--accent-amber)' }} />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {disk.availableGB} GB free of {disk.totalGB} GB
                  </span>
                  {disk.connectionType !== 'unknown' && (
                    <span className="text-xs px-1 rounded" style={{
                      background: 'var(--bg-overlay)',
                      color: 'var(--text-tertiary)',
                    }}>
                      {disk.connectionType}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-overlay)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${((disk.totalGB - disk.availableGB) / disk.totalGB) * 100}%`,
                      background: 'var(--accent-amber)',
                      opacity: 0.6,
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FolderPicker() {
  const { selectedDisk, destFolder, setDestFolder } = useStore();
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const initializedForDisk = useRef<string | null>(null);

  const loadFolders = async (dirPath: string) => {
    setLoading(true);
    try {
      const result = await api.getFolders(dirPath);
      setFolders(result.folders);
      setCurrentPath(dirPath);
    } catch {
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  const navigateTo = (dirPath: string) => {
    setDestFolder(dirPath);
    loadFolders(dirPath);
  };

  const createNewFolder = async () => {
    if (!newFolderName.trim() || !currentPath) return;
    const fullPath = `${currentPath}/${newFolderName.trim()}`;
    try {
      await api.createFolder(fullPath);
      setNewFolderName('');
      setCreating(false);
      loadFolders(currentPath);
      setDestFolder(fullPath);
    } catch (err) {
      console.error('Create folder failed:', err);
    }
  };

  useEffect(() => {
    if (selectedDisk && initializedForDisk.current !== selectedDisk.mountPath) {
      initializedForDisk.current = selectedDisk.mountPath;
      loadFolders(selectedDisk.mountPath);
    }
  }, [selectedDisk?.mountPath]);

  const breadcrumbs = currentPath ? currentPath.split('/').filter(Boolean) : [];

  if (!selectedDisk) return null;

  return (
    <div className="p-4 pt-0 flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            Destination
          </span>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="p-1 rounded transition-colors hover:bg-white/5"
        >
          <Plus className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {breadcrumbs.map((crumb, i) => {
          const crumbPath = '/' + breadcrumbs.slice(0, i + 1).join('/');
          return (
            <span key={crumbPath} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3" />}
              <button
                onClick={() => navigateTo(crumbPath)}
                className="hover:underline"
                style={{ color: i === breadcrumbs.length - 1 ? 'var(--text-primary)' : undefined }}
              >
                {crumb}
              </button>
            </span>
          );
        })}
      </div>

      <div className="text-xs font-mono px-2 py-1.5 rounded mb-2 truncate" style={{
        background: 'var(--accent-amber-dim)',
        color: 'var(--accent-amber)',
        border: '1px solid rgba(245,158,11,0.15)',
      }}>
        {destFolder || currentPath || selectedDisk.mountPath}
      </div>

      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mb-2 overflow-hidden"
          >
            <div className="flex gap-1">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createNewFolder()}
                placeholder="Folder name"
                autoFocus
                className="flex-1 text-xs px-2 py-1.5 rounded outline-none"
                style={{
                  background: 'var(--bg-overlay)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)',
                }}
              />
              <button onClick={createNewFolder} className="p-1.5 rounded" style={{ background: 'var(--accent-amber-dim)' }}>
                <Check className="w-3 h-3" style={{ color: 'var(--accent-amber)' }} />
              </button>
              <button onClick={() => { setCreating(false); setNewFolderName(''); }} className="p-1.5 rounded hover:bg-white/5">
                <X className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto space-y-0.5 rounded-lg p-1" style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
      }}>
        {loading ? (
          <div className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>
            Loading...
          </div>
        ) : folders.length === 0 ? (
          <div className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>
            Empty folder
          </div>
        ) : (
          folders.map((folder) => (
            <button
              key={folder.path}
              onClick={() => navigateTo(folder.path)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors hover:bg-white/5"
            >
              <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent-amber)' }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                  {folder.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {folder.itemCount} items
                </p>
              </div>
              <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
