import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import { config } from '../config.js';
import { wsService } from './ws.service.js';

const log = pino({ name: 'disk' });

export interface ExternalDisk {
  name: string;
  mountPath: string;
  totalBytes: number;
  availableBytes: number;
  totalGB: number;
  availableGB: number;
  filesystem: string;
  deviceNode: string;
  connectionType: string;
}

export interface FolderEntry {
  name: string;
  path: string;
  itemCount: number;
  lastModified: string | null;
}

class DiskService {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private knownDisks = new Map<string, ExternalDisk>();

  startPolling(): void {
    if (this.pollingInterval) return;

    log.info('Starting disk polling');
    this.pollingInterval = setInterval(() => {
      this.pollDisks().catch((err) => {
        log.error({ err }, 'Disk polling error');
      });
    }, config.polling.diskIntervalMs);

    this.pollDisks().catch((err) => {
      log.error({ err }, 'Initial disk poll error');
    });
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async pollDisks(): Promise<void> {
    const currentDisks = await this.detectExternalDisks();
    const currentPaths = new Set(currentDisks.map((d) => d.mountPath));

    for (const disk of currentDisks) {
      if (!this.knownDisks.has(disk.mountPath)) {
        this.knownDisks.set(disk.mountPath, disk);
        log.info({ name: disk.name, mountPath: disk.mountPath }, 'External disk detected');
        wsService.broadcast({
          type: 'disk:connected',
          payload: {
            name: disk.name,
            mountPath: disk.mountPath,
            totalGB: disk.totalGB,
            availableGB: disk.availableGB,
            filesystem: disk.filesystem,
            connectionType: disk.connectionType,
          },
        });
      } else {
        this.knownDisks.set(disk.mountPath, disk);
      }
    }

    for (const [mountPath, disk] of this.knownDisks) {
      if (!currentPaths.has(mountPath)) {
        this.knownDisks.delete(mountPath);
        log.info({ name: disk.name, mountPath }, 'External disk disconnected');
        wsService.broadcast({
          type: 'disk:disconnected',
          payload: { mountPath, name: disk.name },
        });
      }
    }
  }

  async detectExternalDisks(): Promise<ExternalDisk[]> {
    let disks: ExternalDisk[] = [];

    try {
      const { stdout } = await execa('diskutil', ['list', '-plist', 'external']);
      const diskIdentifiers = this.parsePlistArray(stdout, 'AllDisksAndPartitions');

      for (const diskId of diskIdentifiers) {
        try {
          const info = await this.getDiskInfo(diskId);
          if (info) disks.push(info);
        } catch (err) {
          log.debug({ err, diskId }, 'Could not get info for disk');
        }
      }
    } catch {
      // No external disks or diskutil not available
    }

    // Filter out DMG mounts, app images, and tiny volumes
    // Real external drives (USB SSDs, HDDs) are >10GB
    disks = disks.filter((d) =>
      d.totalBytes > 10e9 && d.availableBytes > 0,
    );

    // Fallback: scan /Volumes for anything that looks external
    if (disks.length === 0) {
      try {
        const volumes = await fs.readdir('/Volumes');
        for (const vol of volumes) {
          if (vol === 'Macintosh HD' || vol.startsWith('.')) continue;
          const volPath = path.join('/Volumes', vol);
          try {
            const stat = await fs.stat(volPath);
            if (stat.isDirectory()) {
              // Skip DMG mounts and app images (they're read-only virtual disks)
              const isDmg = await this.isDmgMount(volPath);
              if (isDmg) continue;

              const spaceInfo = await this.getVolumeSpace(volPath);
              // Real external drives are >10GB; skip DMGs, app images, printer disks
              if (spaceInfo && spaceInfo.total > 10e9 && spaceInfo.available > 0) {
                disks.push({
                  name: vol,
                  mountPath: volPath,
                  totalBytes: spaceInfo.total,
                  availableBytes: spaceInfo.available,
                  totalGB: parseFloat((spaceInfo.total / 1e9).toFixed(1)),
                  availableGB: parseFloat((spaceInfo.available / 1e9).toFixed(1)),
                  filesystem: 'unknown',
                  deviceNode: '',
                  connectionType: 'unknown',
                });
              }
            }
          } catch { /* skip inaccessible volumes */ }
        }
      } catch { /* /Volumes not accessible */ }
    }

    return disks;
  }

  private async getDiskInfo(diskIdentifier: string): Promise<ExternalDisk | null> {
    const { stdout } = await execa('diskutil', ['info', '-plist', diskIdentifier]);

    const mountPoint = this.parsePlistValue(stdout, 'MountPoint');
    if (!mountPoint || mountPoint === '/') return null;

    const name = this.parsePlistValue(stdout, 'VolumeName') || path.basename(mountPoint);
    const totalSize = parseInt(this.parsePlistValue(stdout, 'TotalSize') || '0', 10);
    const freeSpace = parseInt(
      this.parsePlistValue(stdout, 'APFSContainerFree') ||
      this.parsePlistValue(stdout, 'FreeSpace') ||
      this.parsePlistValue(stdout, 'VolumeFreeSpace') || '0',
      10,
    );
    const filesystem = this.parsePlistValue(stdout, 'FilesystemType') ||
      this.parsePlistValue(stdout, 'FilesystemName') || 'unknown';
    const deviceNode = this.parsePlistValue(stdout, 'DeviceNode') || diskIdentifier;

    let connectionType = 'unknown';
    try {
      const { stdout: ioregOut } = await execa('bash', [
        '-c',
        `ioreg -r -c IOBlockStorageDriver -l | grep -A 20 "${diskIdentifier}" | grep "Physical Interconnect" | head -1`,
      ]);
      if (ioregOut.includes('USB')) connectionType = 'USB';
      else if (ioregOut.includes('Thunderbolt')) connectionType = 'Thunderbolt';
      else if (ioregOut.includes('SATA')) connectionType = 'SATA';
    } catch { /* connection type detection is best-effort */ }

    return {
      name,
      mountPath: mountPoint,
      totalBytes: totalSize,
      availableBytes: freeSpace,
      totalGB: parseFloat((totalSize / 1e9).toFixed(1)),
      availableGB: parseFloat((freeSpace / 1e9).toFixed(1)),
      filesystem,
      deviceNode,
      connectionType,
    };
  }

  private async getVolumeSpace(
    mountPath: string,
  ): Promise<{ total: number; available: number } | null> {
    try {
      const { stdout } = await execa('df', ['-k', mountPath]);
      const lines = stdout.split('\n');
      if (lines.length < 2) return null;
      const parts = lines[1]!.split(/\s+/);
      const total = parseInt(parts[1] || '0', 10) * 1024;
      const available = parseInt(parts[3] || '0', 10) * 1024;
      return { total, available };
    } catch {
      return null;
    }
  }

  async listFolders(dirPath: string): Promise<FolderEntry[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const folders: FolderEntry[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry.name);
      let itemCount = 0;
      let lastModified: string | null = null;

      try {
        const items = await fs.readdir(fullPath);
        itemCount = items.length;
        const stat = await fs.stat(fullPath);
        lastModified = stat.mtime.toISOString();
      } catch { /* permission denied or inaccessible */ }

      folders.push({
        name: entry.name,
        path: fullPath,
        itemCount,
        lastModified,
      });
    }

    return folders.sort((a, b) => a.name.localeCompare(b.name));
  }

