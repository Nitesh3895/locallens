import { execa } from 'execa';
import path from 'node:path';
import pino from 'pino';
import { config } from '../config.js';
import { wsService } from './ws.service.js';

const log = pino({ name: 'iphone' });

export interface DeviceInfo {
  udid: string;
  name: string;
  iosVersion: string;
  serialNumber: string;
  productType: string;
  batteryLevel: number | null;
  totalDiskCapacity: number | null;
  totalDataAvailable: number | null;
}

export interface AfcFileEntry {
  relativePath: string;
  folder: string;
  filename: string;
  size: number;
  mtime: string | null;
  birthtime: string | null;
  mediaType?: 'photo' | 'video' | 'unknown';
  status?: 'new' | 'existing' | 'modified';
}

export interface CompareResult {
  totalOnPhone: number;
  newFiles: number;
  existingFiles: number;
  modifiedFiles: number;
  totalNewBytes: number;
  totalExistingBytes: number;
  photosNew: number;
  videosNew: number;
  photosExisting: number;
  videosExisting: number;
  newByFolder: Record<string, { count: number; bytes: number }>;
  filesToCopy: AfcFileEntry[];
  filesAlreadyBackedUp: AfcFileEntry[];
}

interface PrerequisiteStatus {
  python3: boolean;
  pymobiledevice3: boolean;
  libimobiledevice: boolean;
}

class IPhoneService {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private connectedDevices = new Map<string, DeviceInfo>();
  private deviceLockState = new Map<string, boolean>();

  private get pythonBin(): string {
    return config.pythonBin;
  }

  private get bridgeScript(): string {
    return config.afcBridgePath;
  }

  private async runBridge(
    ...args: string[]
  ): Promise<Record<string, unknown>> {
    const { stdout } = await execa(this.pythonBin, [this.bridgeScript, ...args], {
      timeout: 60_000,
    });

    // The bridge may emit multiple JSON lines (progress + final result).
    // The last line is always the final result.
    const lines = stdout.trim().split('\n').filter(Boolean);
    const lastLine = lines[lines.length - 1]!;
    const result = JSON.parse(lastLine) as Record<string, unknown>;

    if (result['error']) {
      throw new IPhoneError('BRIDGE_ERROR', result['error'] as string);
    }

    return result;
  }

  async checkPrerequisites(): Promise<PrerequisiteStatus> {
    const [python3, pymobiledevice3, libimobiledevice] = await Promise.all([
      this.checkPython(),
      this.checkPymobiledevice3(),
      this.checkCommand('idevice_id'),
    ]);
    return { python3, pymobiledevice3, libimobiledevice };
  }

