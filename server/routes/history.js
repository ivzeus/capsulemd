const express = require('express');
const store = require('../lib/store');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(store.getHistory());
});

router.delete('/all', (req, res) => {
  store.clearHistory();
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  store.removeHistoryEntry(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
