import express from 'express';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { router } from './routes';
import { getEmbeddedAsset } from './webAssets';
import { isSea } from './runtime';
import { loadSettings } from './store';

// PORT env var wins as a one-off override; otherwise the saved setting.
const PORT = Number(process.env.PORT) || loadSettings().port || 4321;

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use('/api', router);

// Serve the built frontend: from disk in normal runs, from assets embedded
// in the bundle when running as a single executable (no web/dist on disk).
const webDist = path.resolve(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
} else {
  app.get(/^(?!\/api\/).*/, (req, res) => {
    const asset = getEmbeddedAsset(req.path) ?? getEmbeddedAsset('/index.html');
    if (!asset) return res.status(404).end();
    res.type(asset.type).send(asset.content);
  });
}

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status && Number.isInteger(err.status) ? err.status : 500).json({ error: err.message || 'Internal error' });
});

app.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  if (isSea()) {
    console.log('');
    console.log('==========================================');
    console.log('  BC Mission Control');
    console.log('==========================================');
    console.log('');
    console.log(`  Running at ${url}`);
    console.log('');
    console.log('  KEEP THIS WINDOW OPEN while using the app.');
    console.log('  Closing it stops BC Mission Control.');
    console.log('');
    exec(`start "" "${url}"`);
  } else {
    console.log(`BC Mission Control running at ${url}`);
  }
});
