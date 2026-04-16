import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import routes from './routes/index.js';
import additionalRoutes from './routes/additional.js';
import magicLinkRoutes from './routes/magic-link.js';
import onboardingRoutes from './routes/onboarding.js';
import websiteAccessRoutes from './routes/website-access.js';
import gt3Routes from './routes/gt3.js';
dotenv.config();
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => { const s = Date.now(); res.on('finish', () => { if (req.path !== '/api/health') console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now()-s}ms`); }); next(); });
app.use('/api', routes);
app.use('/api', additionalRoutes);
app.use('/api', magicLinkRoutes);
app.use('/api', onboardingRoutes);
app.use('/api', websiteAccessRoutes);
app.use('/api', gt3Routes);
// Serve onboarding portal as static HTML
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
app.get('/onboarding/:token', (req, res) => res.sendFile(join(__dirname, '../../frontend/public/onboarding.html')));
app.get('/setup/:token', (req, res) => res.sendFile(join(__dirname, '../../frontend/public/setup.html')));
app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
app.use((req, res) => res.status(404).json({ error: `Not found: ${req.path}` }));
// Local dev: start server. Vercel: imported as serverless function.
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`\nAI Growth OS running on :${PORT}\n`));
}
export default app;