  private async checkPython(): Promise<boolean> {
    try {
      await execa(this.pythonBin, ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  private async checkPymobiledevice3(): Promise<boolean> {
    try {
      await execa(this.pythonBin, ['-c', 'import pymobiledevice3']);
      return true;
    } catch {
      return false;
    }
  }

  private async checkCommand(cmd: string): Promise<boolean> {
    try {
      await execa('which', [cmd]);
      return true;
    } catch {
      return false;
    }
  }

  startPolling(): void {
    if (this.pollingInterval) return;

    log.info('Starting device polling');
    this.pollingInterval = setInterval(() => {
      this.pollDevices().catch((err) => {
        log.error({ err }, 'Device polling error');
      });
    }, config.polling.deviceIntervalMs);

    this.pollDevices().catch((err) => {
      log.error({ err }, 'Initial device poll error');
    });
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      log.info('Device polling stopped');
    }
  }

  private async pollDevices(): Promise<void> {
    let currentUdids: string[] = [];

    try {
      const result = await this.runBridge('list-devices');
      const devices = result['devices'] as Array<{ udid: string }>;
      currentUdids = devices.map((d) => d.udid);
    } catch {
      // Bridge not available or no devices
    }

    // Detect new devices
    for (const udid of currentUdids) {
      if (!this.connectedDevices.has(udid)) {
        try {
          const info = await this.getDeviceInfo(udid);
          this.connectedDevices.set(udid, info);
          this.deviceLockState.set(udid, false);
          log.info({ udid, name: info.name }, 'Device connected');
          wsService.broadcast({
            type: 'device:connected',
            payload: {
              udid: info.udid,
              name: info.name,
              iosVersion: info.iosVersion,
              batteryLevel: info.batteryLevel,
              productType: info.productType,
            },
          });
        } catch (err) {
          if (this.isTrustError(err)) {
            wsService.broadcast({
              type: 'device:trust_required',
              payload: { udid },
            });
          } else {
            log.error({ err, udid }, 'Failed to get device info');
          }
        }
      }
    }

    // Detect disconnected devices
    for (const [udid] of this.connectedDevices) {
      if (!currentUdids.includes(udid)) {
        this.connectedDevices.delete(udid);
        this.deviceLockState.delete(udid);
        log.info({ udid }, 'Device disconnected');
        wsService.broadcast({
          type: 'device:disconnected',
          payload: { udid },
        });
      }
    }
  }

  async getDeviceInfo(udid: string): Promise<DeviceInfo> {
    const result = await this.runBridge('device-info', udid);
    return {
      udid: (result['udid'] as string) || udid,
      name: ((result['name'] as string) || 'Unknown').trim(),
      iosVersion: (result['iosVersion'] as string) || '',
      serialNumber: (result['serialNumber'] as string) || '',
      productType: (result['productType'] as string) || '',
      batteryLevel: (result['batteryLevel'] as number) ?? null,
      totalDiskCapacity: (result['totalDiskCapacity'] as number) ?? null,
      totalDataAvailable: (result['totalDataAvailable'] as number) ?? null,
    };
  }

  /** Scan all DCIM files on the device via AFC — no mounting needed */
  async scanDcim(udid: string): Promise<{
    files: AfcFileEntry[];
    totalFiles: number;
  }> {
    if (!this.connectedDevices.has(udid)) {
      throw new IPhoneError('DEVICE_NOT_FOUND', `Device ${udid} is not connected`);
    }

    const { stdout } = await execa(this.pythonBin, [this.bridgeScript, 'scan-dcim', udid], {
      timeout: 300_000, // 5 min for large libraries
    });

    const lines = stdout.trim().split('\n').filter(Boolean);
    const allProgress: number[] = [];

    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed['scanProgress']) {
        const scanned = parsed['scanProgress'] as number;
        allProgress.push(scanned);
        wsService.broadcast({
          type: 'scan:progress',
          payload: { scanned, total: 0 },
        });
      }
      if (parsed['scanComplete']) {
        const files = parsed['files'] as AfcFileEntry[];
        return { files, totalFiles: files.length };
      }
      if (parsed['error']) {
        throw new IPhoneError('SCAN_FAILED', parsed['error'] as string);
      }
    }

    throw new IPhoneError('SCAN_FAILED', 'No scan result received');
  }

  /** Compare iPhone DCIM against a local destination folder (rsync-style) */
  async compareDcim(udid: string, destFolder: string): Promise<CompareResult> {
    if (!this.connectedDevices.has(udid)) {
      throw new IPhoneError('DEVICE_NOT_FOUND', `Device ${udid} is not connected`);
    }

    let result: CompareResult | null = null;
    let bridgeError: string | null = null;

    try {
      const proc = execa(this.pythonBin, [this.bridgeScript, 'compare', udid, destFolder], {
        timeout: 300_000,
        reject: false,
      });

      if (proc.stdout) {
        const rl = await import('node:readline');
        const reader = rl.createInterface({ input: proc.stdout });

        for await (const line of reader) {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            if (parsed['scanProgress']) {
              wsService.broadcast({
                type: 'scan:progress',
                payload: {
                  scanned: parsed['scanProgress'] as number,
                  total: 0,
                  newSoFar: (parsed['newSoFar'] as number) || 0,
                  existingSoFar: (parsed['existingSoFar'] as number) || 0,
                },
              });
            }
            if (parsed['compareStatus']) {
              wsService.broadcast({
                type: 'scan:status',
                payload: {
                  status: parsed['compareStatus'] as string,
                  existingFiles: (parsed['existingFiles'] as number) || 0,
                },
              });
            }
            if (parsed['compareComplete']) {
              result = {
                totalOnPhone: parsed['totalOnPhone'] as number,
                newFiles: parsed['newFiles'] as number,
                existingFiles: parsed['existingFiles'] as number,
                modifiedFiles: parsed['modifiedFiles'] as number,
                totalNewBytes: parsed['totalNewBytes'] as number,
                totalExistingBytes: parsed['totalExistingBytes'] as number,
                photosNew: parsed['photosNew'] as number,
                videosNew: parsed['videosNew'] as number,
                photosExisting: parsed['photosExisting'] as number,
                videosExisting: parsed['videosExisting'] as number,
                newByFolder: parsed['newByFolder'] as Record<string, { count: number; bytes: number }>,
                filesToCopy: parsed['filesToCopy'] as AfcFileEntry[],
                filesAlreadyBackedUp: parsed['filesAlreadyBackedUp'] as AfcFileEntry[],
              };
            }
            if (parsed['error']) {
              bridgeError = parsed['error'] as string;
            }
          } catch {
            // ignore JSON parse errors
          }
        }
      }

      const procResult = await proc;
      if (procResult.exitCode !== 0 && !bridgeError) {
        bridgeError = procResult.stderr || `Process exited with code ${procResult.exitCode}`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new IPhoneError('COMPARE_FAILED', msg);
    }

    if (bridgeError) {
      throw new IPhoneError('COMPARE_FAILED', bridgeError);
    }

    if (!result) {
      throw new IPhoneError('COMPARE_FAILED', 'No compare result received');
    }

    return result;
  }

