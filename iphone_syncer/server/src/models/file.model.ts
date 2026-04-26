export interface FileRecord {
  id: number;
  device_id: string;
  relative_path: string;
  filename: string;
  size_bytes: number;
  file_modified: string | null;
  exif_date: string | null;
  exif_gps_lat: number | null;
  exif_gps_lon: number | null;
  media_type: 'photo' | 'video' | 'unknown' | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  source_hash: string | null;
  first_seen_at: string;
}

export interface CopyRecord {
  id: number;
  file_id: number;
  job_id: number;
  dest_path: string;
  dest_folder: string;
  status: 'pending' | 'copying' | 'done' | 'failed' | 'skipped';
  bytes_copied: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  dest_hash: string | null;
  verified: number;
}

export type MediaType = 'photo' | 'video' | 'unknown';

const PHOTO_EXTENSIONS = new Set([
  '.heic', '.heif', '.jpg', '.jpeg', '.png', '.tiff', '.tif',
  '.gif', '.bmp', '.webp', '.raw', '.cr2', '.nef', '.arw',
  '.dng', '.raf', '.orf', '.rw2',
]);

const VIDEO_EXTENSIONS = new Set([
  '.mov', '.mp4', '.m4v', '.avi', '.mkv', '.3gp', '.3g2',
]);

export function classifyMediaType(filename: string): MediaType {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  if (PHOTO_EXTENSIONS.has(ext)) return 'photo';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'unknown';
}

export function getMimeType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.heic': 'image/heic', '.heif': 'image/heif',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.tiff': 'image/tiff', '.tif': 'image/tiff',
    '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
    '.raw': 'image/x-raw', '.cr2': 'image/x-canon-cr2',
    '.nef': 'image/x-nikon-nef', '.arw': 'image/x-sony-arw',
    '.dng': 'image/x-adobe-dng',
    '.mov': 'video/quicktime', '.mp4': 'video/mp4', '.m4v': 'video/x-m4v',
    '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
    '.3gp': 'video/3gpp', '.3g2': 'video/3gpp2',
  };
  return mimeMap[ext] || 'application/octet-stream';
}
