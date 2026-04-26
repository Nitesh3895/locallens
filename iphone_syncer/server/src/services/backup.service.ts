import fsp from 'node:fs/promises';
import path from 'node:path';
import PQueue from 'p-queue';
import pino from 'pino';
import { config } from '../config.js';
import { dbService } from './db.service.js';
import { wsService } from './ws.service.js';
import { iphoneService, type AfcFileEntry, type CompareResult } from './iphone.service.js';
import { diskService } from './disk.service.js';
import { computeFileHash } from './checksum.service.js';
import { classifyMediaType, getMimeType } from '../models/file.model.js';
import type { FileRecord, CopyRecord } from '../models/file.model.js';
import type { BackupJob, JobStats } from '../models/job.model.js';
import type { AppSettings } from '../config.js';

const log = pino({ name: 'backup' });

interface ActiveCopy {
  fileId: number;
  filename: string;
  totalBytes: number;
  bytesCopied: number;
  startedAt: number;
  speedBps: number;
}

class BackupService {
  private currentJobId: number | null = null;
  private isPaused = false;
  private isCancelled = false;
  private queue: PQueue | null = null;
  private activeCopies = new Map<number, ActiveCopy>();
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private jobStartTime = 0;
  private totalBytesCopiedSession = 0;
  private lastCompareResult: CompareResult | null = null;

  /**
   * Compare iPhone DCIM against a local destination folder.
   * This is the "smart scan" — it indexes what's already on the SSD
   * and determines exactly which files are new.
   */
  async compareDevice(
    deviceId: string,
    destFolder: string,
  ): Promise<CompareResult> {
    if (!iphoneService.isDeviceConnected(deviceId)) {
      throw new Error('Device is not connected');
    }

    const result = await iphoneService.compareDcim(deviceId, destFolder);
    this.lastCompareResult = result;

    wsService.broadcast({
      type: 'compare:complete',
      payload: {
        totalOnPhone: result.totalOnPhone,
        newFiles: result.newFiles,
        existingFiles: result.existingFiles,
        modifiedFiles: result.modifiedFiles,
        totalNewBytes: result.totalNewBytes,
        totalExistingBytes: result.totalExistingBytes,
        photosNew: result.photosNew,
        videosNew: result.videosNew,
        photosExisting: result.photosExisting,
        videosExisting: result.videosExisting,
        newByFolder: result.newByFolder,
      },
    });

    return result;
  }

