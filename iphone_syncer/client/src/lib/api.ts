const BASE = '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => request<{
    status: string;
    prerequisites: Record<string, boolean>;
    wsClients: number;
  }>('/api/health'),

  prerequisites: () => request<{
    prerequisites: Record<string, boolean>;
    ready: boolean;
  }>('/api/device/prerequisites'),

  getDevices: () => request<{ devices: Device[] }>('/api/device'),

  getDisks: () => request<{ disks: ExternalDisk[] }>('/api/disks'),
  getFolders: (path: string) =>
    request<{ folders: FolderEntry[]; currentPath: string }>(
      `/api/disk/folders?path=${encodeURIComponent(path)}`,
    ),
  createFolder: (path: string) =>
    request<{ success: boolean }>('/api/disk/folder', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  getDiskSpace: (path: string) =>
    request<{ totalGB: number; availableGB: number }>(
      `/api/disk/space?path=${encodeURIComponent(path)}`,
    ),

  /** Smart compare: iPhone DCIM vs destination folder */
  compare: (deviceId: string, destFolder: string) =>
    request<CompareResult>('/api/backup/compare', {
      method: 'POST',
      body: JSON.stringify({ deviceId, destFolder }),
    }),

  startBackup: (deviceId: string, destFolder: string) =>
    request<{ success: boolean; job: BackupJob }>('/api/backup/start', {
      method: 'POST',
      body: JSON.stringify({ deviceId, destFolder }),
    }),
  pauseBackup: () => request<{ success: boolean }>('/api/backup/pause', { method: 'POST' }),
  resumeBackup: (jobId?: number) =>
    request<{ success: boolean }>('/api/backup/resume', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    }),
  cancelBackup: () => request<{ success: boolean }>('/api/backup/cancel', { method: 'POST' }),
  getProgress: () => request<ProgressUpdate>('/api/backup/progress'),

  getJobs: () => request<{ jobs: BackupJob[] }>('/api/jobs'),
  getJob: (id: number) => request<{ job: BackupJob }>(`/api/jobs/${id}`),
  getJobFiles: (id: number, page = 1) =>
    request<{ records: JobFileRecord[]; total: number }>(`/api/jobs/${id}/files?page=${page}`),
  getFailedFiles: (id: number) =>
    request<{ files: JobFileRecord[] }>(`/api/jobs/${id}/failed`),
  retryFailed: (id: number) =>
    request<{ success: boolean; retriedCount: number }>(`/api/jobs/${id}/retry-failed`, {
      method: 'POST',
    }),

  getSettings: () => request<AppSettings>('/api/settings'),
  updateSettings: (settings: Partial<AppSettings>) =>
    request<AppSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  getStats: () => request<OverallStats>('/api/stats'),
};

// Types
export interface Device {
  udid: string;
  name: string;
  iosVersion: string;
  serialNumber: string;
  productType: string;
  batteryLevel: number | null;
}

export interface ExternalDisk {
  name: string;
  mountPath: string;
  totalBytes: number;
  availableBytes: number;
  totalGB: number;
  availableGB: number;
  filesystem: string;
  connectionType: string;
}

export interface FolderEntry {
  name: string;
  path: string;
  itemCount: number;
  lastModified: string | null;
}

export interface CompareResult {
  totalOnPhone: number;
  newFiles: number;
  existingFiles: number;
  modifiedFiles: number;
  totalNewBytes: number;
  totalExistingBytes: number;
  photosNew: number;
  videosNew: number;
  photosExisting: number;
  videosExisting: number;
  newByFolder: Record<string, { count: number; bytes: number }>;
}

export interface BackupJob {
  id: number;
  device_id: string;
  dest_folder: string;
  status: string;
  total_files: number;
  copied_files: number;
  skipped_files: number;
  failed_files: number;
  total_bytes: number;
  copied_bytes: number;
  started_at: string;
  finished_at: string | null;
}

export interface JobFileRecord {
  id: number;
  file_id: number;
  filename: string;
  relative_path: string;
  size_bytes: number;
  status: string;
  bytes_copied: number;
  error_message: string | null;
}

export interface ProgressUpdate {
  active: boolean;
  totalFiles?: number;
  copiedFiles?: number;
  skippedFiles?: number;
  failedFiles?: number;
  pendingFiles?: number;
  totalBytes?: number;
  copiedBytes?: number;
  currentSpeedBps?: number;
  avgSpeedBps?: number;
  estimatedSecondsRemaining?: number;
  activeFiles?: Array<{ filename: string; progress: number; speedBps: number }>;
}

export interface AppSettings {
  concurrency: number;
  chunkSize: number;
  verifyChecksums: boolean;
  folderNaming: 'by-date' | 'flat';
  dateSource: 'exif' | 'file';
  skipExisting: boolean;
  retryFailedCount: number;
  retryDelayMs: number;
  autoMountOnConnect: boolean;
  autoStartBackup: boolean;
  excludePatterns: string[];
  includeMediaTypes: 'photo' | 'video' | 'all';
}

export interface OverallStats {
  totalFilesBackedUp: number;
  totalBytesBackedUp: number;
  totalJobs: number;
  totalDevices: number;
}
