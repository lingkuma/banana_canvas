import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiRouter } from './server/ai.mjs';

const app = express();
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(rootDir, 'dist');
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(createAiRouter(process.env));
app.use(express.static(distDir));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, host, () => {
  console.log('Banana Canvas is running at http://' + host + ':' + port);
});
