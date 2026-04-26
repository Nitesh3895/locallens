export interface BackupJob {
  id: number;
  device_id: string;
  dest_folder: string;
  status: JobStatus;
  total_files: number;
  copied_files: number;
  skipped_files: number;
  failed_files: number;
  total_bytes: number;
  copied_bytes: number;
  started_at: string;
  paused_at: string | null;
  resumed_at: string | null;
  finished_at: string | null;
  error_log: string | null;
}

export type JobStatus = 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';

export interface JobStats {
  totalFiles: number;
  copiedFiles: number;
  skippedFiles: number;
  failedFiles: number;
  pendingFiles: number;
  totalBytes: number;
  copiedBytes: number;
  currentSpeedBps: number;
  avgSpeedBps: number;
  estimatedSecondsRemaining: number;
  activeFiles: Array<{
    filename: string;
    progress: number;
    speedBps: number;
  }>;
}
