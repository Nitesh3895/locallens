import { WebSocket } from 'ws';
import pino from 'pino';

const log = pino({ name: 'ws' });

export interface WsEvent {
  type: string;
  payload: Record<string, unknown>;
}

class WsService {
  private clients = new Set<WebSocket>();
  private batchQueue: WsEvent[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private batchIntervalMs = 500;

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    log.info({ clientCount: this.clients.size }, 'WebSocket client connected');

    ws.on('close', () => {
      this.clients.delete(ws);
      log.info({ clientCount: this.clients.size }, 'WebSocket client disconnected');
    });

    ws.on('error', (err) => {
      log.error({ err }, 'WebSocket client error');
      this.clients.delete(ws);
    });
  }

  broadcast(event: WsEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /** Queue an event for batched sending (used for high-frequency file progress) */
  queueBatch(event: WsEvent): void {
    this.batchQueue.push(event);
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, this.batchIntervalMs);
    }
  }

  private flushBatch(): void {
    if (this.batchQueue.length > 0) {
      const message = JSON.stringify({
        type: 'batch',
        payload: { events: this.batchQueue },
      });
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      }
      this.batchQueue = [];
    }
    this.batchTimer = null;
  }

  getClientCount(): number {
    return this.clients.size;
  }

  destroy(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
  }
}

export const wsService = new WsService();
