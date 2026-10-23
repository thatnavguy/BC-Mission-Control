import express from 'express';
import path from 'path';
import fs from 'fs';
import { router } from './routes';

const PORT = Number(process.env.PORT) || 4321;

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use('/api', router);

// Serve the built frontend when available (production mode)
const webDist = path.resolve(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status && Number.isInteger(err.status) ? err.status : 500).json({ error: err.message || 'Internal error' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`BC Mission Control running at http://127.0.0.1:${PORT}`);
});
