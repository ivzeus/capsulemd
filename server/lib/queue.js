const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const store = require('./store');
const { startDownload, buildArgs } = require('./ytdlp');

class QueueManager {
  constructor(broadcast) {
    this.broadcast = broadcast;
    this.currentChild = null;
    this.currentJob = null;
    this.processing = false;
    this.cancelledByUser = false;

    // Playlist-level tracking (reset per job)
    this.playlistCurrent = 0;
    this.playlistTotal = 0;
    this.currentClipThumbnail = null;
    this.lastClipSkipped = false; // true when yt-dlp skips current item (archive hit)
    this.clipsDownloaded = 0;
    this.clipStartedAt = null;
    this.lastOutputFile = null;
  }

  checkForOrphanedJob() {
    const state = store.getQueueState();
    if (state.currentJob) {
      console.log(`[queue] Found orphaned job from previous run: ${state.currentJob.title}`);
      return state.currentJob;
    }
    return null;
  }

  resumeOrphanedJob() {
    const state = store.getQueueState();
    if (state.currentJob) {
      this.enqueue(state.currentJob, { atFront: true });
    }
  }

  discardOrphanedJob() {
    const state = store.getQueueState();
    state.currentJob = null;
    store.setQueueState(state);
  }

  enqueue(job, { atFront = false } = {}) {
    if (!job.id) job.id = crypto.randomUUID();
    if (!job.status) job.status = 'queued';

    const state = store.getQueueState();
    if (atFront) {
      state.pendingJobs.unshift(job);
    } else {
      state.pendingJobs.push(job);
    }
    store.setQueueState(state);

    this.broadcast({ type: 'queue_updated', queue: this.getQueueSnapshot() });
    this._processNext();
    return job.id;
  }

  cancelCurrent() {
    if (this.currentChild) {
      this.cancelledByUser = true;
      this.currentChild.kill('SIGTERM');
    }
  }

  removeFromPending(jobId) {
    const state = store.getQueueState();
    state.pendingJobs = state.pendingJobs.filter((j) => j.id !== jobId);
    store.setQueueState(state);
    this.broadcast({ type: 'queue_updated', queue: this.getQueueSnapshot() });
  }

  getQueueSnapshot() {
    const state = store.getQueueState();
    return {
      currentJob: this.currentJob,
      pendingJobs: state.pendingJobs,
      playlistProgress: this.playlistCurrent > 0
        ? { current: this.playlistCurrent, total: this.playlistTotal, thumbnail: this.currentClipThumbnail }
        : null,
    };
  }

  async _processNext() {
    if (this.processing) return;
    const state = store.getQueueState();
    if (state.pendingJobs.length === 0) return;

    const job = state.pendingJobs.shift();
    state.currentJob = { ...job, status: 'downloading', startedAt: Date.now() };
    store.setQueueState(state);

    this.processing = true;
    this.currentJob = state.currentJob;
    this.cancelledByUser = false;

    // Reset playlist tracking for the new job
    this.playlistCurrent = 0;
    this.playlistTotal = 0;
    this.currentClipThumbnail = null;
    this.lastClipSkipped = false;
    this.clipsDownloaded = 0;
    this.clipStartedAt = null;
    this.lastOutputFile = null;

    this.broadcast({ type: 'job_started', job: this.currentJob });
    this.broadcast({ type: 'queue_updated', queue: this.getQueueSnapshot() });

    const config = store.getConfig();

    if (job.type === 'playlist' && !job.archivePath) {
      const safeId = job.playlistId || job.id;
      job.archivePath = path.join(store.DATA_DIR, `archive-${safeId}.txt`);
    }

    const cmdArgs = buildArgs(job, config);
    this._broadcastLog(this.currentJob.id, `$ yt-dlp ${cmdArgs.join(' ')}`);

    this.currentChild = startDownload(job, config, {
      onProgress: (p) => this._handleProgress(p),
      onLine: (line) => {
        if (!this.currentJob || line.trim().startsWith('{')) return;
        this._broadcastLog(this.currentJob.id, line);
        if (this.currentJob.type === 'playlist') {
          this._parsePlaylistLine(line);
        }
      },
      onStderrLine: (line) => {
        if (!this.currentJob) return;
        this._broadcastLog(this.currentJob.id, line);
        if (this.currentJob.type === 'playlist') {
          this._parsePlaylistLine(line);
        }
      },
      onClose: (code, stderr) => this._handleClose(job, code, stderr),
    });
  }