  /**
   * Start backup using the last compare result — no re-scan needed.
   * Only copies files that were identified as new/modified.
   */
  async startBackup(deviceId: string, destFolder: string): Promise<BackupJob> {
    if (this.currentJobId) {
      throw new Error('A backup job is already running');
    }

    if (!iphoneService.isDeviceConnected(deviceId)) {
      throw new Error('Device is not connected');
    }

    const compareResult = this.lastCompareResult;
    if (!compareResult || compareResult.filesToCopy.length === 0) {
      throw new Error('No files to copy — run scan first');
    }

    const settings = dbService.getSettings();
    this.isPaused = false;
    this.isCancelled = false;
    this.totalBytesCopiedSession = 0;
    this.jobStartTime = Date.now();

    const filesToCopy = compareResult.filesToCopy;
    let totalBytes = 0;

    const processedFiles: Array<{ file: FileRecord; destPath: string }> = [];

    for (const afcFile of filesToCopy) {
      if (settings.excludePatterns.some((p) => afcFile.filename.includes(p))) continue;

      const mediaType = classifyMediaType(afcFile.filename);
      if (settings.includeMediaTypes !== 'all' && mediaType !== settings.includeMediaTypes) continue;

      let fileRecord = dbService.getFileByPath(deviceId, afcFile.relativePath);
      if (!fileRecord) {
        fileRecord = dbService.upsertFile({
          device_id: deviceId,
          relative_path: afcFile.relativePath,
          filename: afcFile.filename,
          size_bytes: afcFile.size,
          file_modified: afcFile.mtime,
          exif_date: null, exif_gps_lat: null, exif_gps_lon: null,
          media_type: mediaType,
          mime_type: getMimeType(afcFile.filename),
          width: null, height: null, duration_sec: null,
          source_hash: null,
          first_seen_at: new Date().toISOString(),
        });
      }

      // Preserve DCIM folder structure (rsync-style)
      const destPath = path.join(destFolder, afcFile.folder, afcFile.filename);
      processedFiles.push({ file: fileRecord, destPath });
      totalBytes += afcFile.size;
    }

    if (processedFiles.length === 0) {
      throw new Error('No files to copy after applying filters');
    }

    const job = dbService.createJob({
      device_id: deviceId,
      dest_folder: destFolder,
      status: 'running',
      total_files: processedFiles.length + compareResult.existingFiles,
      copied_files: 0,
      skipped_files: compareResult.existingFiles,
      failed_files: 0,
      total_bytes: totalBytes,
      copied_bytes: 0,
      started_at: new Date().toISOString(),
      paused_at: null,
      resumed_at: null,
      finished_at: null,
      error_log: null,
    });

    this.currentJobId = job.id;

    for (const { file, destPath } of processedFiles) {
      dbService.createCopyRecord({
        file_id: file.id,
        job_id: job.id,
        dest_path: destPath,
        dest_folder: destFolder,
        status: 'pending',
        bytes_copied: 0,
        error_message: null,
        started_at: null,
        finished_at: null,
        dest_hash: null,
        verified: 0,
      });
    }

    wsService.broadcast({
      type: 'job:started',
      payload: {
        jobId: job.id,
        totalFiles: processedFiles.length + compareResult.existingFiles,
        toCopy: processedFiles.length,
        toSkip: compareResult.existingFiles,
        totalBytes,
      },
    });

    this.startProgressBroadcast(job.id);

    this.queue = new PQueue({ concurrency: settings.concurrency });
    const pendingRecords = dbService.getCopyRecordsByJob(job.id, 'pending');

    for (const record of pendingRecords) {
      if (this.isCancelled) break;
      this.queue.add(async () => {
        if (this.isPaused || this.isCancelled) return;
        await this.copyFile(record, deviceId, settings);
      }).catch((err) => {
        log.error({ err, recordId: record.id }, 'Queue task error');
      });
    }

    this.queue.on('idle', () => {
      this.finishJob(job.id);
    });

    return job;
  }

  async pauseJob(): Promise<void> {
    if (!this.currentJobId) return;
    this.isPaused = true;
    this.queue?.pause();

    dbService.updateJobStatus(this.currentJobId, 'paused', {
      paused_at: new Date().toISOString(),
    } as Partial<BackupJob>);

    const job = dbService.getJob(this.currentJobId);
    wsService.broadcast({
      type: 'job:paused',
      payload: {
        jobId: this.currentJobId,
        copiedFiles: job?.copied_files ?? 0,
        remainingFiles: (job?.total_files ?? 0) - (job?.copied_files ?? 0) -
          (job?.skipped_files ?? 0) - (job?.failed_files ?? 0),
      },
    });

    log.info({ jobId: this.currentJobId }, 'Job paused');
  }

