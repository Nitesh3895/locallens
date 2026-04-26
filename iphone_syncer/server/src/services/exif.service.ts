import pino from 'pino';

const log = pino({ name: 'exif' });

let exiftoolInstance: import('exiftool-vendored').ExifTool | null = null;

async function getExiftool() {
  if (!exiftoolInstance) {
    const { ExifTool } = await import('exiftool-vendored');
    exiftoolInstance = new ExifTool({ maxProcs: 2 });
  }
  return exiftoolInstance;
}

export interface ExifData {
  date: string | null;
  gpsLat: number | null;
  gpsLon: number | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

export async function extractExif(filePath: string): Promise<ExifData> {
  try {
    const exiftool = await getExiftool();
    const tags = await exiftool.read(filePath);

    let date: string | null = null;
    const dateField = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate;
    if (dateField != null) {
      if (typeof dateField === 'string') {
        date = dateField;
      } else if (typeof dateField === 'object' && 'toISOString' in dateField) {
        date = (dateField as { toISOString(): string }).toISOString();
      } else {
        date = String(dateField);
      }
    }

    let gpsLat: number | null = null;
    let gpsLon: number | null = null;
    if (typeof tags.GPSLatitude === 'number') gpsLat = tags.GPSLatitude;
    if (typeof tags.GPSLongitude === 'number') gpsLon = tags.GPSLongitude;

    let width: number | null = null;
    let height: number | null = null;
    if (typeof tags.ImageWidth === 'number') width = tags.ImageWidth;
    if (typeof tags.ImageHeight === 'number') height = tags.ImageHeight;

    let durationSec: number | null = null;
    if (typeof tags.Duration === 'number') {
      durationSec = tags.Duration;
    } else if (typeof tags.Duration === 'string') {
      durationSec = parseDurationString(tags.Duration);
    }

    return { date, gpsLat, gpsLon, width, height, durationSec };
  } catch (err) {
    log.debug({ err, filePath }, 'EXIF extraction failed');
    return { date: null, gpsLat: null, gpsLon: null, width: null, height: null, durationSec: null };
  }
}

function parseDurationString(dur: string): number | null {
  // "0:01:23" or "1:23" or "83.5 s"
  const hmsMatch = dur.match(/(\d+):(\d+):(\d+)/);
  if (hmsMatch) {
    return parseInt(hmsMatch[1]!, 10) * 3600 +
      parseInt(hmsMatch[2]!, 10) * 60 +
      parseInt(hmsMatch[3]!, 10);
  }
  const msMatch = dur.match(/(\d+):(\d+)/);
  if (msMatch) {
    return parseInt(msMatch[1]!, 10) * 60 + parseInt(msMatch[2]!, 10);
  }
  const secMatch = dur.match(/([\d.]+)\s*s/i);
  if (secMatch) {
    return parseFloat(secMatch[1]!);
  }
  return null;
}

export async function shutdownExiftool(): Promise<void> {
  if (exiftoolInstance) {
    await exiftoolInstance.end();
    exiftoolInstance = null;
  }
}
