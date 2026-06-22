import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Connects to the backend WebSocket and exposes the latest queue state +
 * live progress, with auto-reconnect if the connection drops.
 */
export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [queue, setQueue] = useState({ currentJob: null, pendingJobs: [] });
  const [progress, setProgress] = useState(null);
  const [lastJobResult, setLastJobResult] = useState(null);
  const [log, setLog] = useState([]);
  const [playlistProgress, setPlaylistProgress] = useState(null); // { current, total }
  const [historyRevision, setHistoryRevision] = useState(0);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'queue_updated':
            setQueue(msg.queue);
            if (!msg.queue.currentJob) {
              setProgress(null);
              setPlaylistProgress(null);
            } else if (msg.queue.playlistProgress) {
              setPlaylistProgress(msg.queue.playlistProgress);
            }
            break;
          case 'job_started':
            setLog([]);
            setProgress(null);
            setPlaylistProgress(null);
            break;
          case 'job_log':
            setLog((prev) => (prev.length >= 500 ? [...prev.slice(-499), msg.line] : [...prev, msg.line]));
            break;
          case 'playlist_progress':
            setPlaylistProgress({ current: msg.current, total: msg.total, thumbnail: msg.thumbnail ?? null });
            break;
          case 'history_updated':
            setHistoryRevision((r) => r + 1);
            break;
          case 'progress':
            setProgress(msg.progress);
            break;
          case 'job_finished':
            setLastJobResult({ jobId: msg.jobId, success: msg.success, error: msg.error });
            break;
          default:
            break;
        }
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after a short delay
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, queue, progress, lastJobResult, log, playlistProgress, historyRevision };
}
