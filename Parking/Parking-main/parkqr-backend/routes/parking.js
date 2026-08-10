const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const RATES      = { car: 100, bike: 50, truck: 150 };
const RATE_LABEL = { car: '₹100/hr', bike: '₹50/hr', truck: '₹150/hr' };

function makeCode(plate, slot, ts) {
  return Buffer.from(`PQ|${slot}|${plate}|${ts}`).toString('base64').replace(/=/g, '');
}
function calcFee(mins, vtype) {
  const hrs = mins / 60;
  return Math.max(20, Math.round(hrs * (RATES[vtype] || 100)));
}

// ─────────────────────────────────────────────────────────────
//  GET /api/parking/slots  — list all slots
// ─────────────────────────────────────────────────────────────
router.get('/slots', authMiddleware, (req, res) => {
  const slots = db.getSlots();
  res.json({ slots });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/parking/slots/available  — only free slots
// ─────────────────────────────────────────────────────────────
router.get('/slots/available', authMiddleware, (req, res) => {
  const slots = db.getSlots();
  const available = Object.entries(slots)
    .filter(([, d]) => d.status === 'available')
    .map(([id]) => id);
  res.json({ available });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/parking/ticket  — generate ticket / check-in
//  Body: { plate, name, phone, vtype, slot }
// ─────────────────────────────────────────────────────────────
router.post('/ticket', authMiddleware, (req, res) => {
  const { plate, name, phone, vtype, slot } = req.body;

  if (!plate || !name || !phone || !slot) {
    return res.status(400).json({ error: 'plate, name, phone and slot are required.' });
  }

  const slots = db.getSlots();
  if (!slots[slot]) {
    return res.status(404).json({ error: `Slot ${slot} does not exist.` });
  }
  if (slots[slot].status !== 'available') {
    return res.status(409).json({ error: `Slot ${slot} is already occupied.` });
  }

  const ts   = Date.now();
  const code = makeCode(plate.toUpperCase(), slot, ts);

  // Save session
  const sessions = db.getSessions();
  sessions[code] = { code, plate: plate.toUpperCase(), name, phone, vtype, slot, entryTime: ts, user: req.user.username };
  db.saveSessions(sessions);

  // Mark slot occupied
  slots[slot] = { status: 'occupied', plate: plate.toUpperCase(), qr: code };
  db.saveSlots(slots);

  // Booking history
  db.addHistory({ code, plate: plate.toUpperCase(), name, phone, vtype, slot, entryTime: ts, status: 'checkedin', fee: null, exitTime: null });
  db.addLog('ENTRY', `${plate.toUpperCase()} → ${slot} checked in (${name})`);

  res.status(201).json({
    code,
    slot,
    plate: plate.toUpperCase(),
    name,
    phone,
    vtype,
    rateLabel: RATE_LABEL[vtype] || '₹100/hr',
    entryTime: ts
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/parking/verify  — admin: scan/verify QR
//  Body: { code }
// ─────────────────────────────────────────────────────────────
router.post('/verify', authMiddleware, adminOnly, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'QR code is required.' });

  const sessions = db.getSessions();
  const s = sessions[code];
  if (!s) {
    db.addLog('FAIL', 'Unknown QR scanned');
    return res.status(404).json({ error: 'QR code not recognized.' });
  }

  const mins = Math.floor((Date.now() - s.entryTime) / 60000);
  const fee  = calcFee(mins, s.vtype);

  // Rotate the QR code after a successful scan for better security
  const newCode = makeCode(s.plate, s.slot, Date.now());
  const updatedSession = { ...s, code: newCode };

  delete sessions[code];
  sessions[newCode] = updatedSession;
  db.saveSessions(sessions);

  const slots = db.getSlots();
  if (slots[s.slot]) {
    slots[s.slot] = { ...slots[s.slot], qr: newCode };
    db.saveSlots(slots);
  }

  db.addLog('MATCH', `${s.plate} verified — ${s.slot} — ${Math.floor(mins / 60)}h${mins % 60}m — ₹${fee} — rotated QR`);
  res.json({
    matched: true,
    session: updatedSession,
    duration: { hours: Math.floor(mins / 60), minutes: mins % 60, totalMins: mins },
    feeDue: fee,
    newCode
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/parking/checkout  — admin: check out vehicle
//  Body: { code }
// ─────────────────────────────────────────────────────────────
router.post('/checkout', authMiddleware, adminOnly, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'QR code is required.' });

  const sessions = db.getSessions();
  const s = sessions[code];
  if (!s) return res.status(404).json({ error: 'QR not found.' });

  const exitTime = Date.now();
  const mins     = Math.floor((exitTime - s.entryTime) / 60000);
  const fee      = calcFee(mins, s.vtype);

  // Free the slot
  const slots = db.getSlots();
  if (slots[s.slot]) slots[s.slot] = { status: 'available', plate: null, qr: null };
  db.saveSlots(slots);

  // Remove session
  delete sessions[code];
  db.saveSessions(sessions);

  // Revenue
  db.addRevenue(fee);
  db.updateHistoryStatus(code, fee, exitTime);
  db.addLog('EXIT', `${s.plate} checked out — ${s.slot} freed — ${Math.floor(mins / 60)}h${mins % 60}m — ₹${fee}`);

  res.json({
    success: true,
    slot: s.slot,
    plate: s.plate,
    name: s.name,
    duration: { hours: Math.floor(mins / 60), minutes: mins % 60 },
    fee
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/parking/verify-user  — admin: scan user QR
//  Body: { qrData }
// ─────────────────────────────────────────────────────────────
router.post('/verify-user', authMiddleware, adminOnly, (req, res) => {
  const { qrData } = req.body;
  if (!qrData) return res.status(400).json({ error: 'QR data is required.' });

  try {
    const userData = JSON.parse(qrData);
    if (userData.type !== 'user') {
      return res.status(400).json({ error: 'Invalid user QR code.' });
    }

    // Verify user exists
    const users = db.getUsers();
    const user = users[userData.username];
    if (!user) {
      db.addLog('FAIL', `User QR scan failed: ${userData.username} not found`);
      return res.status(404).json({ error: 'User not found.' });
    }

    db.addLog('USER_VERIFY', `User ${userData.display} verified via QR`);
    res.json({
      verified: true,
      user: {
        username: user.username,
        display: user.display,
        email: user.email,
        phone: user.phone,
        plate: user.plate,
        vtype: user.vtype
      }
    });
  } catch (error) {
    db.addLog('FAIL', 'Invalid user QR format');
    return res.status(400).json({ error: 'Invalid QR code format.' });
  }
});

module.exports = router;