  // Parse yt-dlp stderr lines for playlist progress and output file tracking.
  _parsePlaylistLine(line) {
    // "Downloading item 3 of 192" — item N-1 just finished, item N is starting
    const itemMatch = line.match(/\[download\]\s+Downloading item (\d+) of (\d+)/);
    if (itemMatch) {
      const current = parseInt(itemMatch[1]);
      const total = parseInt(itemMatch[2]);

      if (current > 1 && this.playlistCurrent >= 1 && this.currentJob && !this.lastClipSkipped) {
        this._addClipHistoryEntry(this.currentJob);
      }

      this.playlistCurrent = current;
      this.playlistTotal = total;
      this.lastClipSkipped = false; // reset for the new clip
      this.currentClipThumbnail = this.currentJob?.clipThumbnails?.[current - 1] ?? null;
      this.clipStartedAt = Date.now();
      this.lastOutputFile = null;

      this.broadcast({
        type: 'playlist_progress',
        jobId: this.currentJob.id,
        current,
        total,
        thumbnail: this.currentClipThumbnail,
      });
      return;
    }

    // "[youtube] VIDEO_ID: Downloading ..." — extract video ID to derive thumbnail
    // This fires for every clip and works even for jobs without clipThumbnails stored.
    const ytVideoMatch = line.match(/^\[youtube\]\s+([A-Za-z0-9_-]{11}):\s+Downloading/);
    if (ytVideoMatch && !this.currentClipThumbnail) {
      this.currentClipThumbnail = `https://i.ytimg.com/vi/${ytVideoMatch[1]}/hqdefault.jpg`;
      this.broadcast({
        type: 'playlist_progress',
        jobId: this.currentJob.id,
        current: this.playlistCurrent,
        total: this.playlistTotal,
        thumbnail: this.currentClipThumbnail,
      });
      return;
    }

    // yt-dlp archive skip: "has already been recorded in the archive; Skipping..."
    if (line.includes('has already been recorded in the archive')) {
      this.lastClipSkipped = true;
      return;
    }

    // "[Merger] Merging formats into "PATH"" — final merged file (highest priority)
    const mergerMatch = line.match(/\[Merger\]\s+Merging formats into "(.+)"/);
    if (mergerMatch) {
      this.lastOutputFile = mergerMatch[1].trim();
      return;
    }

    // "[download] Destination: PATH" — fallback when no merge step (e.g. audio-only)
    const destMatch = line.match(/\[download\]\s+Destination:\s+(.+)/);
    if (destMatch) {
      this.lastOutputFile = destMatch[1].trim();
    }
  }

  // Derive a human title from a file path like "/downloads/03 - Some Title.mp4"
  _titleFromOutputFile(filepath) {
    let base = path.basename(filepath);
    // Strip format-specific suffixes like ".f137.mp4" produced by yt-dlp temp files
    base = base.replace(/\.f\d+(\.\w+)$/, '$1');
    return path.basename(base, path.extname(base))
      .replace(/^\d+\s*[-–]\s*/, '')
      .trim();
  }

  _addClipHistoryEntry(job) {
    const title = this.lastOutputFile
      ? this._titleFromOutputFile(this.lastOutputFile)
      : `Item ${this.playlistCurrent}`;

    this.clipsDownloaded++;

    store.addHistoryEntry({
      id: crypto.randomUUID(),
      url: job.url,
      type: 'video',
      title,
      thumbnail: this.currentClipThumbnail || null,
      status: 'completed',
      error: null,
      startedAt: this.clipStartedAt || Date.now(),
      finishedAt: Date.now(),
      outputDir: job.outputDir,
    });

    this.broadcast({ type: 'history_updated' });
  }

  _broadcastLog(jobId, line) {
    this.broadcast({ type: 'job_log', jobId, line });
  }

  _handleProgress(p) {
    if (!this.currentJob) return;
    this.currentJob.progress = p;
    this.broadcast({ type: 'progress', jobId: this.currentJob.id, progress: p });
  }

  _handleClose(job, code, stderr) {
    this.processing = false;
    this.currentChild = null;

    const finishedJob = this.currentJob;
    const success = code === 0;

    // For playlists: add history for the last clip before clearing state.
    // Intermediate clips are added in _parsePlaylistLine when the next item starts;
    // the final clip has no "next item" signal so we handle it here.
    if (job.type === 'playlist' && success && this.playlistCurrent > 0 && finishedJob && !this.lastClipSkipped) {
      this._addClipHistoryEntry(finishedJob);
    }

    const clipsDownloaded = this.clipsDownloaded;
    const playlistTotal = this.playlistTotal;

    this.playlistCurrent = 0;
    this.playlistTotal = 0;
    this.currentClipThumbnail = null;
    this.lastClipSkipped = false;
    this.clipsDownloaded = 0;
    this.lastOutputFile = null;

    this.currentJob = null;

    const state = store.getQueueState();
    state.currentJob = null;
    store.setQueueState(state);

    const errorMessage = success ? null : this.cancelledByUser ? 'User cancelled' : stderr.slice(-1000);

    // For playlists: per-clip entries cover the success case.
    // Add a job-level entry only on failure, or when success but 0 clips were
    // actually downloaded (all items were already in the archive).
    const needsJobEntry = job.type !== 'playlist' || !success || clipsDownloaded === 0;
    if (needsJobEntry) {
      const allAlreadyDownloaded = job.type === 'playlist' && success && clipsDownloaded === 0 && playlistTotal > 0;
      store.addHistoryEntry({
        id: finishedJob.id,
        url: finishedJob.url,
        type: finishedJob.type,
        title: finishedJob.title || finishedJob.url,
        thumbnail: finishedJob.thumbnail || null,
        status: success ? 'completed' : 'failed',
        error: allAlreadyDownloaded
          ? `All ${playlistTotal} items already downloaded (archive)`
          : errorMessage,
        startedAt: finishedJob.startedAt,
        finishedAt: Date.now(),
        outputDir: finishedJob.outputDir,
      });
    }

    this.broadcast({
      type: 'job_finished',
      jobId: finishedJob.id,
      success,
      error: errorMessage,
    });
    this.broadcast({ type: 'queue_updated', queue: this.getQueueSnapshot() });

    this._processNext();
  }
}

module.exports = QueueManager;