  async resumeJob(jobId?: number): Promise<void> {
    const id = jobId ?? this.currentJobId;
    if (!id) throw new Error('No job to resume');

    const job = dbService.getJob(id);
    if (!job) throw new Error('Job not found');

    if (!iphoneService.isDeviceConnected(job.device_id)) {
      throw new Error('Device is not connected — reconnect first');
    }

    this.currentJobId = id;
    this.isPaused = false;
    this.isCancelled = false;
    this.jobStartTime = Date.now();
    this.totalBytesCopiedSession = 0;

    dbService.updateJobStatus(id, 'running', {
      resumed_at: new Date().toISOString(),
    } as Partial<BackupJob>);

    const settings = dbService.getSettings();
    this.queue = new PQueue({ concurrency: settings.concurrency });
    this.startProgressBroadcast(id);

    const pendingRecords = dbService.getCopyRecordsByJob(id, 'pending');

    for (const record of pendingRecords) {
      if (this.isCancelled) break;
      this.queue.add(async () => {
        if (this.isPaused || this.isCancelled) return;
        await this.copyFile(record, job.device_id, settings);
      }).catch((err) => {
        log.error({ err, recordId: record.id }, 'Queue task error');
      });
    }

    this.queue.on('idle', () => {
      this.finishJob(id);
    });

    wsService.broadcast({ type: 'job:resumed', payload: { jobId: id } });
    log.info({ jobId: id }, 'Job resumed');
  }

  async cancelJob(): Promise<void> {
    if (!this.currentJobId) return;
    this.isCancelled = true;
    this.queue?.clear();
    this.stopProgressBroadcast();

    dbService.updateJobStatus(this.currentJobId, 'cancelled', {
      finished_at: new Date().toISOString(),
    } as Partial<BackupJob>);

    wsService.broadcast({
      type: 'job:cancelled',
      payload: { jobId: this.currentJobId },
    });

    this.currentJobId = null;
    this.activeCopies.clear();
    log.info('Job cancelled');
  }

  handleDeviceDisconnect(udid: string): void {
    if (!this.currentJobId) return;
    const job = dbService.getJob(this.currentJobId);
    if (job?.device_id !== udid) return;

    this.isPaused = true;
    this.queue?.pause();

    dbService.resetCopyingToPending(this.currentJobId);
    dbService.updateJobStatus(this.currentJobId, 'paused', {
      paused_at: new Date().toISOString(),
    } as Partial<BackupJob>);

    for (const [, active] of this.activeCopies) {
      const records = dbService.getCopyRecordsByJob(this.currentJobId);
      const record = records.find((r) => r.file_id === active.fileId);
      if (record) {
        try { require('fs').unlinkSync(record.dest_path); } catch { /* ok */ }
      }
    }
    this.activeCopies.clear();
    this.stopProgressBroadcast();
  }

  handleDiskDisconnect(): void {
    if (!this.currentJobId) return;
    this.isPaused = true;
    this.queue?.pause();

    dbService.resetCopyingToPending(this.currentJobId);
    dbService.updateJobStatus(this.currentJobId, 'paused', {
      paused_at: new Date().toISOString(),
    } as Partial<BackupJob>);

    this.activeCopies.clear();
    this.stopProgressBroadcast();

    wsService.broadcast({
      type: 'disk:disconnected',
      payload: { jobId: this.currentJobId },
    });
  }

  async recoverInterruptedJobs(): Promise<BackupJob[]> {
    const interrupted = dbService.getInterruptedJobs();

    for (const job of interrupted) {
      const reset = dbService.resetCopyingToPending(job.id);
      if (reset > 0) {
        log.info({ jobId: job.id, resetCount: reset }, 'Reset interrupted copies to pending');
      }
      if (job.status === 'running') {
        dbService.updateJobStatus(job.id, 'paused');
      }
    }

    return interrupted;
  }

  getCurrentJobId(): number | null {
    return this.currentJobId;
  }

  getJobStats(): JobStats | null {
    if (!this.currentJobId) return null;
    const job = dbService.getJob(this.currentJobId);
    if (!job) return null;

    const elapsed = (Date.now() - this.jobStartTime) / 1000;
    const avgSpeed = elapsed > 0 ? this.totalBytesCopiedSession / elapsed : 0;
    const remaining = job.total_bytes - job.copied_bytes;
    const eta = avgSpeed > 0 ? remaining / avgSpeed : 0;

    return {
      totalFiles: job.total_files,
      copiedFiles: job.copied_files,
      skippedFiles: job.skipped_files,
      failedFiles: job.failed_files,
      pendingFiles: job.total_files - job.copied_files - job.skipped_files - job.failed_files,
      totalBytes: job.total_bytes,
      copiedBytes: job.copied_bytes,
      currentSpeedBps: this.getCurrentSpeed(),
      avgSpeedBps: Math.round(avgSpeed),
      estimatedSecondsRemaining: Math.round(eta),
      activeFiles: Array.from(this.activeCopies.values()).map((a) => ({
        filename: a.filename,
        progress: a.totalBytes > 0 ? a.bytesCopied / a.totalBytes : 0,
        speedBps: a.speedBps,
      })),
    };
  }

