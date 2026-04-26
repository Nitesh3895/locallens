import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Transform, type TransformCallback } from 'node:stream';
import pino from 'pino';

const log = pino({ name: 'checksum' });

type XxHasher = { update(data: Uint8Array): void; digest(): bigint };
type XxHashFactory = { create64(): XxHasher };

let xxhashFactory: XxHashFactory | null = null;

async function getXxhash(): Promise<XxHashFactory | null> {
  if (xxhashFactory) return xxhashFactory;
  try {
    const mod = await import('xxhash-wasm');
    xxhashFactory = (await mod.default()) as unknown as XxHashFactory;
    return xxhashFactory;
  } catch {
    return null;
  }
}

export async function computeFileHash(filePath: string): Promise<string> {
  const xxhash = await getXxhash();

  if (xxhash) {
    try {
      const hasher = xxhash.create64();
      return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
        stream.on('data', (chunk) => {
          hasher.update(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        stream.on('end', () => {
          resolve(hasher.digest().toString(16));
        });
        stream.on('error', reject);
      });
    } catch (err) {
      log.warn({ err }, 'xxhash failed, falling back to SHA-256');
    }
  }

  return computeFileHashSha256(filePath);
}

function computeFileHashSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
    stream.on('data', (chunk) => {
      hash.update(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
    stream.on('error', reject);
  });
}

/**
 * A transform stream that computes a hash of data passing through it.
 * After the stream ends, call getHash() to get the hex digest.
 */
export class HashTransform extends Transform {
  private hasher: XxHasher | null = null;
  private sha256Fallback: ReturnType<typeof createHash> | null = null;
  private ready: Promise<void>;
  private hexDigest: string | null = null;

  constructor() {
    super();
    this.ready = this.init();
  }

  private async init() {
    const xxhash = await getXxhash();
    if (xxhash) {
      this.hasher = xxhash.create64();
    } else {
      this.sha256Fallback = createHash('sha256');
    }
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.ready.then(() => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      if (this.hasher) {
        this.hasher.update(buf);
      } else if (this.sha256Fallback) {
        this.sha256Fallback.update(buf);
      }
      this.push(chunk);
      callback();
    }).catch(callback);
  }

  override _flush(callback: TransformCallback): void {
    this.ready.then(() => {
      if (this.hasher) {
        this.hexDigest = this.hasher.digest().toString(16);
      } else if (this.sha256Fallback) {
        this.hexDigest = this.sha256Fallback.digest('hex');
      }
      callback();
    }).catch(callback);
  }

  getHash(): string | null {
    return this.hexDigest;
  }
}