  /** Copy a single file from iPhone via AFC with progress */
  async copyFile(
    udid: string,
    srcPath: string,
    destPath: string,
    onProgress?: (bytesCopied: number, totalBytes: number, speedBps: number) => void,
  ): Promise<{
    bytesCopied: number;
    totalBytes: number;
    sizeMatch: boolean;
    durationSec: number;
  }> {
    let result: Record<string, unknown> | null = null;
    let bridgeError: string | null = null;

    try {
      const proc = execa(this.pythonBin, [
        this.bridgeScript, 'copy-file', udid, srcPath, destPath,
      ], {
        timeout: 600_000,
        reject: false,
      });

      if (proc.stdout) {
        const rl = await import('node:readline');
        const reader = rl.createInterface({ input: proc.stdout });

        for await (const line of reader) {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            if (parsed['progress']) {
              const p = parsed['progress'] as {
                bytesCopied: number;
                totalBytes: number;
                speedBps: number;
              };
              onProgress?.(p.bytesCopied, p.totalBytes, p.speedBps);
            }
            if (parsed['copyComplete']) {
              result = parsed;
            }
            if (parsed['error']) {
              bridgeError = parsed['error'] as string;
            }
          } catch {
            // ignore JSON parse errors from partial lines
          }
        }
      }

      const procResult = await proc;
      if (procResult.exitCode !== 0 && !bridgeError) {
        bridgeError = procResult.stderr || `Process exited with code ${procResult.exitCode}`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new IPhoneError('COPY_FAILED', msg);
    }

    if (bridgeError) {
      throw new IPhoneError('COPY_FAILED', bridgeError);
    }

    if (!result) {
      throw new IPhoneError('COPY_FAILED', 'No copy result received');
    }

    return {
      bytesCopied: result['bytesCopied'] as number,
      totalBytes: result['totalBytes'] as number,
      sizeMatch: result['sizeMatch'] as boolean,
      durationSec: result['durationSec'] as number,
    };
  }

  /** Get file metadata via AFC */
  async statFile(udid: string, remotePath: string): Promise<{
    size: number;
    isDir: boolean;
    mtime: string;
  }> {
    const result = await this.runBridge('stat-file', udid, remotePath);
    return {
      size: result['size'] as number,
      isDir: result['isDir'] as boolean,
      mtime: result['mtime'] as string,
    };
  }

  /** Count DCIM files quickly (uses scan internally) */
  async countDcimFiles(udid: string): Promise<number> {
    try {
      const result = await this.runBridge('list-files', udid, '/DCIM');
      const files = result['files'] as Array<{ isDir: boolean; name: string }>;
      let total = 0;
      for (const f of files) {
        if (f.isDir && f.name !== '.MISC') {
          const subResult = await this.runBridge('list-files', udid, `/DCIM/${f.name}`);
          const subFiles = subResult['files'] as unknown[];
          total += subFiles.length;
        }
      }
      return total;
    } catch {
      return 0;
    }
  }

  getConnectedDevices(): DeviceInfo[] {
    return Array.from(this.connectedDevices.values());
  }

  isDeviceConnected(udid: string): boolean {
    return this.connectedDevices.has(udid);
  }

  private isTrustError(err: unknown): boolean {
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      return msg.includes('lockdown') || msg.includes('trust') || msg.includes('pair');
    }
    return false;
  }

  destroy(): void {
    this.stopPolling();
    this.connectedDevices.clear();
  }
}

export class IPhoneError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IPhoneError';
  }
}

export const iphoneService = new IPhoneService();
