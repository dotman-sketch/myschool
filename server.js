const express    = require('express');
const bodyParser = require('body-parser');
const fs         = require('fs');
const path       = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(bodyParser.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname)));

// ── GMAIL TRANSPORTER ────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

// ── ADMIN PASSCODES ──────────────────────────────────────────────
const codes = process.env.ADMIN_CODES
  ? process.env.ADMIN_CODES.split(',')
  : ['admin123', 'pass2026'];

// ── ENSURE DIRECTORIES EXIST ─────────────────────────────────────
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
function safeName(name) {
  return path.basename(name);
}

// ── FILE PATHS ───────────────────────────────────────────────────
const usersFile = path.join(dataDir, 'users.json');
const appsFile  = path.join(dataDir, 'applications.json');

// ── OTP STORE (in-memory) ────────────────────────────────────────
const otpStore = {};

function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

async function sendOTP(email, otp, name) {
  await transporter.sendMail({
    from: `"Life Fountain College" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'Your Life Fountain College Login Code',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:30px;background:#f9f9f9;border-radius:8px;">
        <h2 style="color:#003366;margin-bottom:6px;">Life Fountain College</h2>
        <p style="color:#555;">Hello${name ? ' ' + name : ''},</p>
        <p style="color:#555;">Your one-time login code is:</p>
        <div style="font-size:42px;font-weight:bold;letter-spacing:12px;color:#003366;text-align:center;padding:20px 0;">
          ${otp}
        </div>
        <p style="color:#555;">This code expires in <strong>10 minutes</strong> and can only be used once.</p>
        <p style="color:#999;font-size:12px;">If you did not request this, please ignore this email.</p>
        <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">
        <p style="color:#999;font-size:11px;text-align:center;">"Bedrock of Excellence" &mdash; Life Fountain College, Ago Are/Ofiki</p>
      </div>
    `
  });
}

// ── USER: REGISTER ───────────────────────────────────────────────
app.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password)
    return res.json({ success: false, error: 'Please fill in all fields.' });

  if (name.trim().length < 2)
    return res.json({ success: false, error: 'Name must be at least 2 characters.' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email))
    return res.json({ success: false, error: 'Invalid email address.' });

  if (password.length < 6)
    return res.json({ success: false, error: 'Password must be at least 6 characters.' });

  const users = readJson(usersFile);

  if (users.find(u => u.email === email.toLowerCase().trim()))
    return res.json({ success: false, error: 'An account with this email already exists.' });

  users.push({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password
  });
  writeJson(usersFile, users);

  console.log(`New user registered: ${email}`);
  res.json({ success: true });
});

// ── USER: SEND OTP (LOGIN) ───────────────────────────────────────
let otpAttempts = {};

app.post('/send-otp', async (req, res) => {
  const ip = req.ip;
  otpAttempts[ip] = (otpAttempts[ip] || 0) + 1;

  if (otpAttempts[ip] > 10)
    return res.status(429).json({ success: false, error: 'Too many requests. Please wait.' });

  const { email } = req.body || {};

  if (!email)
    return res.json({ success: false, error: 'Email is required.' });

  const users = readJson(usersFile);
  const user  = users.find(u => u.email === email.toLowerCase().trim());

  if (!user)
    return res.json({ success: false, error: 'No account found with this email.' });

  const otp     = generateOTP();
  const expires = Date.now() + 10 * 60 * 1000;

  otpStore[email.toLowerCase().trim()] = { otp, expires };

  try {
    await sendOTP(email, otp, user.name);
    console.log(`OTP sent to ${email}`);
    otpAttempts[ip] = 0;
    res.json({ success: true, name: user.name });
  } catch(err) {
    console.error('Email error:', err);
    res.json({ success: false, error: 'Failed to send email. Please try again.' });
  }
});

// ── USER: VERIFY OTP ─────────────────────────────────────────────
app.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body || {};

  if (!email || !otp)
    return res.json({ success: false, error: 'Missing email or code.' });

  const key    = email.toLowerCase().trim();
  const record = otpStore[key];

  if (!record)
    return res.json({ success: false, error: 'No code was sent to this email. Please request one.' });

  if (Date.now() > record.expires) {
    delete otpStore[key];
    return res.json({ success: false, error: 'Code has expired. Please request a new one.' });
  }

  if (record.otp !== otp.trim())
    return res.json({ success: false, error: 'Incorrect code. Please try again.' });

  delete otpStore[key]; // one-time use

  const users = readJson(usersFile);
  const user  = users.find(u => u.email === key);

  console.log(`User logged in: ${email}`);
  res.json({ success: true, name: user ? user.name : email });
});

// ── USER: FORGOT PASSWORD — SEND RESET OTP ───────────────────────
app.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};

  if (!email)
    return res.json({ success: false, error: 'Email is required.' });

  const users = readJson(usersFile);
  const user  = users.find(u => u.email === email.toLowerCase().trim());

  if (!user)
    return res.json({ success: false, error: 'No account found with this email.' });

  const otp     = generateOTP();
  const expires = Date.now() + 10 * 60 * 1000;

  otpStore['reset_' + email.toLowerCase().trim()] = { otp, expires };

  try {
    await transporter.sendMail({
      from: `"Life Fountain College" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Code - Life Fountain College',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:30px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#003366;">Password Reset</h2>
          <p style="color:#555;">Hello ${user.name},</p>
          <p style="color:#555;">Your password reset code is:</p>
          <div style="font-size:42px;font-weight:bold;letter-spacing:12px;color:#003366;text-align:center;padding:20px 0;">
            ${otp}
          </div>
          <p style="color:#555;">This code expires in <strong>10 minutes</strong>.</p>
          <p style="color:#999;font-size:12px;">If you did not request this, ignore this email.</p>
        </div>
      `
    });
    res.json({ success: true });
  } catch(err) {
    console.error('Email error:', err);
    res.json({ success: false, error: 'Failed to send email.' });
  }
});

// ── USER: VERIFY RESET OTP + SET NEW PASSWORD ────────────────────
app.post('/reset-password', (req, res) => {
  const { email, otp, newPassword } = req.body || {};

  if (!email || !otp || !newPassword)
    return res.json({ success: false, error: 'Missing fields.' });

  if (newPassword.length < 6)
    return res.json({ success: false, error: 'Password must be at least 6 characters.' });

  const key    = 'reset_' + email.toLowerCase().trim();
  const record = otpStore[key];

  if (!record)
    return res.json({ success: false, error: 'No reset code found. Please request one.' });

  if (Date.now() > record.expires) {
    delete otpStore[key];
    return res.json({ success: false, error: 'Code has expired. Please request a new one.' });
  }

  if (record.otp !== otp.trim())
    return res.json({ success: false, error: 'Incorrect code.' });

  delete otpStore[key];

  const users = readJson(usersFile);
  const idx   = users.findIndex(u => u.email === email.toLowerCase().trim());

  if (idx === -1)
    return res.json({ success: false, error: 'Account not found.' });

  users[idx].password = newPassword;
  writeJson(usersFile, users);

  console.log(`Password reset for: ${email}`);
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