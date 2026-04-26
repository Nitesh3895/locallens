import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import pino from 'pino';
import { config } from './config.js';
import { initDb, closeDb } from './db.js';
import { wsService } from './services/ws.service.js';
import { iphoneService } from './services/iphone.service.js';
import { diskService } from './services/disk.service.js';
import { backupService } from './services/backup.service.js';
import { shutdownExiftool } from './services/exif.service.js';
import { deviceRoutes } from './routes/device.js';
import { diskRoutes } from './routes/disk.js';
import { backupRoutes } from './routes/backup.js';
import { filesRoutes } from './routes/files.js';
import { settingsRoutes } from './routes/settings.js';

const log = pino({
  name: 'vaultsync',
  level: config.logLevel,
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

async function main() {
  initDb();
  log.info('Database initialized');

  const interrupted = await backupService.recoverInterruptedJobs();
  if (interrupted.length > 0) {
    log.info({ count: interrupted.length }, 'Found interrupted backup jobs');
  }

  const app = Fastify({ logger: false });

  await app.register(fastifyCors, {
    origin: ['http://localhost:5173', 'http://localhost:3420'],
    credentials: true,
  });

  await app.register(fastifyWebsocket);

  // WebSocket endpoint
  app.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket, _req) => {
      wsService.addClient(socket);

      const devices = iphoneService.getConnectedDevices();
      const disks = diskService.getKnownDisks();

      socket.send(JSON.stringify({
        type: 'init:state',
        payload: {
          devices,
          disks,
          activeJobId: backupService.getCurrentJobId(),
          interruptedJobs: interrupted.map((j) => ({
            id: j.id,
            deviceId: j.device_id,
            destFolder: j.dest_folder,
            status: j.status,
            copiedFiles: j.copied_files,
            totalFiles: j.total_files,
          })),
        },
      }));

      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          log.debug({ msg }, 'WebSocket message received');
        } catch { /* ignore */ }
      });
    });
  });

  // Health check
  app.get('/api/health', async (_req, reply) => {
    const prerequisites = await iphoneService.checkPrerequisites();
    return reply.send({
      status: 'ok',
      version: '0.1.0',
      prerequisites,
      wsClients: wsService.getClientCount(),
    });
  });

  // Routes
  await app.register(deviceRoutes);
  await app.register(diskRoutes);
  await app.register(backupRoutes);
  await app.register(filesRoutes);
  await app.register(settingsRoutes);

  // Start polling
  iphoneService.startPolling();
  diskService.startPolling();

  // Wire disconnect events to backup service
  const originalBroadcast = wsService.broadcast.bind(wsService);
  const wrappedBroadcast = (event: { type: string; payload: Record<string, unknown> }) => {
    if (event.type === 'device:disconnected') {
      backupService.handleDeviceDisconnect(event.payload['udid'] as string);
    }
    if (event.type === 'disk:disconnected') {
      backupService.handleDiskDisconnect();
    }
    originalBroadcast(event);
  };
  (wsService as { broadcast: typeof wrappedBroadcast }).broadcast = wrappedBroadcast;

  // Graceful shutdown
  const shutdown = async () => {
    log.info('Shutting down...');
    iphoneService.destroy();
    diskService.destroy();
    backupService.destroy();
    wsService.destroy();
    await shutdownExiftool();
    closeDb();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.on('uncaughtException', (err) => {
    log.error({ err }, 'Uncaught exception — server will continue running');
  });

  process.on('unhandledRejection', (reason) => {
    log.error({ err: reason }, 'Unhandled rejection — server will continue running');
  });

  await app.listen({ port: config.port, host: config.host });
  log.info(`VaultSync server running at http://localhost:${config.port}`);
  log.info(`WebSocket at ws://localhost:${config.port}/ws`);
}

main().catch((err) => {
  log.error({ err }, 'Fatal error starting server');
  process.exit(1);
});
