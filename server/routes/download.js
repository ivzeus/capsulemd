const express = require('express');
const { probeUrl } = require('../lib/urlDetect');
const store = require('../lib/store');

module.exports = function (queueManager) {
  const router = express.Router();

  // Probe a URL: detect video vs playlist, return metadata for preview
  router.post('/probe', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    try {
      const result = await probeUrl(url);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Enqueue a download job
  router.post('/download', (req, res) => {
    const { url, type, title, thumbnail, selectedIndices, playlistId, clipThumbnails } = req.body;
    if (!url || !type) return res.status(400).json({ error: 'url and type are required' });

    const config = store.getConfig();

    const job = {
      url,
      type, // 'video' | 'playlist'
      title,
      thumbnail,
      playlistId: playlistId || null,
      selectedIndices: type === 'playlist' ? selectedIndices || null : null,
      clipThumbnails: type === 'playlist' ? clipThumbnails || null : null,
      outputDir: config.outputDir,
      filenameTemplate: config.filenameTemplate,
    };

    const jobId = queueManager.enqueue(job);
    res.json({ jobId, queue: queueManager.getQueueSnapshot() });
  });

  // Current queue state
  router.get('/queue', (req, res) => {
    res.json(queueManager.getQueueSnapshot());
  });

  // Cancel the currently-downloading job
  router.post('/queue/cancel-current', (req, res) => {
    queueManager.cancelCurrent();
    res.json({ ok: true });
  });

  // Remove a pending (not-yet-started) job
  router.delete('/queue/:jobId', (req, res) => {
    queueManager.removeFromPending(req.params.jobId);
    res.json({ ok: true });
  });

  // Orphaned job recovery (crash/restart while a download was in progress)
  router.get('/orphaned-job', (req, res) => {
    res.json({ job: queueManager.checkForOrphanedJob() });
  });

  router.post('/orphaned-job/resume', (req, res) => {
    queueManager.resumeOrphanedJob();
    res.json({ ok: true });
  });

  router.post('/orphaned-job/discard', (req, res) => {
    queueManager.discardOrphanedJob();
    res.json({ ok: true });
  });

  return router;
};
