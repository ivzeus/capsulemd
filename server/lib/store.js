const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const FILES = {
  config: path.join(DATA_DIR, 'config.json'),
  history: path.join(DATA_DIR, 'history.json'),
  queueState: path.join(DATA_DIR, 'queue-state.json'),
};

const DEFAULTS = {
  config: {
    quality: 'best', // 'best' | '1080p' | '720p' | '480p' | 'audio-only'
    audioOnly: false,
    outputFormat: 'mp4', // mp4 | mkv | webm (video) — ignored if audioOnly
    audioFormat: 'mp3', // mp3 | m4a | opus — used if audioOnly
    speedLimit: '', // e.g. '2M' for 2MB/s, empty = unlimited
    outputDir: '/downloads',
    filenameTemplate: '%(playlist_index)s - %(title)s.%(ext)s',
  },
  history: [],
  queueState: {
    currentJob: null, // the job in progress (for crash recovery)
    pendingJobs: [], // queued jobs not yet started
  },
};

function readJSON(key) {
  const filePath = FILES[key];
  try {
    if (!fs.existsSync(filePath)) {
      writeJSON(key, DEFAULTS[key]);
      return structuredClone(DEFAULTS[key]);
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[store] Failed to read ${key}, falling back to default:`, err.message);
    return structuredClone(DEFAULTS[key]);
  }
}

function writeJSON(key, data) {
  const filePath = FILES[key];
  const tmpPath = `${filePath}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath); // atomic-ish swap to avoid corruption on crash
  } catch (err) {
    console.error(`[store] Failed to write ${key}:`, err.message);
  }
}

module.exports = {
  getConfig: () => readJSON('config'),
  setConfig: (data) => writeJSON('config', data),

  getHistory: () => readJSON('history'),
  addHistoryEntry: (entry) => {
    const history = readJSON('history');
    history.unshift(entry); // newest first
    writeJSON('history', history);
  },
  updateHistoryEntry: (id, updates) => {
    const history = readJSON('history');
    const idx = history.findIndex((h) => h.id === id);
    if (idx !== -1) {
      history[idx] = { ...history[idx], ...updates };
      writeJSON('history', history);
    }
  },
  removeHistoryEntry: (id) => {
    const history = readJSON('history');
    writeJSON('history', history.filter((h) => h.id !== id));
  },
  clearHistory: () => writeJSON('history', []),

  getQueueState: () => readJSON('queueState'),
  setQueueState: (data) => writeJSON('queueState', data),

  DATA_DIR,
};
