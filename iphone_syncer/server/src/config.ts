import { z } from 'zod';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const AppSettingsSchema = z.object({
  concurrency: z.number().min(1).max(10).default(3),
  chunkSize: z.number().min(64 * 1024).max(16 * 1024 * 1024).default(1024 * 1024),
  verifyChecksums: z.boolean().default(true),
  folderNaming: z.enum(['by-date', 'flat']).default('by-date'),
  dateSource: z.enum(['exif', 'file']).default('exif'),
  skipExisting: z.boolean().default(true),
  retryFailedCount: z.number().min(0).max(10).default(2),
  retryDelayMs: z.number().min(500).max(30000).default(3000),
  autoMountOnConnect: z.boolean().default(true),
  autoStartBackup: z.boolean().default(false),
  excludePatterns: z.array(z.string()).default(['.DS_Store', 'Thumbs.db', '.Trashes']),
  includeMediaTypes: z.enum(['photo', 'video', 'all']).default('all'),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = AppSettingsSchema.parse({});

const VAULTSYNC_HOME = path.join(os.homedir(), 'VaultSync');

export const config = {
  port: parseInt(process.env['VAULTSYNC_PORT'] || '3420', 10),
  host: process.env['VAULTSYNC_HOST'] || '0.0.0.0',

  dbPath: process.env['VAULTSYNC_DB'] || path.join(VAULTSYNC_HOME, 'vaultsync.db'),
  logLevel: (process.env['LOG_LEVEL'] || 'info') as 'debug' | 'info' | 'warn' | 'error',

  // Python AFC bridge config
  pythonBin: process.env['VAULTSYNC_PYTHON']
    || path.join(os.homedir(), '.pyenv/versions/ai_experiments_py_312/bin/python3'),
  afcBridgePath: path.join(__dirname, '..', 'python', 'afc_bridge.py'),

  polling: {
    deviceIntervalMs: 3000,
    diskIntervalMs: 5000,
  },

  ws: {
    progressBatchMs: 500,
    overallProgressMs: 1000,
  },
} as const;
