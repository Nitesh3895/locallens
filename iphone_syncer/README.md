# iPhone Syncer

Local-first tool to sync photos and videos from iPhone to your own storage.

## Why

Most tools upload your photos to the cloud.
This tool keeps everything local — your SSD, your control.

## Features

- Local transfer (no cloud)
- Works over USB
- Resume-safe sync (WIP)
- Duplicate avoidance (WIP)

## Tech Stack

- **Backend:** Node.js + Fastify + SQLite
- **Frontend:** React + Vite + Tailwind CSS
- **iPhone Access:** libimobiledevice via Python bridge
- **Real-time:** WebSocket for live progress

## Quick Start

### Install dependencies

```bash
npm install
```

### Setup (macOS only)

```bash
npm run setup
```

This installs:
- macFUSE
- libimobiledevice + ifuse

### Run

```bash
npm run dev
```

Opens the app at `http://localhost:5173`

## Usage Flow

1. **Connect iPhone** — App detects via `idevice_id`
2. **Mount** — Click to mount iPhone DCIM folder
3. **Select SSD** — Choose destination drive
4. **Select Folder** — Browse or create destination folder
5. **Scan** — Analyzes files, shows copy vs skip counts
6. **Backup** — Stream copy with live progress + checksum verification
7. **Complete** — Summary stats, retry failed if any

## Project Structure

```
iphone_syncer/
├── client/           # React frontend (Vite)
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── stores/
│       └── styles/
├── server/          # Node.js backend (Fastify)
│   └── src/
│       ├── routes/
│       ├── services/
│       └── models/
└── scripts/
    └── setup-mac.sh
```

## Roadmap

- [ ] Auto sync
- [ ] Background daemon
- [ ] Integration with Pixtory
- [ ] Face recognition
- [ ] AI captions
- [ ] Web gallery
