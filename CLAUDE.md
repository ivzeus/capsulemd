# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

**Docker (recommended):**
```bash
docker compose build --no-cache   # force fresh build (source is COPY'd, not mounted)
docker compose up -d
# App available at http://localhost:3001
```

**Local (no Docker):** `yt-dlp` and `ffmpeg` must be on PATH.
```bash
npm install && npm run dev          # backend on :3001
cd client && npm install && npm run dev   # frontend on :5173, proxies /api + /ws to :3001
```

**Tests:**
```bash
node test/smoke_queue.js   # validates store.js and ytdlp.js arg building; no binary needed
```

## Architecture

Express + WebSocket backend (`server/`) with a React + Vite frontend (`client/`). In production the backend serves the pre-built React app from `client/dist`. In dev, Vite proxies API/WS to the backend.

### Backend

**`server/lib/queue.js` — `QueueManager`** is the core:
- One job runs at a time. Queue state is persisted to `queue-state.json` for crash recovery (`checkForOrphanedJob()` on boot).
- WebSocket events broadcast: `queue_updated`, `job_started`, `job_finished`, `progress`, `job_log`, `playlist_progress`, `history_updated`.
- For **playlist jobs**, stderr is parsed line-by-line to track per-clip progress:
  - `[download] Downloading item N of M` → broadcasts `playlist_progress {current, total}`; adds a history entry for the just-completed clip (N-1).
  - `[Merger] Merging formats into "PATH"` / `[download] Destination: PATH` → captures output filename to derive clip title.
  - Last clip is added to history in `_handleClose` (no "next item" signal for it).
  - On success, only per-clip history entries are written (no redundant playlist-level entry).

**`server/lib/ytdlp.js`** — `buildArgs()` maps job/config to yt-dlp flags. `startDownload()` streams stdout (progress JSON) and stderr (line-by-line via `onStderrLine`). Note: the correct flag for suppressing `.part` files is `--no-part` (not `--no-part-file`).

**`server/lib/urlDetect.js`** — probes a URL via `yt-dlp --flat-playlist -j` (lowercase, streams one JSON per entry). Key behaviors:
- `watch?v=X&list=Y` URLs are rewritten to `playlist?list=Y` before probing — the video-context extractor is capped at 100 items by YouTube, the playlist extractor is not.
- **100-item limit:** `--flat-playlist` on YouTube still caps at 100 (YouTube's API page size). `playlistCount` from the probe response reflects the real total; `entryCount` is what was fetched. The UI shows a truncation notice and a "Download all" button (passes `selectedIndices: null` → no `--playlist-items` arg).
- YouTube thumbnails use `https://i.ytimg.com/vi/{id}/hqdefault.jpg` (stable, never expires) instead of the signed `sqp=...&rs=...` URLs yt-dlp returns (those expire within minutes).

**`server/lib/store.js`** — atomic JSON file layer for `config.json`, `history.json`, `queue-state.json`.

### Frontend

**`client/src/hooks/useWebSocket.js`** — connects to `/ws`, auto-reconnects on drop. Returns:
`{ connected, queue, progress, log, playlistProgress, historyRevision, lastJobResult }`
- `log`: array of stdout/stderr lines for the active job (capped at 500); cleared on `job_started`.
- `playlistProgress`: `{ current, total }` from `playlist_progress` events; null between jobs.
- `historyRevision`: increments on each `history_updated` event; `App.jsx` watches it to refetch history mid-download as each playlist clip completes.

**`client/vite.config.js`** — injects `__BUILD_SIG__` (7-char hash) and `__BUILD_TIME__` (UTC `YYYYMMDD-HHmm`) at build time via `define`. Displayed in the app header as `capsuleMD {sig}-{time}` to verify builds are fresh.

### Persistence

All runtime data lives in `server/data/` (Docker volume `./data`):
- `config.json`, `history.json`, `queue-state.json`
- `archive-<playlistId>.txt` — yt-dlp download archive for playlist resume

Downloaded files go to `./downloads` (`/downloads` inside container).