  async createFolder(folderPath: string): Promise<void> {
    await fs.mkdir(folderPath, { recursive: true });
    log.info({ path: folderPath }, 'Folder created');
  }

  async checkDiskSpace(mountPath: string): Promise<{ totalBytes: number; availableBytes: number }> {
    const volumeRoot = await this.findVolumeRoot(mountPath);
    const space = await this.getVolumeSpace(volumeRoot);
    if (!space) throw new Error(`Cannot determine disk space for ${mountPath}`);
    return { totalBytes: space.total, availableBytes: space.available };
  }

  private async isDmgMount(volPath: string): Promise<boolean> {
    try {
      const { stdout } = await execa('diskutil', ['info', volPath]);
      // DMG mounts show "Disk Image" or "Read-Only" in the output
      if (stdout.includes('Disk Image')) return true;
      if (stdout.includes('Read-Only Media: Yes') && stdout.includes('Protocol: Disk Image')) return true;
      // Also detect by checking if it's read-only and very small
      if (stdout.includes('Read-Only Volume: Yes')) return true;
    } catch {
      // If diskutil fails, check if the volume is writable
      try {
        await fs.access(volPath, 2 /* W_OK */);
        return false;
      } catch {
        return true; // read-only = likely a DMG
      }
    }
    return false;
  }

