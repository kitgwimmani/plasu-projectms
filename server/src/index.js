import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from './db.js';
import { seed } from './seed.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import projectRoutes from './routes/projects.js';
import commsRoutes from './routes/comms.js';
import toolRoutes from './routes/tools.js';

await seed();

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/logo.png', (req, res) => res.sendFile(path.join(ROOT, '..', 'logo.png')));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', commsRoutes);
app.use('/api', toolRoutes);

// Serve the built React client in production
const dist = path.join(ROOT, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is larger than 25 MB' });
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`PLASU PMS API running on http://localhost:${PORT}`));
