import { getDb } from '../db.js';
import type { FileRecord, CopyRecord } from '../models/file.model.js';
import type { BackupJob } from '../models/job.model.js';
import type { AppSettings } from '../config.js';
import { DEFAULT_SETTINGS } from '../config.js';

class DbService {
  // ─── Files ───────────────────────────────────────────────

  upsertFile(file: Omit<FileRecord, 'id'>): FileRecord {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO files (device_id, relative_path, filename, size_bytes, file_modified,
        exif_date, exif_gps_lat, exif_gps_lon, media_type, mime_type,
        width, height, duration_sec, source_hash, first_seen_at)
      VALUES (@device_id, @relative_path, @filename, @size_bytes, @file_modified,
        @exif_date, @exif_gps_lat, @exif_gps_lon, @media_type, @mime_type,
        @width, @height, @duration_sec, @source_hash, @first_seen_at)
      ON CONFLICT(device_id, relative_path) DO UPDATE SET
        size_bytes = excluded.size_bytes,
        file_modified = excluded.file_modified,
        media_type = excluded.media_type,
        mime_type = excluded.mime_type
      RETURNING *
    `);
    return stmt.get(file) as FileRecord;
  }

  getFileByPath(deviceId: string, relativePath: string): FileRecord | undefined {
    const db = getDb();
    return db
      .prepare('SELECT * FROM files WHERE device_id = ? AND relative_path = ?')
      .get(deviceId, relativePath) as FileRecord | undefined;
  }

  getFilesByDevice(deviceId: string): FileRecord[] {
    const db = getDb();
    return db
      .prepare('SELECT * FROM files WHERE device_id = ?')
      .all(deviceId) as FileRecord[];
  }

  updateFileHash(fileId: number, hash: string): void {
    const db = getDb();
    db.prepare('UPDATE files SET source_hash = ? WHERE id = ?').run(hash, fileId);
  }

  // ─── Copy Records ───────────────────────────────────────

  createCopyRecord(record: Omit<CopyRecord, 'id'>): CopyRecord {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO copy_records (file_id, job_id, dest_path, dest_folder, status,
        bytes_copied, error_message, started_at, finished_at, dest_hash, verified)
      VALUES (@file_id, @job_id, @dest_path, @dest_folder, @status,
        @bytes_copied, @error_message, @started_at, @finished_at, @dest_hash, @verified)
      ON CONFLICT(file_id, dest_folder) DO UPDATE SET
        job_id = excluded.job_id,
        dest_path = excluded.dest_path,
        status = excluded.status,
        bytes_copied = excluded.bytes_copied,
        error_message = excluded.error_message,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        dest_hash = excluded.dest_hash,
        verified = excluded.verified
      RETURNING *
    `);
    return stmt.get(record) as CopyRecord;
  }

  getCopyRecord(fileId: number, destFolder: string): CopyRecord | undefined {
    const db = getDb();
    return db
      .prepare('SELECT * FROM copy_records WHERE file_id = ? AND dest_folder = ?')
      .get(fileId, destFolder) as CopyRecord | undefined;
  }

  getCopyRecordsByJob(jobId: number, status?: string): CopyRecord[] {
    const db = getDb();
    if (status) {
      return db
        .prepare('SELECT * FROM copy_records WHERE job_id = ? AND status = ?')
        .all(jobId, status) as CopyRecord[];
    }
    return db
      .prepare('SELECT * FROM copy_records WHERE job_id = ?')
      .all(jobId) as CopyRecord[];
  }

  updateCopyRecordStatus(
    id: number,
    status: string,
    extra: Partial<CopyRecord> = {},
  ): void {
    const db = getDb();
    const sets = ['status = ?'];
    const vals: unknown[] = [status];

    if (extra.bytes_copied !== undefined) {
      sets.push('bytes_copied = ?');
      vals.push(extra.bytes_copied);
    }
    if (extra.error_message !== undefined) {
      sets.push('error_message = ?');
      vals.push(extra.error_message);
    }
    if (extra.started_at !== undefined) {
      sets.push('started_at = ?');
      vals.push(extra.started_at);
    }
    if (extra.finished_at !== undefined) {
      sets.push('finished_at = ?');
      vals.push(extra.finished_at);
    }
    if (extra.dest_hash !== undefined) {
      sets.push('dest_hash = ?');
      vals.push(extra.dest_hash);
    }
    if (extra.verified !== undefined) {
      sets.push('verified = ?');
      vals.push(extra.verified);
    }
    if (extra.dest_path !== undefined) {
      sets.push('dest_path = ?');
      vals.push(extra.dest_path);
    }

    vals.push(id);
    db.prepare(`UPDATE copy_records SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  resetCopyingToPending(jobId: number): number {
    const db = getDb();
    const result = db
      .prepare("UPDATE copy_records SET status = 'pending' WHERE job_id = ? AND status = 'copying'")
      .run(jobId);
    return result.changes;
  }

  // ─── Backup Jobs ────────────────────────────────────────

  createJob(job: Omit<BackupJob, 'id'>): BackupJob {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO backup_jobs (device_id, dest_folder, status, total_files, copied_files,
        skipped_files, failed_files, total_bytes, copied_bytes, started_at,
        paused_at, resumed_at, finished_at, error_log)
      VALUES (@device_id, @dest_folder, @status, @total_files, @copied_files,
        @skipped_files, @failed_files, @total_bytes, @copied_bytes, @started_at,
        @paused_at, @resumed_at, @finished_at, @error_log)
      RETURNING *
    `);
    return stmt.get(job) as BackupJob;
  }

  getJob(id: number): BackupJob | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM backup_jobs WHERE id = ?').get(id) as BackupJob | undefined;
  }

  getAllJobs(): BackupJob[] {
    const db = getDb();
    return db.prepare('SELECT * FROM backup_jobs ORDER BY id DESC').all() as BackupJob[];
  }

  updateJobStatus(id: number, status: string, extra: Partial<BackupJob> = {}): void {
    const db = getDb();
    const sets = ['status = ?'];
    const vals: unknown[] = [status];

    for (const [key, val] of Object.entries(extra)) {
      if (key === 'id' || key === 'status') continue;
      sets.push(`${key} = ?`);
      vals.push(val);
    }

    vals.push(id);
    db.prepare(`UPDATE backup_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  updateJobCounts(id: number, counts: {
    copied_files?: number;
    skipped_files?: number;
    failed_files?: number;
    copied_bytes?: number;
  }): void {
    const db = getDb();
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(counts)) {
      sets.push(`${key} = ?`);
      vals.push(val);
    }
    if (sets.length === 0) return;
    vals.push(id);
    db.prepare(`UPDATE backup_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  getInterruptedJobs(): BackupJob[] {
    const db = getDb();
    return db
      .prepare("SELECT * FROM backup_jobs WHERE status IN ('running', 'paused')")
      .all() as BackupJob[];
  }

  getJobFiles(jobId: number, page = 1, pageSize = 50): {
    records: Array<CopyRecord & { filename: string; relative_path: string; size_bytes: number }>;
    total: number;
  } {
    const db = getDb();
    const total = db
      .prepare('SELECT COUNT(*) as cnt FROM copy_records WHERE job_id = ?')
      .get(jobId) as { cnt: number };

    const records = db.prepare(`
      SELECT cr.*, f.filename, f.relative_path, f.size_bytes
      FROM copy_records cr
      JOIN files f ON cr.file_id = f.id
      WHERE cr.job_id = ?
      ORDER BY cr.id
      LIMIT ? OFFSET ?
    `).all(jobId, pageSize, (page - 1) * pageSize) as Array<
      CopyRecord & { filename: string; relative_path: string; size_bytes: number }
    >;

    return { records, total: total.cnt };
  }

  getFailedFiles(jobId: number): Array<CopyRecord & { filename: string; relative_path: string }> {
    const db = getDb();
    return db.prepare(`
      SELECT cr.*, f.filename, f.relative_path
      FROM copy_records cr
      JOIN files f ON cr.file_id = f.id
      WHERE cr.job_id = ? AND cr.status = 'failed'
    `).all(jobId) as Array<CopyRecord & { filename: string; relative_path: string }>;
  }

  // ─── Settings ───────────────────────────────────────────

  getSettings(): AppSettings {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM app_settings').all() as Array<{
      key: string;
      value: string;
    }>;

    const settings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      try {
        (settings as Record<string, unknown>)[row.key] = JSON.parse(row.value);
      } catch {
        (settings as Record<string, unknown>)[row.key] = row.value;
      }
    }
    return settings;
  }

  updateSettings(updates: Partial<AppSettings>): AppSettings {
    const db = getDb();
    const upsert = db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const run = db.transaction(() => {
      for (const [key, value] of Object.entries(updates)) {
        upsert.run(key, JSON.stringify(value));
      }
    });
    run();

    return this.getSettings();
  }

  // ─── Stats ──────────────────────────────────────────────

  getOverallStats(): {
    totalFilesBackedUp: number;
    totalBytesBackedUp: number;
    totalJobs: number;
    totalDevices: number;
  } {
    const db = getDb();
    const files = db
      .prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(f.size_bytes), 0) as bytes FROM copy_records cr JOIN files f ON cr.file_id = f.id WHERE cr.status = 'done' AND cr.verified = 1")
      .get() as { cnt: number; bytes: number };
    const jobs = db
      .prepare('SELECT COUNT(*) as cnt FROM backup_jobs')
      .get() as { cnt: number };
    const devices = db
      .prepare('SELECT COUNT(DISTINCT device_id) as cnt FROM files')
      .get() as { cnt: number };

    return {
      totalFilesBackedUp: files.cnt,
      totalBytesBackedUp: files.bytes,
      totalJobs: jobs.cnt,
      totalDevices: devices.cnt,
    };
  }
}

export const dbService = new DbService();
