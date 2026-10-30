import express from 'express';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { router } from './routes';
import { getEmbeddedAsset } from './webAssets';
import { isSea } from './runtime';
import { cleanupStaleRunFiles, loadSettings } from './store';

// PORT env var wins as a one-off override; otherwise the saved setting.
const PORT = Number(process.env.PORT) || loadSettings().port || 7654;

const app = express();

// The API holds the user's BC tokens, so only accept requests that really
// target this local server. The Host check blocks DNS rebinding; the Origin
// check blocks other websites from POSTing here (CSRF). Requests without an
// Origin (curl, scripts) are allowed.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
function hostnameOf(value: string): string | undefined {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}
app.use('/api', (req, res, next) => {
  const host = hostnameOf(req.headers.host ?? '');
  if (!host || !LOCAL_HOSTS.has(host)) {
    return res.status(403).json({ error: 'Forbidden host' });
  }
  const origin = req.headers.origin;
  if (req.method !== 'GET' && req.method !== 'HEAD' && origin !== undefined) {
    const originHost = hostnameOf(origin);
    if (!originHost || !LOCAL_HOSTS.has(originHost)) {
      return res.status(403).json({ error: 'Forbidden origin' });
    }
  }
  next();
});

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
  // Only after binding: a second instance that fails to bind must not delete
  // the running instance's in-flight script files.
  cleanupStaleRunFiles();
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
