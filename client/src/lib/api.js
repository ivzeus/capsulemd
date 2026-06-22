const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  probe: (url) => request('/probe', { method: 'POST', body: JSON.stringify({ url }) }),

  download: (job) => request('/download', { method: 'POST', body: JSON.stringify(job) }),

  getQueue: () => request('/queue'),
  cancelCurrent: () => request('/queue/cancel-current', { method: 'POST' }),
  removeFromQueue: (jobId) => request(`/queue/${jobId}`, { method: 'DELETE' }),

  getOrphanedJob: () => request('/orphaned-job'),
  resumeOrphanedJob: () => request('/orphaned-job/resume', { method: 'POST' }),
  discardOrphanedJob: () => request('/orphaned-job/discard', { method: 'POST' }),

  getHistory: () => request('/history'),
  removeHistoryEntry: (id) => request(`/history/${id}`, { method: 'DELETE' }),
  clearHistory: () => request('/history/all', { method: 'DELETE' }),

  getConfig: () => request('/config'),
  setConfig: (config) => request('/config', { method: 'POST', body: JSON.stringify(config) }),
};
