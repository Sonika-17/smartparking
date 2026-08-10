// ─────────────────────────────────────────────────────────────
//  ParkQR — Backend Server
//  Node.js + Express  |  No database required (JSON files)
//  Run: node server.js  OR  npm run dev
// ─────────────────────────────────────────────────────────────
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: '*',           // allow all origins (update in production)
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve the frontend HTML directly ─────────────────────────
// Place park.html in the same folder as server.js
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ───────────────────────────────────────────────
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/parking', require('./routes/parking'));
app.use('/api/admin',   require('./routes/admin'));

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── Catch-all: serve index.html for any unknown route ────────
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Frontend not found. Place park.html in /public/index.html' });
  }
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n  ✅  ParkQR backend running on http://localhost:${PORT}`);
  console.log(`  📋  API base: http://localhost:${PORT}/api`);
  console.log(`  🌐  Frontend: http://localhost:${PORT}\n`);
});
