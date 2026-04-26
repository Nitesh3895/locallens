import { create } from 'zustand';
import type {
  Device, ExternalDisk, CompareResult, BackupJob, ProgressUpdate,
} from '../lib/api';

export type AppPhase =
  | 'prerequisites'
  | 'waiting'
  | 'connected'
  | 'scanning'
  | 'ready'
  | 'copying'
  | 'paused'
  | 'completed';

interface FileLogEntry {
  id: string;
  filename: string;
  status: 'done' | 'skipped' | 'failed' | 'copying';
  size?: number;
  speed?: string;
  error?: string;
  timestamp: number;
}

interface ScanStatus {
  scanned: number;
  total: number;
  newSoFar: number;
  existingSoFar: number;
  statusText: string;
}

interface AppState {
  wsConnected: boolean;
  phase: AppPhase;

  prerequisites: Record<string, boolean>;

  devices: Device[];
  activeDevice: Device | null;

  disks: ExternalDisk[];
  selectedDisk: ExternalDisk | null;
  destFolder: string;

  compareResult: CompareResult | null;
  scanStatus: ScanStatus | null;

  currentJob: BackupJob | null;
  progress: ProgressUpdate | null;
  pauseReason: string | null;

  fileLog: FileLogEntry[];

  interruptedJobs: Array<{
    id: number;
    deviceId: string;
    destFolder: string;
    status: string;
    copiedFiles: number;
    totalFiles: number;
  }>;

  // Actions
  setConnected: (c: boolean) => void;
  setPhase: (p: AppPhase) => void;
  setPrerequisites: (p: Record<string, boolean>) => void;
  setDevices: (d: Device[]) => void;
  setActiveDevice: (d: Device | null) => void;
  setDisks: (d: ExternalDisk[]) => void;
  setSelectedDisk: (d: ExternalDisk | null) => void;
  setDestFolder: (f: string) => void;
  setCompareResult: (r: CompareResult | null) => void;
  setCurrentJob: (j: BackupJob | null) => void;
  setProgress: (p: ProgressUpdate | null) => void;
  setPauseReason: (r: string | null) => void;
  addFileLog: (entry: FileLogEntry) => void;
  handleWsEvent: (type: string, payload: Record<string, unknown>) => void;
}

