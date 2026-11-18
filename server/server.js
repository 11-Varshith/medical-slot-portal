// Medical Appointment Booking Portal - Express REST API with a JSON-file datastore (no MongoDB).
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.DB_FILE || path.join(__dirname, 'data.json');
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PORT = process.env.PORT || 5000;

// ---------- Datastore ----------
// Reads/writes are synchronous, so a booking check + insert can never interleave
// with another request. That is what guarantees no double booking.
let db = fs.existsSync(FILE)
  ? JSON.parse(fs.readFileSync(FILE, 'utf8'))
  : { patients: [], doctors: [], appointments: [], seq: 1000 };
db.passwordResets ||= [];
const save = () => {
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2));
  fs.renameSync(FILE + '.tmp', FILE);
};

// ---------- Helpers ----------
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const at = (a) => new Date(`${a.date}T${a.time}:00`);
const active = (a) => a.status === 'Pending' || a.status === 'Confirmed';
const isUpcoming = (a) => active(a) && at(a) > new Date();
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const safe = ({ passwordHash, ...rest }) => rest;
const publicDoctor = ({ passwordHash, email, phone, ...rest }) => rest;
const byTime = (a, b) => at(a) - at(b);

function docProfile(b) {
  const sd = Number(b.slotDuration);
  return {
    specialization: str(b.specialization),
    qualification: str(b.qualification),
    experience: Math.max(0, Number(b.experience) || 0),
    consultationFee: Math.max(0, Number(b.consultationFee) || 0),
    availableDays: (Array.isArray(b.availableDays) ? b.availableDays : []).filter((d) => DAYS.includes(d)),
    availableTime: { start: b.availableTime?.start || '10:00', end: b.availableTime?.end || '13:00' },
    slotDuration: [15, 20, 30, 45, 60].includes(sd) ? sd : 30,
  };
}

function validate(b, role, isUpdate) {
  if (str(b.name).length < 2) return 'Enter your full name.';
  if (!/^\+?[\d\s-]{7,15}$/.test(str(b.phone))) return 'Enter a valid phone number.';
  if (!isUpdate) {
    if (!/^\S+@\S+\.\S+$/.test(str(b.email))) return 'Enter a valid email address.';
    if (typeof b.password !== 'string' || b.password.length < 6) return 'Password must be at least 6 characters.';
  }
  if (role === 'patient') {
    const age = Number(b.age);
    if (b.age === '' || b.age == null || !(age >= 0 && age <= 120)) return 'Enter a valid age.';
    if (!['Male', 'Female', 'Other'].includes(b.gender)) return 'Select a gender.';
  } else {
    const p = docProfile(b);
    if (!p.specialization) return 'Enter your specialization.';
    if (!p.qualification) return 'Enter your qualification.';
    if (!p.availableDays.length) return 'Select at least one available day.';
    if (!/^\d{2}:\d{2}$/.test(p.availableTime.start) || !/^\d{2}:\d{2}$/.test(p.availableTime.end) ||
        toMin(p.availableTime.end) - toMin(p.availableTime.start) < p.slotDuration)
      return 'End time must be after start time by at least one slot.';
  }
  return null;
}

function slotsFor(doc, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d) || !doc.availableDays.includes(DAYS[d.getDay()])) return [];
  const { start, end } = doc.availableTime;
  const booked = new Set(db.appointments.filter((a) => a.doctorId === doc.id && a.date === date && active(a)).map((a) => a.time));
  const out = [];
  for (let m = toMin(start); m + doc.slotDuration <= toMin(end); m += doc.slotDuration) {
    const time = fromMin(m);
    out.push({ time, available: !booked.has(time) && new Date(`${date}T${time}:00`) > new Date() });
  }
  return out;
}

// ---------- Auth ----------
const sign = (u) => jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '7d' });
const auth = (role) => (req, res, next) => {
  try {
    const p = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    if (role && p.role !== role) return res.status(403).json({ error: 'You do not have access to this.' });
    req.user = p;
    next();
  } catch {
    res.status(401).json({ error: 'Please log in to continue.' });
  }
};
const collection = (role) => (role === 'doctor' ? db.doctors : db.patients);
const findUser = (role, id) => collection(role).find((u) => u.id === id);

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

const resetMailer = process.env.SMTP_HOST
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  })
  : null;
