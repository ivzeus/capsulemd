# capsuleMD — capsule Media Downloader

A small local web app for downloading YouTube videos and playlists via
[yt-dlp](https://github.com/yt-dlp/yt-dlp), with a queue, live progress, resume support,
and download history — all running in a single Docker container.

## Features

- **Auto-detects** whether a pasted link is a single video or a playlist
- **Playlist preview** — see every item with a checkbox before committing to download
- **Sequential queue** — one download at a time (avoids triggering rate limits/bans from the host)
- **Resume on interruption**
  - Single videos resume the partial file automatically (yt-dlp's native `--continue`)
  - Playlists skip already-downloaded items via a `--download-archive` file
  - If the *server itself* crashes/restarts mid-download, the app detects the orphaned job on
    next boot and lets you **Resume** or **Discard** it
- **Live progress** — thumbnail, percentage, speed, ETA, streamed over WebSocket
- **Download history** — persisted to a JSON file
- **Configurable**: quality cap, output format, audio-only mode, speed limit, filename template
  — all settings persisted to JSON and reloaded on next launch

## Quick start

```bash
# build & run instantly
docker compose up --build

# build no cache
npm run build
```

Then open **http://localhost:3001**.

Downloaded files land in `./downloads` on your host machine. App state (history, config,
in-progress queue, playlist archives) lives in `./data`.

## Project structure

```
capsulemd/
├── Dockerfile               # multi-stage build: React build -> Ubuntu runtime w/ yt-dlp
├── docker-compose.yml
├── package.json              # backend deps (express, ws, cors)
├── server/
│   ├── index.js               # Express app + WebSocket server
│   ├── routes/
│   │   ├── download.js        # POST /api/probe, /api/download, queue endpoints
│   │   ├── history.js         # GET /api/history
│   │   └── config.js          # GET/POST /api/config
│   ├── lib/
│   │   ├── ytdlp.js            # builds yt-dlp CLI args, spawns process, parses progress JSON
│   │   ├── queue.js            # sequential job queue, state persistence, crash recovery
│   │   ├── store.js            # JSON file read/write (config, history, queue state)
│   │   └── urlDetect.js        # probes a URL to detect video vs playlist
│   └── data/                  # (gitignored) history.json, config.json, queue-state.json, archives
├── client/                   # React + Vite frontend
│   └── src/
│       ├── App.jsx
│       ├── components/        # UrlBar, PlaylistPreview, CurrentDownload, QueueList, History, ConfigPanel, OrphanBanner
│       ├── hooks/useWebSocket.js
│       └── lib/api.js
├── test/
│   └── smoke_queue.js         # logic tests for store.js + ytdlp.js argument building
└── downloads/                 # (gitignored) where files actually get saved
```

## How resume works

- **Single video, connection drops mid-download:** yt-dlp writes to a partial file. Re-running
  the same download (which the app does automatically since the job stays in the queue/history
  as "failed" but the file remains) picks up where it left off via `--continue`.
- **Playlist, interrupted partway:** every completed item's ID is appended to an archive file
  at `server/data/archive-<playlistId>.txt`. Re-queuing the same playlist URL causes yt-dlp to
  skip everything already in that file and only fetch what's missing.
- **Server process itself dies mid-job:** the in-progress job is persisted to
  `server/data/queue-state.json` *before* the download starts. On next boot, `index.js` checks
  for this and the frontend shows a banner offering **Resume** (re-enqueues the same job — file
  resume / archive skip behavior above kicks in) or **Discard**.

## Configuration options

| Setting | Notes |
|---|---|
| Quality | `best`, `1080p`, `720p`, `480p` (maps to yt-dlp format selectors) |
| Output format | mp4 / mkv / webm (via `--merge-output-format`) |
| Audio only | extracts audio only (`-x`), choose mp3/m4a/opus |
| Speed limit | passed to `--limit-rate`, e.g. `2M` for 2 MB/s. Empty = unlimited |
| Output folder | path inside the container (`/downloads` by default, mapped to host `./downloads`) |
| Filename template | yt-dlp output template, e.g. `%(playlist_index)s - %(title)s.%(ext)s` |

## Local development (without Docker)

Backend:
```bash
npm install
npm run dev   # nodemon-style auto-restart via --watch
```

Frontend (in a separate terminal):
```bash
cd client
npm install
npm run dev   # Vite dev server on :5173, proxies /api and /ws to :3001
```

You'll need `yt-dlp` and `ffmpeg` installed locally (e.g. `pip install yt-dlp`, `brew install ffmpeg` / `apt install ffmpeg`).

## Running the smoke tests

```bash
node test/smoke_queue.js
```

Validates the JSON store logic and yt-dlp argument construction (video vs playlist vs
audio-only vs rate-limited) without needing the actual yt-dlp binary or a browser.

## Not included in v1 (possible next steps)

- Subtitle download toggle
- Concurrent downloads (intentionally left out — sequential avoids triggering rate limits)
- Cookies support for private/age-restricted content
- Proxy configuration
- "Sync" mode to detect new items in a previously-downloaded growing playlist
- History search/filter/export
- In-app yt-dlp self-update button