  private async findVolumeRoot(p: string): Promise<string> {
    if (p.startsWith('/Volumes/')) {
      const parts = p.split('/');
      return parts.slice(0, 3).join('/');
    }
    return p;
  }

  /** Minimal plist XML value parser — avoids needing a plist library */
  private parsePlistValue(plistXml: string, key: string): string {
    const keyPattern = `<key>${key}</key>`;
    const idx = plistXml.indexOf(keyPattern);
    if (idx === -1) return '';
    const afterKey = plistXml.substring(idx + keyPattern.length).trim();

    const stringMatch = afterKey.match(/^<string>([^<]*)<\/string>/);
    if (stringMatch) return stringMatch[1] ?? '';

    const intMatch = afterKey.match(/^<integer>([^<]*)<\/integer>/);
    if (intMatch) return intMatch[1] ?? '';

    const realMatch = afterKey.match(/^<real>([^<]*)<\/real>/);
    if (realMatch) return realMatch[1] ?? '';

    if (afterKey.startsWith('<true/>')) return 'true';
    if (afterKey.startsWith('<false/>')) return 'false';

    return '';
  }

  private parsePlistArray(plistXml: string, key: string): string[] {
    const results: string[] = [];

    // Look for AllDisksAndPartitions or AllDisks
    const keyPattern = `<key>${key}</key>`;
    let idx = plistXml.indexOf(keyPattern);
    if (idx === -1) {
      // Fallback: try AllDisks
      idx = plistXml.indexOf('<key>AllDisks</key>');
    }
    if (idx === -1) return results;

    const afterKey = plistXml.substring(idx);
    const arrayStart = afterKey.indexOf('<array>');
    const arrayEnd = afterKey.indexOf('</array>');
    if (arrayStart === -1 || arrayEnd === -1) return results;

    const arrayContent = afterKey.substring(arrayStart, arrayEnd);
    const stringMatches = arrayContent.matchAll(/<string>([^<]*)<\/string>/g);
    for (const match of stringMatches) {
      if (match[1]) results.push(match[1]);
    }

    // Also look for nested DictIdentifier patterns
    const dictMatches = afterKey.matchAll(/<key>DeviceIdentifier<\/key>\s*<string>([^<]*)<\/string>/g);
    for (const match of dictMatches) {
      if (match[1] && !results.includes(match[1])) {
        results.push(match[1]);
      }
    }

    // Look for volume identifiers in partitions
    const partMatches = afterKey.matchAll(/<key>MountPoint<\/key>\s*<string>([^<]*)<\/string>/g);
    for (const match of partMatches) {
      // These are mount points, we need the device identifiers nearby
    }

    return results;
  }

  getKnownDisks(): ExternalDisk[] {
    return Array.from(this.knownDisks.values());
  }

  getDisk(mountPath: string): ExternalDisk | undefined {
    return this.knownDisks.get(mountPath);
  }

  destroy(): void {
    this.stopPolling();
    this.knownDisks.clear();
  }
}

export const diskService = new DiskService();
