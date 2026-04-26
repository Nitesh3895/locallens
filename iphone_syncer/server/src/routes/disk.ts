import type { FastifyInstance } from 'fastify';
import { diskService } from '../services/disk.service.js';

export async function diskRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/disks', async (_req, reply) => {
    const disks = diskService.getKnownDisks();
    if (disks.length === 0) {
      const fresh = await diskService.detectExternalDisks();
      return reply.send({ disks: fresh });
    }
    return reply.send({ disks });
  });

  app.get('/api/disk/folders', async (req, reply) => {
    const { path: dirPath } = req.query as { path?: string };

    if (!dirPath) {
      return reply.status(400).send({ error: 'path query parameter is required' });
    }

    try {
      const folders = await diskService.listFolders(dirPath);
      return reply.send({ folders, currentPath: dirPath });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: `Cannot list folders: ${msg}` });
    }
  });

  app.post('/api/disk/folder', async (req, reply) => {
    const { path: folderPath } = req.body as { path?: string };

    if (!folderPath) {
      return reply.status(400).send({ error: 'path is required' });
    }

    try {
      await diskService.createFolder(folderPath);
      return reply.send({ success: true, path: folderPath });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: `Cannot create folder: ${msg}` });
    }
  });

  app.get('/api/disk/space', async (req, reply) => {
    const { path: diskPath } = req.query as { path?: string };

    if (!diskPath) {
      return reply.status(400).send({ error: 'path query parameter is required' });
    }

    try {
      const space = await diskService.checkDiskSpace(diskPath);
      return reply.send({
        totalBytes: space.totalBytes,
        availableBytes: space.availableBytes,
        totalGB: parseFloat((space.totalBytes / 1e9).toFixed(1)),
        availableGB: parseFloat((space.availableBytes / 1e9).toFixed(1)),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: msg });
    }
  });
}
