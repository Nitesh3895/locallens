#!/usr/bin/env python3
"""
AFC Bridge — JSON-over-stdout interface for Node.js to access iPhone files
via pymobiledevice3's AFC protocol (no mounting required).

Usage:
  python3 afc_bridge.py <command> [args...]

Commands:
  list-devices                              List connected iPhones
  device-info <udid>                        Get device details
  list-files <udid> <path>                  List files/dirs at path
  stat-file <udid> <path>                   Get file metadata
  scan-dcim <udid>                          Scan all DCIM files
  compare <udid> <dest_folder>              Compare iPhone DCIM vs local folder (rsync-style)
  copy-file <udid> <src> <dest>             Copy single file from iPhone to local
  pair <udid>                               Pair with device

All output is JSON on stdout. Errors use {"error": "..."} format.
Progress lines are emitted during long operations.
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path


def json_out(data):
    print(json.dumps(data, default=str), flush=True)


def json_err(msg):
    json_out({"error": str(msg)})
    sys.exit(1)


async def get_lockdown(udid=None):
    from pymobiledevice3.usbmux import list_devices
    from pymobiledevice3.lockdown import create_using_usbmux

    devices = await list_devices()
    if not devices:
        json_err("No iPhone connected")

    if udid:
        target = next((d for d in devices if d.serial == udid), None)
        if not target:
            json_err(f"Device {udid} not found")
        serial = target.serial
    else:
        serial = devices[0].serial

    lockdown = await create_using_usbmux(serial=serial)
    return lockdown


async def get_afc(lockdown):
    from pymobiledevice3.services.afc import AfcService
    afc = AfcService(lockdown)
    await afc.connect()
    return afc


async def cmd_list_devices():
    from pymobiledevice3.usbmux import list_devices
    devices = await list_devices()
    result = []
    for d in devices:
        result.append({"udid": d.serial})
    json_out({"devices": result})


async def cmd_device_info(udid):
    lockdown = await get_lockdown(udid)
    vals = lockdown.all_values or {}

    battery_level = None
    try:
        from pymobiledevice3.services.diagnostics import DiagnosticsService
        diag = DiagnosticsService(lockdown)
        await diag.connect()
        io_info = await diag.get_battery()
        battery_level = io_info.get("BatteryCurrentCapacity") or io_info.get("CurrentCapacity")
        await diag.close()
    except Exception:
        pass

    json_out({
        "udid": udid or vals.get("UniqueDeviceID", ""),
        "name": vals.get("DeviceName", "Unknown"),
        "iosVersion": vals.get("ProductVersion", ""),
        "productType": vals.get("ProductType", ""),
        "serialNumber": vals.get("SerialNumber", ""),
        "batteryLevel": battery_level,
        "wifiAddress": vals.get("WiFiAddress", ""),
        "totalDiskCapacity": vals.get("TotalDiskCapacity"),
        "totalDataAvailable": vals.get("TotalDataAvailable"),
    })


async def cmd_list_files(udid, path):
    lockdown = await get_lockdown(udid)
    afc = await get_afc(lockdown)

    try:
        entries = await afc.listdir(path)
        result = []
        for entry in entries:
            if entry in (".", ".."):
                continue
            full_path = f"{path.rstrip('/')}/{entry}"
            try:
                stat = await afc.stat(full_path)
                result.append({
                    "name": entry,
                    "path": full_path,
                    "isDir": stat.get("st_ifmt") == "S_IFDIR",
                    "size": stat.get("st_size", 0),
                    "mtime": str(stat.get("st_mtime", "")),
                    "birthtime": str(stat.get("st_birthtime", "")),
                })
            except Exception:
                result.append({
                    "name": entry,
                    "path": full_path,
                    "isDir": False,
                    "size": 0,
                    "mtime": None,
                    "birthtime": None,
                })
        json_out({"files": result, "path": path})
    finally:
        await afc.close()


async def cmd_stat_file(udid, path):
    lockdown = await get_lockdown(udid)
    afc = await get_afc(lockdown)

    try:
        stat = await afc.stat(path)
        json_out({
            "path": path,
            "size": stat.get("st_size", 0),
            "isDir": stat.get("st_ifmt") == "S_IFDIR",
            "mtime": str(stat.get("st_mtime", "")),
            "birthtime": str(stat.get("st_birthtime", "")),
            "blocks": stat.get("st_blocks", 0),
            "nlink": stat.get("st_nlink", 0),
        })
    finally:
        await afc.close()


async def cmd_scan_dcim(udid):
    """Scan all DCIM files and return metadata for each."""
    lockdown = await get_lockdown(udid)
    afc = await get_afc(lockdown)

    try:
        dcim_entries = await afc.listdir("/DCIM")
        folders = sorted([f for f in dcim_entries if f not in (".", "..")])

        all_files = []
        scanned = 0

        for folder in folders:
            folder_path = f"/DCIM/{folder}"
            try:
                entries = await afc.listdir(folder_path)
            except Exception:
                continue

            for entry in entries:
                if entry in (".", "..") or entry.startswith("."):
                    continue

                file_path = f"{folder_path}/{entry}"
                try:
                    stat = await afc.stat(file_path)
                    if stat.get("st_ifmt") == "S_IFDIR":
                        continue
                    all_files.append({
                        "relativePath": f"DCIM/{folder}/{entry}",
                        "folder": folder,
                        "filename": entry,
                        "size": stat.get("st_size", 0),
                        "mtime": str(stat.get("st_mtime", "")),
                        "birthtime": str(stat.get("st_birthtime", "")),
                    })
                except Exception:
                    ext = os.path.splitext(entry)[1].lower()
                    if not ext:
                        continue
                    all_files.append({
                        "relativePath": f"DCIM/{folder}/{entry}",
                        "folder": folder,
                        "filename": entry,
                        "size": 0,
                        "mtime": None,
                        "birthtime": None,
                    })

                scanned += 1
                if scanned % 200 == 0:
                    print(json.dumps({"scanProgress": scanned}), flush=True)

        json_out({
            "scanComplete": True,
            "totalFiles": len(all_files),
            "files": all_files,
        })
    finally:
        await afc.close()


async def cmd_compare(udid, dest_folder):
    """
    Compare iPhone DCIM against a local destination folder.
    Returns per-file status: 'new', 'existing' (same size), 'modified' (different size).
    This is the rsync-style intelligence.
    """
    lockdown = await get_lockdown(udid)
    afc = await get_afc(lockdown)

    try:
        # Build index of what's already on the destination
        dest_index = {}  # { "folder/filename": size }
        dest_path = Path(dest_folder)

        if dest_path.exists():
            for item in dest_path.iterdir():
                if item.is_dir() and not item.name.startswith("."):
                    for f in item.iterdir():
                        if f.is_file() and not f.name.startswith("."):
                            key = f"{item.name}/{f.name}"
                            dest_index[key] = f.stat().st_size

        print(json.dumps({
            "compareStatus": "indexing_destination",
            "existingFiles": len(dest_index),
        }), flush=True)

        # Now scan iPhone DCIM and compare
        dcim_entries = await afc.listdir("/DCIM")
        folders = sorted([f for f in dcim_entries if f not in (".", "..")])

        new_files = []
        existing_files = []
        modified_files = []
        total_new_bytes = 0
        total_existing_bytes = 0
        scanned = 0
        photos_new = 0
        videos_new = 0
        photos_existing = 0
        videos_existing = 0

        photo_exts = {'.heic', '.heif', '.jpg', '.jpeg', '.png', '.tiff', '.tif',
                      '.gif', '.bmp', '.webp', '.raw', '.cr2', '.nef', '.arw', '.dng'}
        video_exts = {'.mov', '.mp4', '.m4v', '.avi', '.mkv', '.3gp'}

        for folder in folders:
            folder_path = f"/DCIM/{folder}"
            try:
                entries = await afc.listdir(folder_path)
            except Exception:
                continue

            for entry in entries:
                if entry in (".", "..") or entry.startswith("."):
                    continue

                file_path = f"{folder_path}/{entry}"
                try:
                    stat = await afc.stat(file_path)
                    # Skip directories — only process actual files
                    if stat.get("st_ifmt") == "S_IFDIR":
                        continue
                    size = stat.get("st_size", 0)
                except Exception:
                    size = 0
                    stat = {}

                ext = os.path.splitext(entry)[1].lower()
                is_photo = ext in photo_exts
                is_video = ext in video_exts

                # Skip entries with no extension (likely directories or system files)
                if not ext:
                    continue

                lookup_key = f"{folder}/{entry}"
                dest_size = dest_index.get(lookup_key)

                file_info = {
                    "relativePath": f"DCIM/{folder}/{entry}",
                    "folder": folder,
                    "filename": entry,
                    "size": size,
                    "mtime": str(stat.get("st_mtime", "")) if size > 0 else None,
                    "mediaType": "photo" if is_photo else ("video" if is_video else "unknown"),
                }

                if dest_size is None:
                    # File doesn't exist on destination
                    file_info["status"] = "new"
                    new_files.append(file_info)
                    total_new_bytes += size
                    if is_photo: photos_new += 1
                    if is_video: videos_new += 1
                elif dest_size == size:
                    # Same file, same size — already backed up
                    file_info["status"] = "existing"
                    existing_files.append(file_info)
                    total_existing_bytes += size
                    if is_photo: photos_existing += 1
                    if is_video: videos_existing += 1
                else:
                    # Different size — modified or corrupt
                    file_info["status"] = "modified"
                    file_info["destSize"] = dest_size
                    modified_files.append(file_info)
                    total_new_bytes += size
                    if is_photo: photos_new += 1
                    if is_video: videos_new += 1

                scanned += 1
                if scanned % 200 == 0:
                    print(json.dumps({
                        "scanProgress": scanned,
                        "newSoFar": len(new_files),
                        "existingSoFar": len(existing_files),
                    }), flush=True)

        # Group new files by folder for display
        new_by_folder = {}
        for f in new_files:
            folder = f["folder"]
            if folder not in new_by_folder:
                new_by_folder[folder] = {"count": 0, "bytes": 0}
            new_by_folder[folder]["count"] += 1
            new_by_folder[folder]["bytes"] += f["size"]

        json_out({
            "compareComplete": True,
            "totalOnPhone": scanned,
            "newFiles": len(new_files),
            "existingFiles": len(existing_files),
            "modifiedFiles": len(modified_files),
            "totalNewBytes": total_new_bytes,
            "totalExistingBytes": total_existing_bytes,
            "photosNew": photos_new,
            "videosNew": videos_new,
            "photosExisting": photos_existing,
            "videosExisting": videos_existing,
            "newByFolder": new_by_folder,
            "filesToCopy": new_files + modified_files,
            "filesAlreadyBackedUp": existing_files,
        })
    finally:
        await afc.close()


async def cmd_copy_file(udid, src_path, dest_path):
    """Copy a single file from iPhone to local filesystem with progress."""
    lockdown = await get_lockdown(udid)
    afc = await get_afc(lockdown)

    try:
        stat = await afc.stat(src_path)
        total_size = stat.get("st_size", 0)

        dest_dir = os.path.dirname(dest_path)
        os.makedirs(dest_dir, exist_ok=True)

        handle = await afc.fopen(src_path, "r")

        chunk_size = 1024 * 1024  # 1MB
        bytes_copied = 0
        start_time = time.time()

        with open(dest_path, "wb") as local_file:
            while True:
                chunk = await afc.fread(handle, chunk_size)
                if not chunk:
                    break
                local_file.write(chunk)
                bytes_copied += len(chunk)

                elapsed = time.time() - start_time
                speed = bytes_copied / elapsed if elapsed > 0 else 0
                print(json.dumps({
                    "progress": {
                        "bytesCopied": bytes_copied,
                        "totalBytes": total_size,
                        "speedBps": int(speed),
                    }
                }), flush=True)

        await afc.fclose(handle)

        local_size = os.path.getsize(dest_path)

        json_out({
            "copyComplete": True,
            "src": src_path,
            "dest": dest_path,
            "bytesCopied": bytes_copied,
            "totalBytes": total_size,
            "sizeMatch": local_size == total_size,
            "durationSec": round(time.time() - start_time, 2),
        })
    except Exception as e:
        try:
            os.unlink(dest_path)
        except Exception:
            pass
        json_err(f"Copy failed: {e}")
    finally:
        await afc.close()


async def cmd_pair(udid):
    lockdown = await get_lockdown(udid)
    vals = lockdown.all_values or {}
    json_out({
        "paired": True,
        "udid": udid or vals.get("UniqueDeviceID", ""),
        "name": vals.get("DeviceName", "Unknown"),
    })


async def main():
    if len(sys.argv) < 2:
        json_err("Usage: afc_bridge.py <command> [args...]")

    command = sys.argv[1]

    try:
        if command == "list-devices":
            await cmd_list_devices()
        elif command == "device-info":
            udid = sys.argv[2] if len(sys.argv) > 2 else None
            await cmd_device_info(udid)
        elif command == "list-files":
            if len(sys.argv) < 4:
                json_err("Usage: afc_bridge.py list-files <udid> <path>")
            await cmd_list_files(sys.argv[2], sys.argv[3])
        elif command == "stat-file":
            if len(sys.argv) < 4:
                json_err("Usage: afc_bridge.py stat-file <udid> <path>")
            await cmd_stat_file(sys.argv[2], sys.argv[3])
        elif command == "scan-dcim":
            if len(sys.argv) < 3:
                json_err("Usage: afc_bridge.py scan-dcim <udid>")
            await cmd_scan_dcim(sys.argv[2])
        elif command == "compare":
            if len(sys.argv) < 4:
                json_err("Usage: afc_bridge.py compare <udid> <dest_folder>")
            await cmd_compare(sys.argv[2], sys.argv[3])
        elif command == "copy-file":
            if len(sys.argv) < 5:
                json_err("Usage: afc_bridge.py copy-file <udid> <src> <dest>")
            await cmd_copy_file(sys.argv[2], sys.argv[3], sys.argv[4])
        elif command == "pair":
            udid = sys.argv[2] if len(sys.argv) > 2 else None
            await cmd_pair(udid)
        else:
            json_err(f"Unknown command: {command}")
    except SystemExit:
        raise
    except Exception as e:
        json_err(str(e))


if __name__ == "__main__":
    asyncio.run(main())