  // ─── Private Methods ────────────────────────────────────

  private async copyFile(
    record: CopyRecord,
    deviceId: string,
    settings: AppSettings,
  ): Promise<void> {
    const { getDb } = await import('../db.js');
    const db = getDb();
    const fileRec = db.prepare('SELECT * FROM files WHERE id = ?')
      .get(record.file_id) as FileRecord | undefined;

    if (!fileRec) {
      dbService.updateCopyRecordStatus(record.id, 'failed', {
        error_message: 'File record not found in database',
        finished_at: new Date().toISOString(),
      });
      return;
    }

    const afcPath = `/${fileRec.relative_path}`;
    let destPath = record.dest_path;

    dbService.updateCopyRecordStatus(record.id, 'copying', {
      started_at: new Date().toISOString(),
    });

    this.activeCopies.set(fileRec.id, {
      fileId: fileRec.id,
      filename: fileRec.filename,
      totalBytes: fileRec.size_bytes,
      bytesCopied: 0,
      startedAt: Date.now(),
      speedBps: 0,
    });

    let retries = 0;
    const maxRetries = settings.retryFailedCount;

    while (retries <= maxRetries) {
      try {
        try {
          const space = await diskService.checkDiskSpace(record.dest_folder);
          if (space.availableBytes < fileRec.size_bytes + 500 * 1024 * 1024) {
            wsService.broadcast({
              type: 'disk:lowspace',
              payload: {
                availableGB: parseFloat((space.availableBytes / 1e9).toFixed(1)),
                requiredGB: parseFloat((fileRec.size_bytes / 1e9).toFixed(1)),
              },
            });
            this.pauseJob();
            return;
          }
        } catch { /* space check is best-effort */ }

        destPath = await this.resolveDestPath(destPath);
        await fsp.mkdir(path.dirname(destPath), { recursive: true });

        // Copy via AFC bridge
        const copyResult = await iphoneService.copyFile(
          deviceId,
          afcPath,
          destPath,
          (bytesCopied, totalBytes, speedBps) => {
            const active = this.activeCopies.get(fileRec.id);
            if (active) {
              active.bytesCopied = bytesCopied;
              active.speedBps = speedBps;
            }
          },
        );

        if (!copyResult.sizeMatch) {
          await fsp.unlink(destPath).catch(() => {});
          throw new Error('Size mismatch after copy');
        }

        let verified = false;
        let destHash: string | null = null;

        if (settings.verifyChecksums) {
          destHash = await computeFileHash(destPath);
          if (fileRec.source_hash) {
            verified = destHash === fileRec.source_hash;
            if (!verified) {
              await fsp.unlink(destPath).catch(() => {});
              throw new Error('checksum_mismatch');
            }
          } else {
            dbService.updateFileHash(fileRec.id, destHash);
            verified = true;
          }
        } else {
          verified = true;
        }

        dbService.updateCopyRecordStatus(record.id, 'done', {
          bytes_copied: fileRec.size_bytes,
          dest_hash: destHash,
          verified: verified ? 1 : 0,
          finished_at: new Date().toISOString(),
          dest_path: destPath,
        });

        this.incrementJobCount('copied', fileRec.size_bytes);
        this.activeCopies.delete(fileRec.id);
        this.totalBytesCopiedSession += fileRec.size_bytes;

        wsService.queueBatch({
          type: 'file:done',
          payload: { fileId: fileRec.id, filename: fileRec.filename, destPath, verified },
        });

        return;
      } catch (err) {
        retries++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.warn({ err: errorMsg, fileId: fileRec.id, retry: retries }, 'Copy failed');

        if (retries <= maxRetries) {
          wsService.queueBatch({
            type: 'file:failed',
            payload: { fileId: fileRec.id, filename: fileRec.filename, error: errorMsg, willRetry: true },
          });
          await new Promise((resolve) => setTimeout(resolve, settings.retryDelayMs));
        } else {
          dbService.updateCopyRecordStatus(record.id, 'failed', {
            error_message: errorMsg,
            finished_at: new Date().toISOString(),
          });
          this.incrementJobCount('failed', 0);
          this.activeCopies.delete(fileRec.id);

          wsService.queueBatch({
            type: 'file:failed',
            payload: { fileId: fileRec.id, filename: fileRec.filename, error: errorMsg, willRetry: false },
          });

          try { await fsp.unlink(destPath); } catch { /* ok */ }
        }
      }
    }
  }

