const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const REMINDER_MINUTES_BEFORE = Number(process.env.REMINDER_MINUTES_BEFORE || 180);
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Dubai';
const ROLLING_SLOT_DAYS = Number(process.env.ROLLING_SLOT_DAYS || 30);
const BOOKING_START_HOUR = Number(process.env.BOOKING_START_HOUR || 17);
const BOOKING_END_HOUR = Number(process.env.BOOKING_END_HOUR || 22);
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || '';
const ADMIN_WHATSAPP_TO = process.env.ADMIN_WHATSAPP_TO || '';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const sessions = new Map();
let reminderLoopBusy = false;

function readDb() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const db = JSON.parse(raw);

  if (!Array.isArray(db.services)) db.services = [];
  if (!Array.isArray(db.students)) db.students = [];
  if (!Array.isArray(db.slots)) db.slots = [];
  if (!Array.isArray(db.bookings)) db.bookings = [];
  if (!Array.isArray(db.payments)) db.payments = [];

  return db;
}

function writeDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function sendJsonWithHeaders(res, statusCode, payload, headers) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const typeMap = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
  };

  const contentType = typeMap[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paymentReceiptPath(paymentId) {
  return `/receipt/${paymentId}`;
}

function paymentReceiptHtml(payment, student) {
  const studentName = escapeHtml(student?.name || 'Unknown student');
  const studentEmail = escapeHtml(student?.email || 'N/A');
  const studentContact = escapeHtml(student?.contactNo || 'N/A');
  const amount = Number(payment.amount || 0).toFixed(2);
  const lessonsPurchased = Number(payment.lessonsPurchased || 0);
  const method = escapeHtml(payment.method || 'N/A');
  const note = escapeHtml(payment.note || 'N/A');
  const paymentDate = escapeHtml(new Date(payment.createdAt).toLocaleString());
  const receiptNo = `RCPT-${String(payment.id).padStart(6, '0')}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Payment Receipt #${escapeHtml(String(payment.id))}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f3f4f6; color: #111827; }
    .wrap { max-width: 780px; margin: 24px auto; padding: 0 16px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.05); }
    h1 { margin: 0 0 8px; font-size: 1.45rem; }
    .muted { color: #6b7280; margin: 0 0 20px; }
    .badge { display: inline-block; font-size: 0.78rem; background: #ecfeff; color: #155e75; border: 1px solid #a5f3fc; border-radius: 999px; padding: 4px 10px; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-top: 16px; }
    .item { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
    .k { display:block; font-size: 0.78rem; color: #6b7280; margin-bottom: 4px; }
    .v { font-weight: 600; word-break: break-word; }
    .amount { font-size: 1.5rem; color: #065f46; }
    .actions { margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
    .btn { border: 1px solid #d1d5db; background: #fff; color: #111827; border-radius: 8px; padding: 9px 14px; font-weight: 600; cursor: pointer; }
    .btn:hover { background: #f3f4f6; }
    @media (max-width: 680px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <span class="badge">Online Receipt</span>
      <h1>Tennis Booking Payment Receipt</h1>
      <p class="muted">Receipt No: <strong>${escapeHtml(receiptNo)}</strong></p>
      <div class="grid">
        <div class="item"><span class="k">Student</span><span class="v">${studentName}</span></div>
        <div class="item"><span class="k">Email</span><span class="v">${studentEmail}</span></div>
        <div class="item"><span class="k">Contact</span><span class="v">${studentContact}</span></div>
        <div class="item"><span class="k">Payment Date</span><span class="v">${paymentDate}</span></div>
        <div class="item"><span class="k">Amount</span><span class="v amount">AED ${escapeHtml(amount)}</span></div>
        <div class="item"><span class="k">Lessons Purchased</span><span class="v">${escapeHtml(String(lessonsPurchased))}</span></div>
        <div class="item"><span class="k">Payment Method</span><span class="v">${method}</span></div>
        <div class="item"><span class="k">Note</span><span class="v">${note}</span></div>
      </div>
      <div class="actions">
        <button class="btn" onclick="window.print()">Print</button>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const parsed = {};

  for (const segment of raw.split(';')) {
    const [key, ...rest] = segment.trim().split('=');
    if (!key || rest.length === 0) {
      continue;
    }
    try {
      parsed[key] = decodeURIComponent(rest.join('='));
    } catch {
      parsed[key] = rest.join('=');
    }
  }

  return parsed;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.session;
  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

function createSession(role) {
  const id = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const session = { id, role, expiresAt };
  sessions.set(id, session);
  return session;
}

function clearSession(req) {
  const cookies = parseCookies(req);
  if (cookies.session) {
    sessions.delete(cookies.session);
  }
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session || session.role !== 'admin') {
    sendJson(res, 401, { error: 'Admin authentication required' });
    return null;
  }

  return session;
}

function nextId(items) {
  return items.length === 0 ? 1 : Math.max(...items.map((item) => item.id)) + 1;
}

function calculateStudentSummary(db, studentId) {
  const totalLessonsPurchased = db.payments
    .filter((item) => item.studentId === studentId)
    .reduce((sum, item) => sum + Number(item.lessonsPurchased || 0), 0);

  const totalPaid = db.payments
    .filter((item) => item.studentId === studentId)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const totalLessonsBooked = db.bookings.filter((item) => item.studentId === studentId).length;
  const lessonsRemaining = totalLessonsPurchased - totalLessonsBooked;

  return {
    totalLessonsPurchased,
    totalLessonsBooked,
    lessonsRemaining,
    totalPaid: Number(totalPaid.toFixed(2))
  };
}

function timeZoneDateKeys(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const get = (type) => parts.find((item) => item.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  if (!year || !month || !day) {
    return null;
  }

  return {
    dayKey: `${year}-${month}-${day}`,
    monthKey: `${year}-${month}`
  };
}

function calculatePaymentSummary(db) {
  const nowKeys = timeZoneDateKeys(new Date().toISOString());
  const summary = {
    totalPayment: 0,
    dailySale: 0,
    monthlySale: 0
  };

  for (const payment of db.payments) {
    const amount = Number(payment.amount || 0);
    if (!Number.isFinite(amount)) {
      continue;
    }

    summary.totalPayment += amount;
    const paymentKeys = timeZoneDateKeys(payment.createdAt);
    if (!paymentKeys || !nowKeys) {
      continue;
    }

    if (paymentKeys.dayKey === nowKeys.dayKey) {
      summary.dailySale += amount;
    }
    if (paymentKeys.monthKey === nowKeys.monthKey) {
      summary.monthlySale += amount;
    }
  }

  summary.totalPayment = Number(summary.totalPayment.toFixed(2));
  summary.dailySale = Number(summary.dailySale.toFixed(2));
  summary.monthlySale = Number(summary.monthlySale.toFixed(2));
  return summary;
}

function slotKey(serviceId, startIso) {
  return `${serviceId}|${startIso}`;
}

function getDatePartsInTimeZone(dateInput, timeZone) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = (type) => parts.find((item) => item.type === type)?.value;

  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  return { year, month, day };
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit'
  }).formatToParts(date);
  const tzName = parts.find((item) => item.type === 'timeZoneName')?.value || '';
  const match = tzName.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function zonedDateTimeToUtcDate(year, month, day, hour, minute, timeZone) {
  let utcTimestamp = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcTimestamp), timeZone);
    const adjustedTimestamp = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offsetMinutes * 60 * 1000;
    if (adjustedTimestamp === utcTimestamp) {
      break;
    }
    utcTimestamp = adjustedTimestamp;
  }

  return new Date(utcTimestamp);
}

function buildManagedRollingSlots(services, now = new Date()) {
  const generated = [];
  const durationLimits = {
    startHour: BOOKING_START_HOUR,
    endHour: BOOKING_END_HOUR
  };

  for (let dayOffset = 0; dayOffset < ROLLING_SLOT_DAYS; dayOffset += 1) {
    const dayReference = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const parts = getDatePartsInTimeZone(dayReference, APP_TIMEZONE);
    if (!parts) {
      continue;
    }

    for (const service of services) {
      const durationMinutes = Number(service.durationMinutes || 0);
      if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
        continue;
      }

      for (let hour = durationLimits.startHour; hour < durationLimits.endHour; hour += 1) {
        if (hour * 60 + durationMinutes > durationLimits.endHour * 60) {
          continue;
        }

        const startDate = zonedDateTimeToUtcDate(parts.year, parts.month, parts.day, hour, 0, APP_TIMEZONE);
        const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
        generated.push({
          serviceId: service.id,
          start: startDate.toISOString(),
          end: endDate.toISOString()
        });
      }
    }
  }

  return generated;
}

function syncManagedSlots(db, now = new Date()) {
  const serviceList = db.services.filter((item) => Number(item.id) > 0);
  const desired = buildManagedRollingSlots(serviceList, now);
  const desiredKeys = new Set(desired.map((slot) => slotKey(slot.serviceId, slot.start)));
  const bookedSlotIds = new Set(db.bookings.map((booking) => booking.slotId));
  let changed = false;

  db.slots = db.slots.filter((slot) => {
    if (!slot.managed) {
      return true;
    }
    const keep = desiredKeys.has(slotKey(slot.serviceId, slot.start)) || bookedSlotIds.has(slot.id);
    if (!keep) {
      changed = true;
    }
    return keep;
  });

  const existingByKey = new Map();
  for (const slot of db.slots) {
    existingByKey.set(slotKey(slot.serviceId, slot.start), slot);
  }

  let maxSlotId = db.slots.reduce((max, slot) => Math.max(max, Number(slot.id) || 0), 0);
  for (const desiredSlot of desired) {
    const key = slotKey(desiredSlot.serviceId, desiredSlot.start);
    const existing = existingByKey.get(key);
    if (existing) {
      const shouldBeAvailable = !bookedSlotIds.has(existing.id);
      if (
        existing.end !== desiredSlot.end ||
        existing.available !== shouldBeAvailable ||
        existing.managed !== true
      ) {
        existing.end = desiredSlot.end;
        existing.available = shouldBeAvailable;
        existing.managed = true;
        changed = true;
      }
      continue;
    }

    maxSlotId += 1;
    db.slots.push({
      id: maxSlotId,
      serviceId: desiredSlot.serviceId,
      start: desiredSlot.start,
      end: desiredSlot.end,
      available: true,
      managed: true
    });
    changed = true;
  }

  return changed;
}

function isSlotInRollingWindow(slotStart, now = new Date()) {
  const startMs = Date.parse(slotStart);
  if (Number.isNaN(startMs)) {
    return false;
  }
  const nowMs = now.getTime();
  const endMs = nowMs + ROLLING_SLOT_DAYS * 24 * 60 * 60 * 1000;
  return startMs >= nowMs && startMs < endMs;
}

function validateBooking(payload) {
  const required = ['serviceId', 'slotId'];
  const missing = required.filter((field) => !payload[field]);
  const hasStudentId = Boolean(payload.studentId);
  const hasStudentEmail = Boolean(payload.studentEmail);
  const hasContactNo = Boolean(payload.contactNo);
  if (!hasStudentId && !hasStudentEmail && !hasContactNo) {
    missing.push('studentId or studentEmail or contactNo');
  }
  if (missing.length > 0) {
    return `Missing fields: ${missing.join(', ')}`;
  }

  return null;
}

function isValidContactNo(value) {
  return /^[0-9+()\-\s]{7,20}$/.test(value);
}

function normalizeContactNo(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[()\-\s]/g, '');
}

function isWhatsAppEnabled() {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM && ADMIN_WHATSAPP_TO);
}

function normalizeWhatsAppTarget(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  return raw.startsWith('whatsapp:') ? raw : `whatsapp:${raw}`;
}

function formatLessonDate(isoDatetime) {
  return new Intl.DateTimeFormat('en-AE', {
    timeZone: APP_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(isoDatetime));
}

async function sendWhatsAppMessage(to, body) {
  if (!isWhatsAppEnabled()) {
    return false;
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams({
    To: normalizeWhatsAppTarget(to),
    From: normalizeWhatsAppTarget(TWILIO_WHATSAPP_FROM),
    Body: body
  });

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Twilio error ${response.status}: ${details}`);
  }

  return true;
}

