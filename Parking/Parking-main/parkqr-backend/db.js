// ─────────────────────────────────────────────────────────────
//  db.js  —  Simple JSON file database (no MongoDB/SQL needed)
//  All data lives in /data/*.json files on disk
// ─────────────────────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function filePath(name) {
  return path.join(DATA_DIR, name + '.json');
}

function read(name) {
  try {
    const raw = fs.readFileSync(filePath(name), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), 'utf8');
}

// ── USERS ─────────────────────────────────────────────────────
function getUsers() {
  return read('users') || {};
}
function saveUsers(users) {
  write('users', users);
}

// ── SLOTS (S50–S60) ───────────────────────────────────────────
const SLOT_MIN  = 50;
const SLOT_MAX  = 60;

function getSlots() {
  const raw = read('slots');
  if (raw) return raw;
  // Initialize S50–S60 as available
  const slots = {};
  for (let i = SLOT_MIN; i <= SLOT_MAX; i++) {
    const id = 'S' + String(i).padStart(2, '0');
    slots[id] = { status: 'available', plate: null, qr: null };
  }
  write('slots', slots);
  return slots;
}
function saveSlots(slots) {
  write('slots', slots);
}

// ── SESSIONS (active parked vehicles) ─────────────────────────
function getSessions() {
  return read('sessions') || {};
}
function saveSessions(sessions) {
  write('sessions', sessions);
}

// ── LOGS ──────────────────────────────────────────────────────
function getLogs() {
  return read('logs') || [];
}
function addLog(type, msg) {
  const logs = getLogs();
  logs.unshift({
    type,
    msg,
    time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
    ts: Date.now()
  });
  if (logs.length > 500) logs.pop();
  write('logs', logs);
}

// ── BOOKING HISTORY ───────────────────────────────────────────
function getHistory() {
  return read('history') || [];
}
function saveHistory(h) {
  write('history', h);
}
function addHistory(entry) {
  const h = getHistory();
  h.unshift(entry);
  if (h.length > 1000) h.pop();
  write('history', h);
}
function updateHistoryStatus(code, fee, exitTime) {
  const h = getHistory();
  const idx = h.findIndex(e => e.code === code);
  if (idx > -1) {
    h[idx].status   = 'checkedout';
    h[idx].fee      = fee;
    h[idx].exitTime = exitTime;
  }
  write('history', h);
}

// ── REVENUE ───────────────────────────────────────────────────
function todayKey() {
  const d = new Date();
  return `rev_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}
function getRevenue() {
  return read('revenue') || {};
}
function addRevenue(amount) {
  const rev = getRevenue();
  const key = todayKey();
  rev[key]     = (rev[key]     || 0) + amount;
  rev.all_time = (rev.all_time || 0) + amount;
  write('revenue', rev);
}
function getTodayRevenue() {
  const rev = getRevenue();
  return rev[todayKey()] || 0;
}
function getAllRevenue() {
  return (getRevenue()).all_time || 0;
}

module.exports = {
  SLOT_MIN, SLOT_MAX,
  getUsers, saveUsers,
  getSlots, saveSlots,
  getSessions, saveSessions,
  getLogs, addLog,
  getHistory, saveHistory, addHistory, updateHistoryStatus,
  addRevenue, getTodayRevenue, getAllRevenue, getRevenue, todayKey
};
