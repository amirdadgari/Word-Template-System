import cors from 'cors';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { ensureDirs } from './storage.js';
import { initDb, openDb } from './sqlite.js';
import { apiRouter } from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await ensureDirs();
const db = openDb();
initDb(db);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api', apiRouter);

const webDist = path.resolve(__dirname, '../../web/dist');
try {
  await fs.access(webDist);
  app.use(express.static(webDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
} catch {
  app.get('*', (req, res) => {
    res.status(200).send('UI not built yet. Run: npm -w web run dev (or npm run build)');
  });
}

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});
