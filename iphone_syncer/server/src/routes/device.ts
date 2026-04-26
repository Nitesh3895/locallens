import type { FastifyInstance } from 'fastify';
import { iphoneService, IPhoneError } from '../services/iphone.service.js';

export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/device', async (_req, reply) => {
    const devices = iphoneService.getConnectedDevices();
    return reply.send({ devices });
  });

  app.get('/api/device/prerequisites', async (_req, reply) => {
    const status = await iphoneService.checkPrerequisites();
    const allGood = status.python3 && status.pymobiledevice3;
    return reply.send({ prerequisites: status, ready: allGood });
  });

  app.get('/api/device/:udid/dcim-count', async (req, reply) => {
    const { udid } = req.params as { udid: string };
    try {
      const count = await iphoneService.countDcimFiles(udid);
      return reply.send({ count });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: msg });
    }
  });

  app.get('/api/device/:udid/info', async (req, reply) => {
    const { udid } = req.params as { udid: string };
    try {
      const info = await iphoneService.getDeviceInfo(udid);
      return reply.send(info);
    } catch (err) {
      if (err instanceof IPhoneError) {
        return reply.status(400).send({ error: err.message, code: err.code });
      }
      throw err;
    }
  });
}
