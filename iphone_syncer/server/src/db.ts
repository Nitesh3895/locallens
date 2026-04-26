import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import pino from 'pino';

const log = pino({ name: 'db' });

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(): Database.Database {
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);

  log.info({ path: config.dbPath }, 'Database initialized');
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE,
      ran_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: '001_initial_schema',
      sql: `
        CREATE TABLE IF NOT EXISTS files (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id       TEXT NOT NULL,
          relative_path   TEXT NOT NULL,
          filename        TEXT NOT NULL,
          size_bytes      INTEGER NOT NULL,
          file_modified   TEXT,
          exif_date       TEXT,
          exif_gps_lat    REAL,
          exif_gps_lon    REAL,
          media_type      TEXT,
          mime_type       TEXT,
          width           INTEGER,
          height          INTEGER,
          duration_sec    REAL,
          source_hash     TEXT,
          first_seen_at   TEXT NOT NULL,
          UNIQUE(device_id, relative_path)
        );

        CREATE TABLE IF NOT EXISTS backup_jobs (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id        TEXT NOT NULL,
          dest_folder      TEXT NOT NULL,
          status           TEXT NOT NULL DEFAULT 'running',
          total_files      INTEGER DEFAULT 0,
          copied_files     INTEGER DEFAULT 0,
          skipped_files    INTEGER DEFAULT 0,
          failed_files     INTEGER DEFAULT 0,
          total_bytes      INTEGER DEFAULT 0,
          copied_bytes     INTEGER DEFAULT 0,
          started_at       TEXT NOT NULL,
          paused_at        TEXT,
          resumed_at       TEXT,
          finished_at      TEXT,
          error_log        TEXT
        );

        CREATE TABLE IF NOT EXISTS copy_records (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          file_id          INTEGER NOT NULL REFERENCES files(id),
          job_id           INTEGER NOT NULL REFERENCES backup_jobs(id),
          dest_path        TEXT NOT NULL,
          dest_folder      TEXT NOT NULL,
          status           TEXT NOT NULL DEFAULT 'pending',
          bytes_copied     INTEGER DEFAULT 0,
          error_message    TEXT,
          started_at       TEXT,
          finished_at      TEXT,
          dest_hash        TEXT,
          verified         INTEGER DEFAULT 0,
          UNIQUE(file_id, dest_folder)
        );

        CREATE INDEX IF NOT EXISTS idx_files_device ON files(device_id);
        CREATE INDEX IF NOT EXISTS idx_copy_records_job ON copy_records(job_id);
        CREATE INDEX IF NOT EXISTS idx_copy_records_status ON copy_records(status);
        CREATE INDEX IF NOT EXISTS idx_copy_records_file_dest ON copy_records(file_id, dest_folder);
      `,
    },
    {
      name: '002_settings_table',
      sql: `
        CREATE TABLE IF NOT EXISTS app_settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `,
    },
  ];

  const hasRun = db.prepare('SELECT name FROM _migrations WHERE name = ?');
  const insertMigration = db.prepare('INSERT INTO _migrations (name) VALUES (?)');

  const runAll = db.transaction(() => {
    for (const migration of migrations) {
      const existing = hasRun.get(migration.name) as { name: string } | undefined;
      if (!existing) {
        db.exec(migration.sql);
        insertMigration.run(migration.name);
        log.info({ migration: migration.name }, 'Migration applied');
      }
    }
  });

  runAll();
}

export function closeDb(): void {
  if (db) {
    db.close();
    log.info('Database closed');
  }
}
