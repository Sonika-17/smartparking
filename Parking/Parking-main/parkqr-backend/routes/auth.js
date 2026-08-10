const express  = require('express');
const bcrypt   = require('bcryptjs');
const router   = express.Router();
const db       = require('../db');
const { signToken } = require('../middleware/auth');

// ── Built-in admin account ────────────────────────────────────
const ADMIN = {
  username: 'admin',
  password: 'admin123',   // plain — compared directly (no hash for built-in)
  role: 'admin',
  display: 'Admin',
  email: 'admin@parkqr.com',
  phone: ''
};

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/login
//  Body: { username, password, role }
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username = '', password = '', role = 'user' } = req.body;
  const raw   = username.trim();
  const rawLC = raw.toLowerCase();

  if (!raw || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  // 1. Check built-in admin
  if (rawLC === ADMIN.username) {
    if (password !== ADMIN.password) {
      return res.status(401).json({ error: 'Wrong password for admin account.' });
    }
    const token = signToken({ username: ADMIN.username, role: 'admin', display: ADMIN.display });
    db.addLog('LOGIN', `Admin signed in`);
    return res.json({
      token,
      user: { username: ADMIN.username, role: 'admin', display: ADMIN.display, email: ADMIN.email, phone: '' }
    });
  }

  // 2. Check registered users (by username or email)
  const users = db.getUsers();
  let account = null;
  let uname   = null;

  // Try username
  const uKey = Object.keys(users).find(k => k.toLowerCase() === rawLC);
  if (uKey) { uname = uKey; account = users[uKey]; }

  // Try email
  if (!account) {
    const found = Object.entries(users).find(([, u]) => u.email.toLowerCase() === rawLC);
    if (found) { uname = found[0]; account = found[1]; }
  }

  if (!account) {
    return res.status(401).json({ error: 'No account found. Please register first.' });
  }

  const match = await bcrypt.compare(password, account.password);
  if (!match) {
    return res.status(401).json({ error: 'Wrong password. Please try again.' });
  }

  const token = signToken({ username: uname, role: 'user', display: account.display });
  db.addLog('LOGIN', `${account.display} (@${uname}) signed in`);
  return res.json({
    token,
    user: {
      username: uname,
      role: 'user',
      display: account.display,
      email: account.email,
      phone: account.phone,
      plate: account.plate,
      vtype: account.vtype
    }
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/register
//  Body: { fname, lname, email, phone, username, plate, vtype, password }
// ─────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { fname, lname, email, phone, username, plate = '', vtype = 'car', password } = req.body;

  // Basic validation
  const errors = {};
  if (!fname?.trim())             errors.fname = 'First name is required';
  if (!lname?.trim())             errors.lname = 'Last name is required';
  if (!email?.trim() || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) errors.email = 'Enter a valid email';
  if (!phone?.trim())             errors.phone = 'Phone number is required';
  if (!username?.trim() || username.trim().length < 3) errors.uname = 'Username min 3 characters';
  if (!password || password.length < 6) errors.pass = 'Password min 6 characters';

  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Validation failed', errors });
  }

  const uname  = username.trim().toLowerCase();
  const emailN = email.trim().toLowerCase();
  const users  = db.getUsers();

  // Duplicate checks
  if (uname === 'admin' || users[uname]) {
    return res.status(409).json({ error: 'Username already taken', errors: { uname: 'Username already taken' } });
  }
  if (Object.values(users).some(u => u.email.toLowerCase() === emailN)) {
    return res.status(409).json({ error: 'Email already registered', errors: { email: 'Email already registered' } });
  }

  const hashed = await bcrypt.hash(password, 10);
  users[uname] = {
    username: uname,
    password: hashed,
    role: 'user',
    fname: fname.trim(),
    lname: lname.trim(),
    email: emailN,
    phone: phone.trim(),
    plate: plate.trim().toUpperCase(),
    vtype,
    display: fname.trim() + ' ' + lname.trim(),
    registeredAt: new Date().toLocaleString('en-IN')
  };
  db.saveUsers(users);
  db.addLog('REG', `New user: ${fname} ${lname} (@${uname}, ${emailN})`);

  const token = signToken({ username: uname, role: 'user', display: users[uname].display });
  return res.status(201).json({
    token,
    user: {
      username: uname,
      role: 'user',
      display: users[uname].display,
      email: emailN,
      phone: phone.trim(),
      plate: plate.trim().toUpperCase(),
      vtype
    }
  });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/auth/check-username?u=john
// ─────────────────────────────────────────────────────────────
router.get('/check-username', (req, res) => {
  const u     = (req.query.u || '').toLowerCase().trim();
  const users = db.getUsers();
  const taken = u === 'admin' || !!users[u];
  res.json({ taken });
});

module.exports = router;
