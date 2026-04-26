import type { FastifyInstance } from 'fastify';
import { backupService } from '../services/backup.service.js';
import { dbService } from '../services/db.service.js';

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Compare iPhone DCIM vs destination folder (rsync-style smart scan).
   * Returns exactly which files are new, existing, and modified.
   */
  app.post('/api/backup/compare', async (req, reply) => {
    const { deviceId, destFolder } = req.body as {
      deviceId?: string;
      destFolder?: string;
    };

    if (!deviceId || !destFolder) {
      return reply.status(400).send({ error: 'deviceId and destFolder are required' });
    }

    try {
      const result = await backupService.compareDevice(deviceId, destFolder);
      return reply.send(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: msg });
    }
  });

  app.post('/api/backup/start', async (req, reply) => {
    const { deviceId, destFolder } = req.body as {
      deviceId?: string;
      destFolder?: string;
    };

    if (!deviceId || !destFolder) {
      return reply.status(400).send({ error: 'deviceId and destFolder are required' });
    }

    try {
      const job = await backupService.startBackup(deviceId, destFolder);
      return reply.send({ success: true, job });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: msg });
    }
  });

  app.post('/api/backup/pause', async (_req, reply) => {
    await backupService.pauseJob();
    return reply.send({ success: true });
  });

  app.post('/api/backup/resume', async (req, reply) => {
    const { jobId } = req.body as { jobId?: number };

    try {
      await backupService.resumeJob(jobId ?? undefined);
      return reply.send({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: msg });
    }
  });

  app.post('/api/backup/cancel', async (_req, reply) => {
    await backupService.cancelJob();
    return reply.send({ success: true });
  });

  app.get('/api/backup/progress', async (_req, reply) => {
    const stats = backupService.getJobStats();
    if (!stats) {
      return reply.send({ active: false });
    }
    return reply.send({ active: true, ...stats });
  });
}
