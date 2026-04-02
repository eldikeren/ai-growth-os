import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import dotenv from 'dotenv';
import routes from './routes/index.js';
import additionalRoutes from './routes/additional.js';
import { processRunQueue, enqueueDueRuns } from './functions/core.js';
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => { const s = Date.now(); res.on('finish', () => { if (req.path !== '/api/health') console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now()-s}ms`); }); next(); });
app.use('/api', routes);
app.use('/api', additionalRoutes);
// Cron: every 5 min — process queue + enqueue due runs
cron.schedule('*/5 * * * *', async () => {
  try {
    const due = await enqueueDueRuns();
    if (due.queued > 0) console.log(`[CRON] Enqueued ${due.queued} scheduled runs`);
    const q = await processRunQueue();
    if (q.processed > 0 || q.failed > 0) console.log(`[CRON] processed=${q.processed} failed=${q.failed} skipped=${q.skipped} (${q.duration_ms}ms)`);
  } catch (err) { console.error('[CRON]', err.message); }
});
app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
app.use((req, res) => res.status(404).json({ error: `Not found: ${req.path}` }));
app.listen(PORT, () => console.log(`\nAI Growth OS running on :${PORT}\n`));
export default app;