function bookingAlertMessage(student, service, slot, bookingId) {
  return [
    'New tennis booking confirmed.',
    `Booking ID: ${bookingId}`,
    `Student: ${student.name} (${student.ageGroup})`,
    `Contact: ${student.contactNo || 'N/A'}`,
    `Lesson: ${service.name}`,
    `Start: ${formatLessonDate(slot.start)} (${APP_TIMEZONE})`
  ].join('\n');
}

function bookingReminderMessage(student, service, slot, bookingId) {
  return [
    'Reminder: tennis lesson is coming up.',
    `Booking ID: ${bookingId}`,
    `Student: ${student.name} (${student.ageGroup})`,
    `Contact: ${student.contactNo || 'N/A'}`,
    `Lesson: ${service.name}`,
    `Start: ${formatLessonDate(slot.start)} (${APP_TIMEZONE})`
  ].join('\n');
}

function findStudentByContactNo(db, contactNo) {
  const normalized = normalizeContactNo(contactNo);
  if (!normalized) {
    return null;
  }
  return db.students.find((item) => normalizeContactNo(item.contactNo) === normalized) || null;
}

function toTrackableBooking(db, booking) {
  const student = db.students.find((item) => item.id === booking.studentId);
  const service = db.services.find((item) => item.id === booking.serviceId);
  const slot = db.slots.find((item) => item.id === booking.slotId);
  return {
    id: booking.id,
    notes: booking.notes || '',
    createdAt: booking.createdAt,
    serviceName: service ? service.name : 'Unknown lesson',
    slotStart: slot ? slot.start : null,
    slotEnd: slot ? slot.end : null,
    studentName: student ? student.name : 'Unknown student',
    studentContactNo: student ? student.contactNo || '' : ''
  };
}

