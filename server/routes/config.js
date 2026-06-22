const express = require('express');
const store = require('../lib/store');

const router = express.Router();

const ALLOWED_KEYS = [
  'quality',
  'audioOnly',
  'outputFormat',
  'audioFormat',
  'speedLimit',
  'outputDir',
  'filenameTemplate',
];

router.get('/', (req, res) => {
  res.json(store.getConfig());
});

router.post('/', (req, res) => {
  const current = store.getConfig();
  const updates = {};
  for (const key of ALLOWED_KEYS) {
    if (key in req.body) updates[key] = req.body[key];
  }
  const next = { ...current, ...updates };
  store.setConfig(next);
  res.json(next);
});

module.exports = router;
