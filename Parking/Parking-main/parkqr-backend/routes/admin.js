
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/analytics/today-bookings
//  Returns all today's bookings with capped fee and duration
// ─────────────────────────────────────────────────────────────
router.get('/analytics/today-bookings', (req, res) => {
  const history = db.getHistory();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // 1 hour = 100, max 3 hours = 300
  function getDuration(entry) {
    if (!entry.exitTime) return 1; // fallback
    const mins = Math.max(0, Math.round((entry.exitTime - entry.entryTime) / 60000));
    return Math.ceil(Math.min(mins / 60, 3));
  }
  const bookings = history.filter(b => {
    const bDate = new Date(b.entryTime);
    return bDate >= today && bDate < new Date(+today + 86400000);
  }).map(b => {
    let duration = 1;
    if (b.exitTime && b.entryTime) {
      duration = Math.ceil(Math.min((b.exitTime - b.entryTime) / 3600000, 3));
      if (duration < 1) duration = 1;
    }
    return {
      user: b.name,
      slot: b.slot,
      entryTime: b.entryTime,
      exitTime: b.exitTime,
      duration,
      fee: duration * 100 > 300 ? 300 : duration * 100
    };
  });
  res.json({ bookings });
});

// All admin routes require auth + admin role
router.use(authMiddleware);
router.use(adminOnly);

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/stats
// ─────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const slots    = db.getSlots();
  const users    = db.getUsers();
  const sessions = db.getSessions();
  const total    = Object.keys(slots).length;
  const occ      = Object.values(slots).filter(s => s.status === 'occupied').length;

  res.json({
    totalSlots:    total,
    available:     total - occ,
    occupied:      occ,
    registeredUsers: Object.keys(users).length,
    activeSessions:  Object.keys(sessions).length,
    todayRevenue:  db.getTodayRevenue(),
    allTimeRevenue: db.getAllRevenue()
  });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/users
// ─────────────────────────────────────────────────────────────
router.get('/users', (req, res) => {
  const users = db.getUsers();
  // Strip passwords before sending
  const safe = Object.entries(users).map(([uname, u]) => ({
    username: uname,
    display: u.display,
    fname: u.fname,
    lname: u.lname,
    email: u.email,
    phone: u.phone,
    plate: u.plate,
    vtype: u.vtype,
    registeredAt: u.registeredAt
  }));
  res.json({ users: safe, count: safe.length });
});

module.exports = router;

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/logs
// ─────────────────────────────────────────────────────────────
router.get('/logs', (req, res) => {
  const logs = db.getLogs();
  res.json({ logs });
});

// DELETE /api/admin/logs
router.delete('/logs', (req, res) => {
  const fs   = require('fs');
  const path = require('path');
  const fp   = path.join(__dirname, '../data/logs.json');
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/history?filter=today|yesterday|tomorrow|older|all
// ─────────────────────────────────────────────────────────────
router.get('/history', (req, res) => {
  const { filter = 'all' } = req.query;
  const history = db.getHistory();

  function getLabel(ts) {
    const now  = new Date();
    const d    = new Date(ts);
    const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(+today - 86400000);
    const tomorrow  = new Date(+today + 86400000);
    const bDate     = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (+bDate === +today)     return 'today';
    if (+bDate === +yesterday) return 'yesterday';
    if (+bDate === +tomorrow)  return 'tomorrow';
    if (bDate < today)         return 'older';
    return 'upcoming';
  }

  const filtered = filter === 'all'
    ? history
    : history.filter(b => getLabel(b.entryTime) === filter);

  res.json({ history: filtered, total: filtered.length });
});

// DELETE /api/admin/history
router.delete('/history', (req, res) => {
  db.saveHistory([]);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/revenue
// ─────────────────────────────────────────────────────────────
router.get('/revenue', (req, res) => {
  const rev = db.getRevenue();
  res.json({
    today:    db.getTodayRevenue(),
    allTime:  db.getAllRevenue(),
    daily:    rev
  });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/sessions  — all active parked vehicles
// ─────────────────────────────────────────────────────────────
router.get('/sessions', (req, res) => {
  const sessions = db.getSessions();
  res.json({ sessions, count: Object.keys(sessions).length });
});

// ─────────────────────────────────────────────────────────────
//  DELETE /api/admin/bookings/:slot  — cancel/remove a booking
// ─────────────────────────────────────────────────────────────
router.delete('/bookings/:slot', (req, res) => {
  const { slot } = req.params;
  const slots = db.getSlots();
  const sessions = db.getSessions();

  if (!slots[slot]) {
    return res.status(404).json({ error: `Slot ${slot} does not exist` });
  }

  if (slots[slot].status !== 'occupied') {
    return res.status(400).json({ error: `Slot ${slot} is not currently occupied` });
  }

  // Remove from slots
  slots[slot] = { status: 'available', plate: null, qr: null };
  db.saveSlots(slots);

  // Remove from sessions if exists
  if (sessions[slot]) {
    delete sessions[slot];
    db.saveSessions(sessions);
  }

  // Add to history as cancelled
  const cancelledBooking = {
    slot,
    name: 'Cancelled by Admin',
    plate: 'N/A',
    phone: 'N/A',
    vtype: 'N/A',
    entryTime: new Date().toISOString(),
    status: 'cancelled',
    fee: 0,
    exitTime: new Date().toISOString(),
    code: `CANCELLED_${slot}_${Date.now()}`
  };
  db.addHistory(cancelledBooking);

  // Log the action
  db.addLog('admin', `Admin cancelled booking for slot ${slot}`);

  res.json({ success: true, message: `Booking for slot ${slot} has been cancelled` });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/admin/booking-details/:slot  — get detailed booking info
// ─────────────────────────────────────────────────────────────
router.get('/booking-details/:slot', (req, res) => {
  const { slot } = req.params;
  const slots = db.getSlots();
  const sessions = db.getSessions();
  const history = db.getHistory();

  if (!slots[slot]) {
    return res.status(404).json({ error: `Slot ${slot} does not exist` });
  }

  const slotData = slots[slot];
  // Find session by slot property (sessions are keyed by QR code)
  let sessionData = null;
  for (const s of Object.values(sessions)) {
    if (s.slot === slot) {
      sessionData = s;
      break;
    }
  }

  const bookingDetails = {
    slot,
    status: slotData.status,
    currentBooking: null,
    history: []
  };

  if (slotData.status === 'occupied' && sessionData) {
    bookingDetails.currentBooking = {
      name: sessionData.name,
      plate: sessionData.plate,
      phone: sessionData.phone,
      vtype: sessionData.vtype,
      entryTime: sessionData.entryTime,
      qr: sessionData.qr
    };
  }

  // Get booking history for this slot
  bookingDetails.history = history.filter(h => h.slot === slot).slice(0, 10); // Last 10 bookings

  res.json(bookingDetails);
});

module.exports = router;
