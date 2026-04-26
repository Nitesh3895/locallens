import type { FastifyInstance } from 'fastify';
import { dbService } from '../services/db.service.js';
import { AppSettingsSchema } from '../config.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', async (_req, reply) => {
    const settings = dbService.getSettings();
    return reply.send(settings);
  });

  app.put('/api/settings', async (req, reply) => {
    const body = req.body as Record<string, unknown>;

    const parsed = AppSettingsSchema.partial().safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid settings',
        details: parsed.error.format(),
      });
    }

    const updated = dbService.updateSettings(parsed.data);
    return reply.send(updated);
  });
}