const resetFrom = process.env.SMTP_FROM || process.env.SMTP_USER;
const resetUrlFor = (req, token, role) => {
  const origin = req.get('origin');
  const localOrigin = origin && /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin)
    ? origin
    : null;
  const baseUrl = process.env.APP_URL || localOrigin || `${req.protocol}://${req.get('host')}`;
  const url = new URL('/reset-password', baseUrl);
  url.searchParams.set('token', token);
  url.searchParams.set('role', role);
  return url.toString();
};

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email, role } = req.body || {};
  const normalizedEmail = str(email).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || !['patient', 'doctor'].includes(role))
    return res.status(400).json({ error: 'Enter a valid email address and account type.' });
  if (process.env.NODE_ENV === 'production' && (!resetMailer || !resetFrom || !process.env.APP_URL))
    return res.status(503).json({ error: 'Password recovery is not configured. Please contact support.' });
  if (resetMailer && !resetFrom)
    return res.status(503).json({ error: 'Password recovery email sender is not configured.' });

  const user = collection(role).find((candidate) => candidate.email === normalizedEmail);
  const response = { message: 'If an account matches those details, password reset instructions will be sent.' };
  if (!user) return res.json(response);

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.passwordResets = db.passwordResets.filter((reset) => reset.userId !== user.id && Date.parse(reset.expiresAt) > Date.now());
  db.passwordResets.push({ userId: user.id, role, tokenHash, expiresAt });
  save();

  const resetUrl = resetUrlFor(req, token, role);
  if (resetMailer) {
    try {
      await resetMailer.sendMail({
        from: resetFrom,
        to: user.email,
        subject: 'Reset your CareSlot password',
        text: `Use this link within 30 minutes to reset your CareSlot password: ${resetUrl}`,
        html: `<p>We received a request to reset your CareSlot password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
      });
    } catch (error) {
      db.passwordResets = db.passwordResets.filter((reset) => reset.tokenHash !== tokenHash);
      save();
      console.error('Password reset email delivery failed:', error);
      return res.status(503).json({ error: 'We could not send the reset email. Please try again later.' });
    }
  } else if (process.env.NODE_ENV !== 'production') {
    response.resetUrl = resetUrl;
  } else {
    console.error('Password recovery requires SMTP_HOST in production.');
    return res.status(503).json({ error: 'Password recovery is not configured. Please contact support.' });
  }
  res.json(response);
});

app.post('/api/auth/reset-password', (req, res) => {
  const { token, role, password } = req.body || {};
  if (!['patient', 'doctor'].includes(role) || typeof token !== 'string' || !/^[a-f\d]{64}$/i.test(token))
    return res.status(400).json({ error: 'This password reset link is invalid or expired. Request a new one.' });
  if (typeof password !== 'string' || password.length < 8)
    return res.status(400).json({ error: 'Choose a password with at least 8 characters.' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = db.passwordResets.find((candidate) =>
    candidate.role === role && candidate.tokenHash === tokenHash && Date.parse(candidate.expiresAt) > Date.now());
  if (!reset) {
    db.passwordResets = db.passwordResets.filter((candidate) => Date.parse(candidate.expiresAt) > Date.now());
    save();
    return res.status(400).json({ error: 'This password reset link is invalid or expired. Request a new one.' });
  }

  const user = findUser(role, reset.userId);
  if (!user) {
    db.passwordResets = db.passwordResets.filter((candidate) => candidate.tokenHash !== tokenHash);
    save();
    return res.status(400).json({ error: 'This password reset link is invalid or expired. Request a new one.' });
  }
  user.passwordHash = bcrypt.hashSync(password, 10);
  db.passwordResets = db.passwordResets.filter((candidate) => candidate.userId !== user.id);
  save();
  res.json({ message: 'Your password has been reset. You can now log in with your new password.' });
});

app.post('/api/auth/register', (req, res) => {
  const b = req.body || {};
  const role = b.role === 'doctor' ? 'doctor' : 'patient';
  const err = validate(b, role, false);
  if (err) return res.status(400).json({ error: err });
  const email = str(b.email).toLowerCase();
  if (collection(role).some((u) => u.email === email)) return res.status(409).json({ error: 'An account with this email already exists.' });
  const base = { id: crypto.randomUUID(), role, name: str(b.name), email, phone: str(b.phone), passwordHash: bcrypt.hashSync(b.password, 10) };
  const user = role === 'patient'
    ? { ...base, age: Number(b.age), gender: b.gender, address: str(b.address) }
    : { ...base, ...docProfile(b) };
  collection(role).push(user);
  save();
  res.status(201).json({ token: sign(user), user: safe(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password, role } = req.body || {};
  const r = role === 'doctor' ? 'doctor' : 'patient';
  const user = collection(r).find((u) => u.email === str(email).toLowerCase());
  if (!user || !bcrypt.compareSync(String(password || ''), user.passwordHash))
    return res.status(401).json({ error: 'Incorrect email or password.' });
  res.json({ token: sign(user), user: safe(user) });
});

// ---------- Profile (both roles) ----------
app.get('/api/me', auth(), (req, res) => {
  const u = findUser(req.user.role, req.user.id);
  u ? res.json(safe(u)) : res.status(404).json({ error: 'Account not found.' });
});

app.put('/api/me', auth(), (req, res) => {
  const u = findUser(req.user.role, req.user.id);
  if (!u) return res.status(404).json({ error: 'Account not found.' });
  const b = req.body || {};
  const err = validate(b, u.role, true);
  if (err) return res.status(400).json({ error: err });
  Object.assign(u, { name: str(b.name), phone: str(b.phone) });
  if (u.role === 'patient') Object.assign(u, { age: Number(b.age), gender: b.gender, address: str(b.address) });
  else Object.assign(u, docProfile(b));
  db.appointments.forEach((a) => {
    if (u.role === 'doctor' && a.doctorId === u.id) a.doctorName = u.name;
    if (u.role === 'patient' && a.patientId === u.id) a.patientName = u.name;
  });
  save();
  res.json(safe(u));
});

// ---------- Doctors ----------
app.get('/api/doctors/specializations', auth(), (_req, res) => {
  res.json([...new Set(db.doctors.map((d) => d.specialization))].sort());
});

app.get('/api/doctors', auth(), (req, res) => {
  const { name = '', specialization = '', minExperience = '', day = '' } = req.query;
  const list = db.doctors.filter((d) =>
    (!name || d.name.toLowerCase().includes(String(name).toLowerCase())) &&
    (!specialization || d.specialization === specialization) &&
    (!minExperience || d.experience >= Number(minExperience)) &&
    (!day || d.availableDays.includes(day)));
  res.json(list.map(publicDoctor));
});

app.get('/api/doctors/:id', auth(), (req, res) => {
  const d = db.doctors.find((x) => x.id === req.params.id);
  d ? res.json(publicDoctor(d)) : res.status(404).json({ error: 'Doctor not found.' });
});

app.get('/api/doctors/:id/slots', auth(), (req, res) => {
  const d = db.doctors.find((x) => x.id === req.params.id);
  if (!d) return res.status(404).json({ error: 'Doctor not found.' });
  res.json(slotsFor(d, String(req.query.date || '')));
});

// ---------- Patient appointments ----------
const withDoctor = (a) => {
  const d = db.doctors.find((x) => x.id === a.doctorId);
  return { ...a, specialization: d?.specialization, consultationFee: d?.consultationFee };
};
const withPatient = (a) => {
  const p = db.patients.find((x) => x.id === a.patientId);
  return { ...a, patient: p ? { name: p.name, age: p.age, gender: p.gender, phone: p.phone } : null };
};

app.post('/api/appointments', auth('patient'), (req, res) => {
  const { doctorId, date, time } = req.body || {};
  const reason = str(req.body?.reason) || 'General Consultation';
  const doc = db.doctors.find((d) => d.id === doctorId);
  if (!doc) return res.status(404).json({ error: 'Doctor not found.' });
  const slot = slotsFor(doc, String(date)).find((s) => s.time === time);
  if (!slot) return res.status(400).json({ error: "That time is not in the doctor's schedule." });
  if (!slot.available) return res.status(409).json({ error: 'This slot is no longer available. Pick another time.' });
  if (db.appointments.some((a) => a.patientId === req.user.id && a.date === date && a.time === time && active(a)))
    return res.status(409).json({ error: 'You already have an appointment at this time.' });
  const patient = findUser('patient', req.user.id);
  const appt = {
    appointmentId: `APT${++db.seq}`, id: crypto.randomUUID(),
    patientId: patient.id, doctorId: doc.id, doctorName: doc.name, patientName: patient.name,
    date, time, reason: reason.slice(0, 300), status: 'Confirmed', createdAt: new Date().toISOString(),
  };
  db.appointments.push(appt);
  save();
  res.status(201).json(withDoctor(appt));
});

app.get('/api/appointments/my', auth('patient'), (req, res) => {
  const mine = db.appointments.filter((a) => a.patientId === req.user.id).map(withDoctor);
  res.json({
    upcoming: mine.filter(isUpcoming).sort(byTime),
    previous: mine.filter((a) => !isUpcoming(a)).sort((a, b) => byTime(b, a)),
  });
});

app.patch('/api/appointments/:id/cancel', auth('patient'), (req, res) => {
  const a = db.appointments.find((x) => x.id === req.params.id && x.patientId === req.user.id);
  if (!a) return res.status(404).json({ error: 'Appointment not found.' });
  if (!isUpcoming(a)) return res.status(400).json({ error: 'Only upcoming appointments can be cancelled.' });
  a.status = 'Cancelled';
  save();
  res.json(withDoctor(a));
});

// ---------- Doctor side ----------
app.get('/api/doctor/appointments', auth('doctor'), (req, res) => {
  const f = req.query.filter || 'all';
  const mine = db.appointments.filter((a) => a.doctorId === req.user.id);
  const pick = { today: (a) => a.date === today(), upcoming: isUpcoming, past: (a) => !isUpcoming(a) }[f] || (() => true);
  res.json(mine.filter(pick).sort(f === 'past' ? (a, b) => byTime(b, a) : byTime).map(withPatient));
});

const NEXT = { Pending: ['Confirmed', 'Cancelled'], Confirmed: ['Completed', 'Cancelled'] };
app.patch('/api/doctor/appointments/:id/status', auth('doctor'), (req, res) => {
  const a = db.appointments.find((x) => x.id === req.params.id && x.doctorId === req.user.id);
  if (!a) return res.status(404).json({ error: 'Appointment not found.' });
  const { status } = req.body || {};
  if (!(NEXT[a.status] || []).includes(status)) return res.status(400).json({ error: `Cannot change ${a.status} to ${status}.` });
  if (status === 'Completed' && a.date > today()) return res.status(400).json({ error: 'A future appointment cannot be marked completed.' });
  a.status = status;
  save();
  res.json(withPatient(a));
});

// Only the patient fields needed for appointment management are exposed.
app.get('/api/doctor/patients', auth('doctor'), (req, res) => {
  const map = new Map();
  db.appointments.filter((a) => a.doctorId === req.user.id).sort(byTime).forEach((a) => {
    const p = db.patients.find((x) => x.id === a.patientId);
    if (!p) return;
    if (!map.has(p.id)) map.set(p.id, { id: p.id, name: p.name, age: p.age, gender: p.gender, phone: p.phone, appointments: [] });
    map.get(p.id).appointments.push({ appointmentId: a.appointmentId, date: a.date, time: a.time, status: a.status });
  });
  res.json([...map.values()]);
});

// ---------- Dashboards ----------
app.get('/api/dashboard', auth(), (req, res) => {
  if (req.user.role === 'patient') {
    const mine = db.appointments.filter((a) => a.patientId === req.user.id);
    return res.json({
      total: mine.length,
      upcoming: mine.filter(isUpcoming).length,
      previous: mine.filter((a) => !isUpcoming(a) && a.status !== 'Cancelled').length,
      cancelled: mine.filter((a) => a.status === 'Cancelled').length,
    });
  }
  const mine = db.appointments.filter((a) => a.doctorId === req.user.id);
  res.json({
    today: mine.filter((a) => a.date === today() && a.status !== 'Cancelled').length,
    upcoming: mine.filter(isUpcoming).length,
    patients: new Set(mine.map((a) => a.patientId)).size,
    completed: mine.filter((a) => a.status === 'Completed').length,
  });
});

// ---------- Seed demo data on first run ----------
if (!db.doctors.length) {
  const hash = bcrypt.hashSync('doctor123', 10);
  const mk = (name, specialization, qualification, experience, consultationFee, availableDays, start, end) => ({
    id: crypto.randomUUID(), role: 'doctor', name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@demo.com`,
    phone: '9876543210', passwordHash: hash, specialization, qualification, experience, consultationFee,
    availableDays, availableTime: { start, end }, slotDuration: 30,
  });
  db.doctors.push(
    mk('Dr. Rahul Sharma', 'Cardiologist', 'MBBS, MD', 10, 800, ['Monday', 'Wednesday', 'Friday'], '10:00', '13:00'),
    mk('Dr. Anita Reddy', 'Dermatologist', 'MBBS, DVD', 7, 600, ['Tuesday', 'Thursday', 'Saturday'], '09:00', '12:00'),
    mk('Dr. Suresh Kumar', 'Orthopedic Surgeon', 'MBBS, MS Ortho', 15, 1000, ['Monday', 'Tuesday', 'Thursday'], '14:00', '18:00'),
    mk('Dr. Priya Nair', 'Pediatrician', 'MBBS, DCH', 5, 500, ['Monday', 'Wednesday', 'Friday', 'Saturday'], '10:00', '14:00'),
    mk('Dr. Imran Khan', 'General Physician', 'MBBS', 3, 300, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], '09:00', '17:00'),
  );
  db.patients.push({
    id: crypto.randomUUID(), role: 'patient', name: 'Varshitha', email: 'patient@demo.com', phone: '9123456780',
    passwordHash: bcrypt.hashSync('patient123', 10), age: 24, gender: 'Female', address: 'Warangal, Telangana',
  });
  save();
  console.log('Seeded demo data.');
}

// ---------- Serve built React app ----------
const dist = path.join(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

app.listen(PORT, () => console.log(`Portal running on http://localhost:${PORT}`));
