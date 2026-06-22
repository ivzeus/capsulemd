const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const QueueManager = require('./lib/queue');
const downloadRoutes = require('./routes/download');
const historyRoutes = require('./routes/history');
const configRoutes = require('./routes/config');

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Set();

function broadcast(event) {
  const payload = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

const queueManager = new QueueManager(broadcast);

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[ws] client connected (${clients.size} total)`);

  // Send current state immediately so a freshly-opened tab is in sync
  ws.send(JSON.stringify({ type: 'queue_updated', queue: queueManager.getQueueSnapshot() }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[ws] client disconnected (${clients.size} total)`);
  });
});

app.use('/api', downloadRoutes(queueManager));
app.use('/api/history', historyRoutes);
app.use('/api/config', configRoutes);

// Serve the built React frontend in production
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuildPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  const orphaned = queueManager.checkForOrphanedJob();
  if (orphaned) {
    console.log(`[server] orphaned job detected: "${orphaned.title}" — waiting for UI to resume/discard`);
  }
});
