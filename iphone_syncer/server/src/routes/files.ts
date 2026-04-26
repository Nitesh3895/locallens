import type { FastifyInstance } from 'fastify';
import { dbService } from '../services/db.service.js';

export async function filesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/jobs', async (_req, reply) => {
    const jobs = dbService.getAllJobs();
    return reply.send({ jobs });
  });

  app.get('/api/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = dbService.getJob(parseInt(id, 10));

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return reply.send({ job });
  });

  app.get('/api/jobs/:id/files', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { page, pageSize } = req.query as { page?: string; pageSize?: string };

    const result = dbService.getJobFiles(
      parseInt(id, 10),
      parseInt(page || '1', 10),
      parseInt(pageSize || '50', 10),
    );

    return reply.send(result);
  });

  app.get('/api/jobs/:id/failed', async (req, reply) => {
    const { id } = req.params as { id: string };
    const failed = dbService.getFailedFiles(parseInt(id, 10));
    return reply.send({ files: failed });
  });

  app.post('/api/jobs/:id/retry-failed', async (req, reply) => {
    const { id } = req.params as { id: string };
    const jobId = parseInt(id, 10);
    const job = dbService.getJob(jobId);

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    const { getDb } = await import('../db.js');
    const db = getDb();
    const result = db
      .prepare("UPDATE copy_records SET status = 'pending', error_message = NULL WHERE job_id = ? AND status = 'failed'")
      .run(jobId);

    return reply.send({ success: true, retriedCount: result.changes });
  });

  app.get('/api/stats', async (_req, reply) => {
    const stats = dbService.getOverallStats();
    return reply.send(stats);
  });
}
