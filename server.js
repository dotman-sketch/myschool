const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(bodyParser.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname)));

// ── ADMIN PASSCODES ──────────────────────────────────────────────
const codes = process.env.ADMIN_CODES
  ? process.env.ADMIN_CODES.split(',')
  : ['admin123', 'pass2026'];

// ── ENSURE DATA AND EDITS DIRECTORIES EXIST ──────────────────────
const dataDir  = path.join(__dirname, 'data');
const editsDir = path.join(__dirname, 'edits');
if (!fs.existsSync(dataDir))  fs.mkdirSync(dataDir);
if (!fs.existsSync(editsDir)) fs.mkdirSync(editsDir);

// ── FILE HELPERS ─────────────────────────────────────────────────
function readJson(file) {
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch(e) { console.error('JSON parse error:', e); }
  }
  return [];
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── SECURITY HELPER ──────────────────────────────────────────────
// Prevents path traversal attacks like ../../server.js
function safeName(name) {
  return path.basename(name);
}

// ── FILE PATHS ───────────────────────────────────────────────────
const usersFile = path.join(dataDir, 'users.json');
const appsFile  = path.join(dataDir, 'applications.json');

// ── USER: REGISTER ───────────────────────────────────────────────
app.post('/register', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password)
    return res.json({ success: false, error: 'Missing username or password.' });

  if (username.trim().length < 3)
    return res.json({ success: false, error: 'Username must be at least 3 characters.' });

  if (password.length < 6)
    return res.json({ success: false, error: 'Password must be at least 6 characters.' });

  const users = readJson(usersFile);

  if (users.find(u => u.username === username.trim()))
    return res.json({ success: false, error: 'Username already taken.' });

  users.push({ username: username.trim(), password });
  writeJson(usersFile, users);

  console.log(`New user registered: ${username}`);
  res.json({ success: true });
});

// ── USER: LOGIN ──────────────────────────────────────────────────
let loginAttempts = {};

app.post('/login', (req, res) => {
  const ip = req.ip;
  loginAttempts[ip] = (loginAttempts[ip] || 0) + 1;

  if (loginAttempts[ip] > 10)
    return res.status(429).json({ success: false, error: 'Too many attempts. Please wait.' });

  const { username, password } = req.body || {};

  if (!username || !password)
    return res.json({ success: false, error: 'Missing username or password.' });

  const users = readJson(usersFile);
  const user = users.find(
    u => u.username === username.trim() && u.password === password
  );

  if (user) {
    loginAttempts[ip] = 0;
    console.log(`User logged in: ${username}`);
    return res.json({ success: true });
  }

  res.json({ success: false, error: 'Invalid username or password.' });
});

// ── USER: RESET PASSWORD ─────────────────────────────────────────
app.post('/reset-password', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password)
    return res.json({ success: false, error: 'Missing fields.' });

  if (password.length < 6)
    return res.json({ success: false, error: 'Password must be at least 6 characters.' });

  const users = readJson(usersFile);
  const idx = users.findIndex(u => u.username === username.trim());

  if (idx === -1)
    return res.json({ success: false, error: 'Username not found.' });

  users[idx].password = password;
  writeJson(usersFile, users);

  console.log(`Password reset for: ${username}`);
  res.json({ success: true });
});

// ── ADMIN: LOGIN ─────────────────────────────────────────────────
let adminAttempts = {};

app.post('/admin/login', (req, res) => {
  const ip = req.ip;
  adminAttempts[ip] = (adminAttempts[ip] || 0) + 1;

  if (adminAttempts[ip] > 10)
    return res.status(429).json({ success: false, error: 'Too many attempts.' });

  const { passcode } = req.body || {};

  if (codes.includes(passcode)) {
    adminAttempts[ip] = 0;
    return res.json({ success: true });
  }

  res.json({ success: false });
});

// ── APPLICATIONS ─────────────────────────────────────────────────
app.get('/applications', (req, res) => {
  res.json(readJson(appsFile));
});

app.post('/applications', (req, res) => {
  const apps = readJson(appsFile);
  apps.push({ ...req.body, date: new Date().toISOString() });
  writeJson(appsFile, apps);
  res.json({ success: true });
});

// ── PAGE EDITING ─────────────────────────────────────────────────
app.get('/page/:name/edited', (req, res) => {
  const file = path.join(editsDir, safeName(req.params.name));
  if (fs.existsSync(file)) return res.sendFile(file);
  res.status(404).send('');
});

app.post('/page/:name', (req, res) => {
  const file = path.join(editsDir, safeName(req.params.name));
  fs.writeFileSync(file, req.body.content || '');
  res.json({ success: true });
});

// ── START SERVER ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));