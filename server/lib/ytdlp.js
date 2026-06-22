const { spawn } = require('child_process');
const path = require('path');

/**
 * Builds yt-dlp CLI args from a job + global config.
 *
 * job: {
 *   url, type ('video'|'playlist'),
 *   selectedItems: [videoId, ...] | null (null = all items, for playlists),
 *   archivePath, outputDir, filenameTemplate
 * }
 * config: { quality, audioOnly, outputFormat, audioFormat, speedLimit }
 */
function buildArgs(job, config) {
  const args = [];

  // --- Progress reporting: structured JSON per line, easy to parse ---
  args.push('--newline');
  args.push('--progress-template', '%(progress)j');

  // --- Resume behavior ---
  args.push('--continue'); // resume partial file downloads (default true, explicit for clarity)
  args.push('--no-part');

  // --- Playlist archive (skip already-downloaded items on re-run) ---
  if (job.archivePath) {
    args.push('--download-archive', job.archivePath);
  }

  // --- Format / quality selection ---
  if (config.audioOnly) {
    args.push('-x');
    args.push('--audio-format', config.audioFormat || 'mp3');
  } else {
    const formatMap = {
      best: 'bestvideo*+bestaudio/best',
      '1080p': 'bestvideo[height<=1080]*+bestaudio/best[height<=1080]',
      '720p': 'bestvideo[height<=720]*+bestaudio/best[height<=720]',
      '480p': 'bestvideo[height<=480]*+bestaudio/best[height<=480]',
    };
    args.push('-f', formatMap[config.quality] || formatMap.best);
    if (config.outputFormat) {
      args.push('--merge-output-format', config.outputFormat);
    }
  }

  // --- Speed limit ---
  if (config.speedLimit) {
    args.push('--limit-rate', config.speedLimit);
  }

  // --- Output path/template ---
  const template = job.filenameTemplate || config.filenameTemplate;
  const outDir = job.outputDir || config.outputDir;
  args.push('-o', path.join(outDir, template));

  // --- Playlist item selection ---
  if (job.type === 'playlist') {
    // Force full playlist enumeration before downloading; without this yt-dlp
    // may lazily fetch pages and miss items beyond the first 100.
    args.push('--no-lazy-playlist');
    if (job.selectedIndices && job.selectedIndices.length > 0) {
      // yt-dlp accepts --playlist-items as 1-based indices, not video IDs.
      args.push('--playlist-items', job.selectedIndices.join(','));
    }
  } else {
    args.push('--no-playlist');
  }

  args.push('--no-warnings');
  args.push(job.url);

  return args;
}

/**
 * Spawns yt-dlp for a job. Emits progress events via the onProgress callback.
 * Returns the child process handle so callers can kill() it for cancel/pause.
 *
 * onProgress receives objects like:
 *  { status: 'downloading', downloaded_bytes, total_bytes, speed, eta, filename }
 *  { status: 'finished', filename }
 *  { status: 'error', message }
 */
function startDownload(job, config, { onProgress, onLine, onStderrLine, onClose }) {
  const args = buildArgs(job, config);
  const child = spawn('yt-dlp', args);

  let stderrBuf = '';

  child.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      onLine?.(line);
      const parsed = tryParseProgressLine(line);
      if (parsed) onProgress?.(parsed);
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderrBuf += text;
    if (stderrBuf.length > 4000) stderrBuf = stderrBuf.slice(-4000);
    for (const line of text.split('\n').filter(Boolean)) {
      onStderrLine?.(line);
    }
  });

  child.on('close', (code) => {
    onClose?.(code, stderrBuf);
  });

  child.on('error', (err) => {
    onProgress?.({ status: 'error', message: `Failed to spawn yt-dlp: ${err.message}` });
  });

  return child;
}

function tryParseProgressLine(line) {
  // --progress-template outputs raw JSON for matching lines; other lines
  // (e.g. "[download] Destination: ...") are plain text and ignored here.
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

module.exports = { buildArgs, startDownload };
