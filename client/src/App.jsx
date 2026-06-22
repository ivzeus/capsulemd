import { useEffect, useState, useCallback } from 'react';
import { api } from './lib/api';
import { useWebSocket } from './hooks/useWebSocket';

import UrlBar from './components/UrlBar';
import PlaylistPreview from './components/PlaylistPreview';
import CurrentDownload from './components/CurrentDownload';
import QueueList from './components/QueueList';
import History from './components/History';
import ConfigPanel from './components/ConfigPanel';
import OrphanBanner from './components/OrphanBanner';

export default function App() {
  const { connected, queue, progress, log, playlistProgress, historyRevision } = useWebSocket();

  const [probing, setProbing] = useState(false);
  const [pendingPlaylist, setPendingPlaylist] = useState(null); // probe result awaiting selection
  const [history, setHistory] = useState([]);
  const [config, setConfig] = useState(null);
  const [orphanedJob, setOrphanedJob] = useState(null);
  const [toast, setToast] = useState(null);

  // Initial load
  useEffect(() => {
    api.getHistory().then(setHistory).catch(() => {});
    api.getConfig().then(setConfig).catch(() => {});
    api
      .getOrphanedJob()
      .then((res) => setOrphanedJob(res.job))
      .catch(() => {});
  }, []);

  // Refresh history whenever the queue transitions to empty (a job just finished)
  useEffect(() => {
    if (!queue.currentJob) {
      api.getHistory().then(setHistory).catch(() => {});
    }
  }, [queue.currentJob]);

  // Refresh history when a playlist clip completes mid-download
  useEffect(() => {
    if (historyRevision > 0) {
      api.getHistory().then(setHistory).catch(() => {});
    }
  }, [historyRevision]);

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }, []);

  async function handleUrlSubmit(url) {
    setProbing(true);
    try {
      const result = await api.probe(url);
      if (result.type === 'playlist') {
        setPendingPlaylist(result);
      } else {
        setPendingPlaylist(null);
        await api.download({
          url: result.sourceUrl,
          type: 'video',
          title: result.title,
          thumbnail: result.thumbnail,
        });
        showToast(`Queued: ${result.title}`);
      }
    } catch (err) {
      showToast(`Couldn't read that link: ${err.message}`);
    } finally {
      setProbing(false);
    }
  }

  async function handlePlaylistConfirm(selectedIndices) {
    const playlist = pendingPlaylist;
    setPendingPlaylist(null);
    const downloadAll = selectedIndices === null;
    const clipThumbnails = downloadAll
      ? playlist.entries.map((e) => e.thumbnail)
      : selectedIndices.map((idx) => playlist.entries[idx - 1]?.thumbnail ?? null);
    try {
      await api.download({
        url: playlist.sourceUrl,
        type: 'playlist',
        title: playlist.title,
        playlistId: playlist.id,
        selectedIndices: downloadAll ? null : selectedIndices,
        clipThumbnails,
      });
      showToast(
        downloadAll
          ? `Queued playlist: ${playlist.title} (all ${playlist.playlistCount} items)`
          : `Queued playlist: ${playlist.title} (${selectedIndices.length} items)`
      );
    } catch (err) {
      showToast(`Failed to queue playlist: ${err.message}`);
    }
  }

  async function handleConfigChange(next) {
    setConfig(next);
    try {
      await api.setConfig(next);
    } catch (err) {
      showToast(`Failed to save settings: ${err.message}`);
    }
  }

  async function handleCancel() {
    try {
      await api.cancelCurrent();
    } catch (err) {
      showToast(`Failed to cancel: ${err.message}`);
    }
  }

  async function handleRemoveFromQueue(jobId) {
    try {
      await api.removeFromQueue(jobId);
    } catch (err) {
      showToast(`Failed to remove: ${err.message}`);
    }
  }

  async function handleRemoveHistoryEntry(id) {
    try {
      await api.removeHistoryEntry(id);
      setHistory((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      showToast(`Failed to remove: ${err.message}`);
    }
  }

  async function handleClearHistory() {
    try {
      await api.clearHistory();
      setHistory([]);
    } catch (err) {
      showToast(`Failed to clear history: ${err.message}`);
    }
  }

  async function handleResumeOrphan() {
    try {
      await api.resumeOrphanedJob();
      setOrphanedJob(null);
    } catch (err) {
      showToast(`Failed to resume: ${err.message}`);
    }
  }

  async function handleDiscardOrphan() {
    try {
      await api.discardOrphanedJob();
      setOrphanedJob(null);
    } catch (err) {
      showToast(`Failed to discard: ${err.message}`);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="app-title">
            <span className="dot" />
            capsuleMD
            <span className="build-sig">{__BUILD_SIG__}-{__BUILD_TIME__}</span>
          </div>
          <div className="app-subtitle">{connected ? 'connected' : 'reconnecting…'}</div>
        </div>
      </header>

      <OrphanBanner job={orphanedJob} onResume={handleResumeOrphan} onDiscard={handleDiscardOrphan} />

      <UrlBar onSubmit={handleUrlSubmit} loading={probing} />

      {pendingPlaylist && (
        <PlaylistPreview
          playlist={pendingPlaylist}
          onConfirm={handlePlaylistConfirm}
          onCancel={() => setPendingPlaylist(null)}
        />
      )}

      <CurrentDownload job={queue.currentJob} progress={progress} log={log} playlistProgress={playlistProgress} onCancel={handleCancel} />

      <QueueList jobs={queue.pendingJobs} onRemove={handleRemoveFromQueue} />

      {config && <ConfigPanel config={config} onChange={handleConfigChange} />}

      <History entries={history} onRemove={handleRemoveHistoryEntry} onClear={handleClearHistory} />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