function findSlotByServiceAndTime(db, serviceId, slotTimeIso) {
  const requestedTimeMs = Date.parse(slotTimeIso);
  if (Number.isNaN(requestedTimeMs)) {
    return null;
  }

  const ONE_MINUTE_MS = 60 * 1000;
  return (
    db.slots.find((slot) => {
      if (!slot.managed) {
        return false;
      }
      if (slot.serviceId !== serviceId) {
        return false;
      }
      const slotStartMs = Date.parse(slot.start);
      if (Number.isNaN(slotStartMs)) {
        return false;
      }
      return Math.abs(slotStartMs - requestedTimeMs) < ONE_MINUTE_MS;
    }) || null
  );
}

async function processDueReminders() {
  if (!isWhatsAppEnabled() || reminderLoopBusy) {
    return;
  }

  reminderLoopBusy = true;
  try {
    const db = readDb();
    const now = Date.now();
    let updated = false;

    for (const booking of db.bookings) {
      if (booking.reminderSent || !booking.reminderAt) {
        continue;
      }

      const reminderAtMs = Date.parse(booking.reminderAt);
      if (Number.isNaN(reminderAtMs) || reminderAtMs > now) {
        continue;
      }

      const student = db.students.find((item) => item.id === booking.studentId);
      const service = db.services.find((item) => item.id === booking.serviceId);
      const slot = db.slots.find((item) => item.id === booking.slotId);

      if (!student || !service || !slot) {
        booking.reminderSent = true;
        booking.reminderSentAt = new Date().toISOString();
        updated = true;
        continue;
      }

      try {
        await sendWhatsAppMessage(
          ADMIN_WHATSAPP_TO,
          bookingReminderMessage(student, service, slot, booking.id)
        );
        booking.reminderSent = true;
        booking.reminderSentAt = new Date().toISOString();
        updated = true;
      } catch (err) {
        console.error(`Failed to send reminder for booking ${booking.id}:`, err.message);
      }
    }

    if (updated) {
      writeDb(db);
    }
  } finally {
    reminderLoopBusy = false;
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return sendJson(res, 200, { ok: true, service: 'tennis-book-app' });
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const session = getSession(req);
    if (!session) {
      return sendJson(res, 200, { authenticated: false, role: null });
    }
    return sendJson(res, 200, { authenticated: true, role: session.role });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    try {
      const payload = await readBody(req);
      const role = String(payload.role || '').trim().toLowerCase();
      if (role !== 'admin') {
        return sendJson(res, 400, { error: 'Unsupported role' });
      }

      if (payload.password !== ADMIN_PASSWORD) {
        return sendJson(res, 401, { error: 'Invalid credentials' });
      }

      const session = createSession(role);
      return sendJsonWithHeaders(
        res,
        200,
        { ok: true, role },
        {
          'Set-Cookie': `session=${session.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(
            SESSION_TTL_MS / 1000
          )}`
        }
      );
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    clearSession(req);
    return sendJsonWithHeaders(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }
    );
  }

  if (req.method === 'GET' && url.pathname === '/api/services') {
    const db = readDb();
    return sendJson(res, 200, db.services);
  }

  if (req.method === 'GET' && url.pathname === '/api/students') {
    if (!requireAdmin(req, res)) {
      return;
    }

    const db = readDb();
    return sendJson(res, 200, db.students);
  }

  if (req.method === 'GET' && url.pathname === '/api/slots') {
    const db = readDb();
    const updated = syncManagedSlots(db);
    if (updated) {
      writeDb(db);
    }
    const serviceId = Number(url.searchParams.get('serviceId'));
    const includeAll = url.searchParams.get('includeAll') === 'true';
    const now = new Date();
    const bookedSlotIds = new Set(db.bookings.map((item) => item.slotId));

    let slots = Number.isNaN(serviceId) ? db.slots : db.slots.filter((slot) => slot.serviceId === serviceId);

    if (includeAll) {
      if (!requireAdmin(req, res)) {
        return;
      }
      return sendJson(res, 200, slots);
    }

    slots = slots.filter(
      (slot) =>
        slot.managed === true &&
        slot.available &&
        !bookedSlotIds.has(slot.id) &&
        isSlotInRollingWindow(slot.start, now)
    );
    slots.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    return sendJson(res, 200, slots);
  }

  if (req.method === 'GET' && url.pathname === '/api/slots/check') {
    const db = readDb();
    const updated = syncManagedSlots(db);
    if (updated) {
      writeDb(db);
    }
    const serviceId = Number(url.searchParams.get('serviceId'));
    const slotTime = String(url.searchParams.get('slotTime') || '').trim();

    if (Number.isNaN(serviceId) || serviceId <= 0) {
      return sendJson(res, 400, { error: 'Missing or invalid serviceId' });
    }
    if (!slotTime) {
      return sendJson(res, 400, { error: 'Missing slotTime' });
    }
    if (Number.isNaN(Date.parse(slotTime))) {
      return sendJson(res, 400, { error: 'Invalid slotTime format' });
    }

    const slot = findSlotByServiceAndTime(db, serviceId, slotTime);
    if (!slot) {
      return sendJson(res, 200, {
        found: false,
        available: false,
        message: 'No slot found at this time for the selected lesson type.'
      });
    }

    const alreadyBooked = db.bookings.some((item) => item.slotId === slot.id);
    const isAvailable = Boolean(slot.available) && !alreadyBooked && isSlotInRollingWindow(slot.start);
    return sendJson(res, 200, {
      found: true,
      available: isAvailable,
      slot: {
        id: slot.id,
        start: slot.start,
        end: slot.end
      },
      message: isAvailable ? 'Slot is available.' : 'Slot is already booked.'
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/bookings') {
    if (!requireAdmin(req, res)) {
      return;
    }

    const db = readDb();
    const detailedBookings = db.bookings.map((booking) => {
      const student = db.students.find((item) => item.id === booking.studentId);
      const service = db.services.find((item) => item.id === booking.serviceId);
      const slot = db.slots.find((item) => item.id === booking.slotId);
      return {
        ...booking,
        studentName: student ? student.name : 'Unknown student',
        studentEmail: student ? student.email || '' : '',
        studentContactNo: student ? student.contactNo || '' : '',
        serviceName: service ? service.name : 'Unknown lesson',
        studentAgeGroup: student ? student.ageGroup : 'unknown',
        slotStart: slot ? slot.start : null,
        slotEnd: slot ? slot.end : null
      };
    });
    return sendJson(res, 200, detailedBookings);
  }

  if (req.method === 'GET' && url.pathname === '/api/bookings/track') {
    const contactNo = String(url.searchParams.get('contactNo') || '').trim();
    if (!contactNo) {
      return sendJson(res, 400, { error: 'Missing contactNo' });
    }
    if (!isValidContactNo(contactNo)) {
      return sendJson(res, 400, { error: 'Invalid contact number format' });
    }

    const db = readDb();
    const student = findStudentByContactNo(db, contactNo);
    if (!student) {
      return sendJson(res, 200, []);
    }

    const tracked = db.bookings
      .filter((item) => item.studentId === student.id)
      .map((item) => toTrackableBooking(db, item))
      .sort((a, b) => {
        const aTime = a.slotStart ? Date.parse(a.slotStart) : 0;
        const bTime = b.slotStart ? Date.parse(b.slotStart) : 0;
        return bTime - aTime;
      });
    return sendJson(res, 200, tracked);
  }

  const deleteBookingMatch = req.method === 'DELETE' ? url.pathname.match(/^\/api\/bookings\/(\d+)$/) : null;
  if (deleteBookingMatch) {
    if (!requireAdmin(req, res)) {
      return;
    }

    const db = readDb();
    const bookingId = Number(deleteBookingMatch[1]);
    const bookingIndex = db.bookings.findIndex((item) => item.id === bookingId);
    if (bookingIndex === -1) {
      return sendJson(res, 404, { error: 'Booking not found' });
    }

    const booking = db.bookings[bookingIndex];
    const slot = db.slots.find((item) => item.id === booking.slotId);
    if (slot) {
      slot.available = true;
    }

    db.bookings.splice(bookingIndex, 1);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/payments') {
    if (!requireAdmin(req, res)) {
      return;
    }

    const db = readDb();
    const detailedPayments = db.payments.map((payment) => {
      const student = db.students.find((item) => item.id === payment.studentId);
      return {
        ...payment,
        studentName: student ? student.name : 'Unknown student',
        studentEmail: student ? student.email || '' : '',
        studentContactNo: student ? student.contactNo || '' : '',
        receiptUrl: paymentReceiptPath(payment.id)
      };
    });

    return sendJson(res, 200, detailedPayments);
  }

  if (req.method === 'GET' && url.pathname === '/api/payments/summary') {
    if (!requireAdmin(req, res)) {
      return;
    }

    const db = readDb();
    return sendJson(res, 200, calculatePaymentSummary(db));
  }

  if (req.method === 'GET' && url.pathname === '/api/student-summaries') {
    if (!requireAdmin(req, res)) {
      return;
    }

    const db = readDb();
    const summaries = db.students.map((student) => ({
      ...student,
      ...calculateStudentSummary(db, student.id)
    }));

    return sendJson(res, 200, summaries);
  }

  const summaryMatch = req.method === 'GET' ? url.pathname.match(/^\/api\/students\/(\d+)\/summary$/) : null;
  if (summaryMatch) {
    if (!requireAdmin(req, res)) {
      return;
    }

    const db = readDb();
    const studentId = Number(summaryMatch[1]);
    const student = db.students.find((item) => item.id === studentId);
    if (!student) {
      return sendJson(res, 404, { error: 'Student not found' });
    }

    return sendJson(res, 200, {
      student,
      ...calculateStudentSummary(db, studentId)
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/bookings') {
    try {
      const payload = await readBody(req);
      const validationError = validateBooking(payload);
      if (validationError) {
        return sendJson(res, 400, { error: validationError });
      }

      const db = readDb();
      const updated = syncManagedSlots(db);
      if (updated) {
        writeDb(db);
      }
      const studentId = Number(payload.studentId);
      const serviceId = Number(payload.serviceId);
      const slotId = Number(payload.slotId);
      const studentEmail = String(payload.studentEmail || '')
        .trim()
        .toLowerCase();
      const studentName = String(payload.studentName || '').trim();
      const contactNo = String(payload.contactNo || '').trim();
      const ageGroupRaw = String(payload.ageGroup || '').trim().toLowerCase();

      if (contactNo && !isValidContactNo(contactNo)) {
        return sendJson(res, 400, { error: 'Invalid contact number format' });
      }

      let student = null;
      let createdNewStudent = false;
      if (!Number.isNaN(studentId) && studentId > 0) {
        student = db.students.find((item) => item.id === studentId);
      } else if (studentEmail) {
        student = db.students.find((item) => item.email === studentEmail);
      }
      if (!student && contactNo) {
        student = findStudentByContactNo(db, contactNo);
      }

      if (!student) {
        if (!studentName || !contactNo) {
          return sendJson(res, 404, {
            error: 'Student account not found. For a new client, add name and contact number.'
          });
        }

        let email = studentEmail;
        if (!email || !email.includes('@') || db.students.some((item) => item.email === email)) {
          const randomPart = crypto.randomBytes(4).toString('hex');
          email = `guest-${Date.now()}-${randomPart}@local.booking`;
        }

        const ageGroup = ['kids', 'adults'].includes(ageGroupRaw) ? ageGroupRaw : 'adults';
        student = {
          id: nextId(db.students),
          name: studentName,
          email,
          contactNo,
          ageGroup,
          createdAt: new Date().toISOString()
        };
        db.students.push(student);
        createdNewStudent = true;
      }

      if (contactNo && !student.contactNo) {
        student.contactNo = contactNo;
      }

      const resolvedStudentId = student.id;

      const service = db.services.find((item) => item.id === serviceId);
      if (!service) {
        return sendJson(res, 404, { error: 'Lesson type not found' });
      }

      const slot = db.slots.find(
        (item) => item.id === slotId && item.serviceId === serviceId && item.managed === true
      );
      if (!slot) {
        return sendJson(res, 404, { error: 'Slot not found for this lesson type' });
      }
      if (!isSlotInRollingWindow(slot.start)) {
        return sendJson(res, 409, { error: 'Slot is outside the 30-day booking window' });
      }

      if (db.bookings.some((item) => item.slotId === slotId)) {
        return sendJson(res, 409, { error: 'Slot already booked' });
      }

      if (!slot.available) {
        return sendJson(res, 409, { error: 'Slot already booked' });
      }

      const summary = calculateStudentSummary(db, resolvedStudentId);
      if (!createdNewStudent && summary.lessonsRemaining <= 0) {
        return sendJson(res, 409, { error: 'Student has no remaining paid lessons' });
      }

      const booking = {
        id: nextId(db.bookings),
        studentId: resolvedStudentId,
        serviceId,
        slotId,
        notes: payload.notes ? String(payload.notes).trim() : '',
        createdAt: new Date().toISOString(),
        reminderAt: new Date(new Date(slot.start).getTime() - REMINDER_MINUTES_BEFORE * 60 * 1000).toISOString(),
        reminderSent: false,
        reminderSentAt: null
      };

      slot.available = false;
      db.bookings.push(booking);
      writeDb(db);

      sendWhatsAppMessage(ADMIN_WHATSAPP_TO, bookingAlertMessage(student, service, slot, booking.id)).catch(
        (err) => {
          console.error(`Failed to send booking alert for booking ${booking.id}:`, err.message);
        }
      );

      return sendJson(res, 201, {
        ...booking,
        studentName: student.name,
        serviceName: service.name,
        summary: calculateStudentSummary(db, resolvedStudentId)
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/students') {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const payload = await readBody(req);
      const required = ['name', 'email', 'ageGroup'];
      const missing = required.filter((field) => !payload[field]);
      if (missing.length) {
        return sendJson(res, 400, { error: `Missing fields: ${missing.join(', ')}` });
      }

      const ageGroup = String(payload.ageGroup).toLowerCase();
      if (!['kids', 'adults'].includes(ageGroup)) {
        return sendJson(res, 400, { error: 'ageGroup must be kids or adults' });
      }

      if (!String(payload.email).includes('@')) {
        return sendJson(res, 400, { error: 'Invalid email' });
      }

      const contactNo = String(payload.contactNo || '').trim();
      if (contactNo && !isValidContactNo(contactNo)) {
        return sendJson(res, 400, { error: 'Invalid contact number format' });
      }

      const db = readDb();
      const email = String(payload.email).trim().toLowerCase();
      if (db.students.some((item) => item.email === email)) {
        return sendJson(res, 409, { error: 'Student email already exists' });
      }

      const student = {
        id: nextId(db.students),
        name: String(payload.name).trim(),
        email,
        contactNo,
        ageGroup,
        createdAt: new Date().toISOString()
      };

      db.students.push(student);
      writeDb(db);
      return sendJson(res, 201, student);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  const deleteStudentMatch = req.method === 'DELETE' ? url.pathname.match(/^\/api\/students\/(\d+)$/) : null;
  if (deleteStudentMatch) {
    if (!requireAdmin(req, res)) {
      return;
    }

    const db = readDb();
    const studentId = Number(deleteStudentMatch[1]);
    const studentIndex = db.students.findIndex((item) => item.id === studentId);
    if (studentIndex === -1) {
      return sendJson(res, 404, { error: 'Student not found' });
    }

    const hasBookings = db.bookings.some((item) => item.studentId === studentId);
    const hasPayments = db.payments.some((item) => item.studentId === studentId);
    if (hasBookings || hasPayments) {
      return sendJson(res, 409, {
        error: 'Cannot delete student with existing bookings or payments'
      });
    }

    db.students.splice(studentIndex, 1);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/payments') {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const payload = await readBody(req);
      const required = ['studentId', 'amount', 'lessonsPurchased'];
      const missing = required.filter((field) => !payload[field]);
      if (missing.length) {
        return sendJson(res, 400, { error: `Missing fields: ${missing.join(', ')}` });
      }

      const db = readDb();
      const studentId = Number(payload.studentId);
      const amount = Number(payload.amount);
      const lessonsPurchased = Number(payload.lessonsPurchased);

      if (!db.students.some((item) => item.id === studentId)) {
        return sendJson(res, 404, { error: 'Student not found' });
      }

      if (Number.isNaN(amount) || amount <= 0) {
        return sendJson(res, 400, { error: 'amount must be a positive number' });
      }

      if (!Number.isInteger(lessonsPurchased) || lessonsPurchased <= 0) {
        return sendJson(res, 400, { error: 'lessonsPurchased must be a positive integer' });
      }

      const payment = {
        id: nextId(db.payments),
        studentId,
        amount: Number(amount.toFixed(2)),
        lessonsPurchased,
        method: payload.method ? String(payload.method).trim() : '',
        note: payload.note ? String(payload.note).trim() : '',
        createdAt: new Date().toISOString()
      };

      db.payments.push(payment);
      writeDb(db);
      return sendJson(res, 201, {
        ...payment,
        receiptUrl: paymentReceiptPath(payment.id)
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  const receiptMatch = req.method === 'GET' ? url.pathname.match(/^\/receipt\/(\d+)$/) : null;
  if (receiptMatch) {
    const db = readDb();
    const paymentId = Number(receiptMatch[1]);
    const payment = db.payments.find((item) => item.id === paymentId);
    if (!payment) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Receipt not found');
      return;
    }

    const student = db.students.find((item) => item.id === payment.studentId);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(paymentReceiptHtml(payment, student));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/slots') {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const payload = await readBody(req);
      const required = ['serviceId', 'start', 'end'];
      const missing = required.filter((field) => !payload[field]);
      if (missing.length) {
        return sendJson(res, 400, { error: `Missing fields: ${missing.join(', ')}` });
      }

      const db = readDb();
      const serviceId = Number(payload.serviceId);
      if (!db.services.some((service) => service.id === serviceId)) {
        return sendJson(res, 404, { error: 'Lesson type not found' });
      }

      const start = new Date(payload.start);
      const end = new Date(payload.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return sendJson(res, 400, { error: 'Invalid slot time range' });
      }

      const slot = {
        id: nextId(db.slots),
        serviceId,
        start: start.toISOString(),
        end: end.toISOString(),
        available: true
      };

      db.slots.push(slot);
      writeDb(db);
      return sendJson(res, 201, slot);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  const deleteSlotMatch = req.method === 'DELETE' ? url.pathname.match(/^\/api\/slots\/(\d+)$/) : null;
  if (deleteSlotMatch) {
    if (!requireAdmin(req, res)) {
      return;
    }

    const db = readDb();
    const slotId = Number(deleteSlotMatch[1]);
    const slotIndex = db.slots.findIndex((item) => item.id === slotId);
    if (slotIndex === -1) {
      return sendJson(res, 404, { error: 'Slot not found' });
    }

    const hasBooking = db.bookings.some((item) => item.slotId === slotId);
    if (hasBooking || !db.slots[slotIndex].available) {
      return sendJson(res, 409, { error: 'Cannot delete booked slot' });
    }

    db.slots.splice(slotIndex, 1);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
  }

  if (req.method === 'GET' && url.pathname === '/admin') {
    const session = getSession(req);
    if (!session || session.role !== 'admin') {
      res.writeHead(302, { Location: '/login' });
      res.end();
      return;
    }

    return sendFile(res, path.join(PUBLIC_DIR, 'admin.html'));
  }

  if (req.method === 'GET' && url.pathname === '/login') {
    return sendFile(res, path.join(PUBLIC_DIR, 'login.html'));
  }

  const safePath = path.normalize(url.pathname).replace(/^\/+/, '');
  const assetPath = path.join(PUBLIC_DIR, safePath);
  if (assetPath.startsWith(PUBLIC_DIR) && fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
    return sendFile(res, assetPath);
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

function createServer() {
  return http.createServer((req, res) => {
    Promise.resolve(handleRequest(req, res)).catch((err) => {
      console.error('Unhandled request error:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Internal server error' });
        return;
      }
      res.end();
    });
  });
}

function startServer(port = PORT) {
  const server = createServer();
  const reminderInterval = setInterval(processDueReminders, 60 * 1000);

  processDueReminders().catch((err) => {
    console.error('Reminder loop startup error:', err.message);
  });

  server.on('close', () => {
    clearInterval(reminderInterval);
  });

  server.listen(port, () => {
    console.log(`Tennis booking app running on http://localhost:${port}`);
    if (isWhatsAppEnabled()) {
      console.log('WhatsApp reminders are enabled.');
    } else {
      console.log('WhatsApp reminders are disabled. Configure Twilio env vars to enable.');
    }
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  handleRequest,
  createServer,
  startServer
};