  private async resolveDestPath(destPath: string): Promise<string> {
    let resolved = destPath;
    let counter = 0;
    const ext = path.extname(destPath);
    const base = destPath.slice(0, -ext.length || undefined);

    while (true) {
      try {
        await fsp.access(resolved);
        counter++;
        resolved = `${base}_(${counter})${ext}`;
      } catch {
        return resolved;
      }
    }
  }

  private incrementJobCount(type: 'copied' | 'failed', bytes: number): void {
    if (!this.currentJobId) return;
    const job = dbService.getJob(this.currentJobId);
    if (!job) return;

    if (type === 'copied') {
      dbService.updateJobCounts(this.currentJobId, {
        copied_files: job.copied_files + 1,
        copied_bytes: job.copied_bytes + bytes,
      });
    } else {
      dbService.updateJobCounts(this.currentJobId, {
        failed_files: job.failed_files + 1,
      });
    }
  }

  private finishJob(jobId: number): void {
    this.stopProgressBroadcast();
    const job = dbService.getJob(jobId);
    if (!job) return;
    if (this.isCancelled) return;

    const finalStatus = job.failed_files > 0 && job.copied_files === 0 ? 'failed' : 'completed';
    dbService.updateJobStatus(jobId, finalStatus, {
      finished_at: new Date().toISOString(),
    } as Partial<BackupJob>);

    this.currentJobId = null;
    this.activeCopies.clear();
    this.lastCompareResult = null;

    wsService.broadcast({
      type: 'job:completed',
      payload: {
        jobId,
        stats: {
          totalFiles: job.total_files,
          copiedFiles: job.copied_files,
          skippedFiles: job.skipped_files,
          failedFiles: job.failed_files,
          totalBytes: job.total_bytes,
          copiedBytes: job.copied_bytes,
          duration: job.started_at
            ? Math.round((Date.now() - new Date(job.started_at).getTime()) / 1000)
            : 0,
        },
      },
    });

    log.info({ jobId, status: finalStatus }, 'Job finished');
  }

  private startProgressBroadcast(jobId: number): void {
    this.stopProgressBroadcast();
    this.progressInterval = setInterval(() => {
      const stats = this.getJobStats();
      if (stats) {
        wsService.broadcast({
          type: 'progress:update',
          payload: { jobId, ...stats },
        });
      }
    }, config.ws.overallProgressMs);
  }

  private stopProgressBroadcast(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private getCurrentSpeed(): number {
    let totalSpeed = 0;
    for (const [, active] of this.activeCopies) {
      totalSpeed += active.speedBps;
    }
    return totalSpeed;
  }

  destroy(): void {
    this.stopProgressBroadcast();
    this.queue?.clear();
    this.activeCopies.clear();
  }
}

export const backupService = new BackupService();