export const useStore = create<AppState>((set, get) => ({
  wsConnected: false,
  phase: 'prerequisites',
  prerequisites: {},
  devices: [],
  activeDevice: null,
  disks: [],
  selectedDisk: null,
  destFolder: '',
  compareResult: null,
  scanStatus: null,
  currentJob: null,
  progress: null,
  pauseReason: null,
  fileLog: [],
  interruptedJobs: [],

  setConnected: (c) => set({ wsConnected: c }),
  setPhase: (p) => set({ phase: p }),
  setPrerequisites: (p) => set({ prerequisites: p }),
  setDevices: (d) => set({ devices: d }),
  setActiveDevice: (d) => set({ activeDevice: d }),
  setDisks: (d) => set({ disks: d }),
  setSelectedDisk: (d) => set({ selectedDisk: d }),
  setDestFolder: (f) => set({ destFolder: f }),
  setCompareResult: (r) => set({ compareResult: r }),
  setCurrentJob: (j) => set({ currentJob: j }),
  setProgress: (p) => set({ progress: p }),
  setPauseReason: (r) => set({ pauseReason: r }),
  addFileLog: (entry) =>
    set((s) => ({
      fileLog: [entry, ...s.fileLog].slice(0, 100),
    })),

  handleWsEvent: (type, payload) => {
    const state = get();

    switch (type) {
      case 'init:state': {
        const devices = payload['devices'] as Device[];
        const disks = payload['disks'] as ExternalDisk[];
        const interruptedJobs = (payload['interruptedJobs'] as typeof state.interruptedJobs) || [];

        set({
          devices,
          disks,
          interruptedJobs,
          activeDevice: devices[0] ?? null,
          selectedDisk: disks[0] ?? null,
        });

        if (devices.length > 0) {
          set({ phase: 'connected' });
        } else if (state.phase === 'prerequisites') {
          // stay in prerequisites until check passes
        } else {
          set({ phase: 'waiting' });
        }
        break;
      }

      case 'device:connected': {
        const device: Device = {
          udid: payload['udid'] as string,
          name: payload['name'] as string,
          iosVersion: payload['iosVersion'] as string,
          serialNumber: '',
          productType: (payload['productType'] as string) || '',
          batteryLevel: (payload['batteryLevel'] as number) ?? null,
        };
        const devices = [...state.devices.filter((d) => d.udid !== device.udid), device];
        set({
          devices,
          activeDevice: device,
          phase: state.phase === 'waiting' || state.phase === 'prerequisites' ? 'connected' : state.phase,
        });
        break;
      }

      case 'device:disconnected': {
        const udid = payload['udid'] as string;
        const devices = state.devices.filter((d) => d.udid !== udid);
        set({
          devices,
          activeDevice: devices[0] ?? null,
          phase: devices.length === 0 ? 'waiting' : state.phase,
        });
        break;
      }

      case 'device:trust_required':
        break;

      case 'device:locked':
        set({ pauseReason: 'iPhone is locked — unlock to continue' });
        break;

      case 'disk:connected': {
        const disk: ExternalDisk = {
          name: payload['name'] as string,
          mountPath: payload['mountPath'] as string,
          totalGB: payload['totalGB'] as number,
          availableGB: payload['availableGB'] as number,
          totalBytes: 0,
          availableBytes: 0,
          filesystem: (payload['filesystem'] as string) || '',
          connectionType: (payload['connectionType'] as string) || '',
        };
        const disks = [...state.disks.filter((d) => d.mountPath !== disk.mountPath), disk];
        set({ disks, selectedDisk: state.selectedDisk ?? disk });
        break;
      }

      case 'disk:disconnected': {
        const mountPath = (payload['mountPath'] as string) || '';
        const disks = state.disks.filter((d) => d.mountPath !== mountPath);
        set({
          disks,
          selectedDisk: state.selectedDisk?.mountPath === mountPath ? (disks[0] ?? null) : state.selectedDisk,
        });
        break;
      }

      case 'disk:lowspace':
        set({ pauseReason: `Low disk space: ${payload['availableGB']}GB available` });
        break;

      case 'scan:progress':
        set({
          scanStatus: {
            scanned: payload['scanned'] as number,
            total: payload['total'] as number,
            newSoFar: (payload['newSoFar'] as number) || 0,
            existingSoFar: (payload['existingSoFar'] as number) || 0,
            statusText: 'Comparing files...',
          },
        });
        break;

      case 'scan:status':
        set({
          scanStatus: {
            ...(state.scanStatus || { scanned: 0, total: 0, newSoFar: 0, existingSoFar: 0, statusText: '' }),
            statusText: payload['status'] === 'indexing_destination'
              ? `Indexing destination (${(payload['existingFiles'] as number || 0).toLocaleString()} files)...`
              : (payload['status'] as string),
          },
        });
        break;

      case 'compare:complete':
        set({
          compareResult: {
            totalOnPhone: payload['totalOnPhone'] as number,
            newFiles: payload['newFiles'] as number,
            existingFiles: payload['existingFiles'] as number,
            modifiedFiles: payload['modifiedFiles'] as number,
            totalNewBytes: payload['totalNewBytes'] as number,
            totalExistingBytes: payload['totalExistingBytes'] as number,
            photosNew: payload['photosNew'] as number,
            videosNew: payload['videosNew'] as number,
            photosExisting: payload['photosExisting'] as number,
            videosExisting: payload['videosExisting'] as number,
            newByFolder: payload['newByFolder'] as Record<string, { count: number; bytes: number }>,
          },
          phase: 'ready',
          scanStatus: null,
        });
        break;

      case 'job:started':
        set({ phase: 'copying', pauseReason: null });
        break;

      case 'job:paused':
        set({
          phase: 'paused',
          pauseReason: state.pauseReason || 'Paused',
        });
        break;

      case 'job:resumed':
        set({ phase: 'copying', pauseReason: null });
        break;

      case 'job:completed': {
        set({
          phase: 'completed',
          currentJob: state.currentJob
            ? { ...state.currentJob, status: 'completed' }
            : null,
        });
        break;
      }

      case 'progress:update': {
        set({
          progress: {
            active: true,
            totalFiles: payload['totalFiles'] as number,
            copiedFiles: payload['copiedFiles'] as number,
            skippedFiles: payload['skippedFiles'] as number,
            failedFiles: payload['failedFiles'] as number,
            pendingFiles: payload['pendingFiles'] as number,
            totalBytes: payload['totalBytes'] as number,
            copiedBytes: payload['copiedBytes'] as number,
            currentSpeedBps: payload['currentSpeedBps'] as number,
            avgSpeedBps: payload['avgSpeedBps'] as number,
            estimatedSecondsRemaining: payload['estimatedSecondsRemaining'] as number,
            activeFiles: payload['activeFiles'] as Array<{
              filename: string;
              progress: number;
              speedBps: number;
            }>,
          },
        });
        break;
      }

      case 'file:done':
        state.addFileLog({
          id: `done-${payload['fileId']}-${Date.now()}`,
          filename: payload['filename'] as string,
          status: 'done',
          timestamp: Date.now(),
        });
        break;

      case 'file:skipped':
        state.addFileLog({
          id: `skip-${payload['fileId']}-${Date.now()}`,
          filename: payload['filename'] as string,
          status: 'skipped',
          timestamp: Date.now(),
        });
        break;

      case 'file:failed':
        state.addFileLog({
          id: `fail-${payload['fileId']}-${Date.now()}`,
          filename: payload['filename'] as string,
          status: 'failed',
          error: payload['error'] as string,
          timestamp: Date.now(),
        });
        break;
    }
  },
}));
