const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const EventEmitter = require('node:events');

const fixtureDb = path.join(__dirname, '..', 'data', 'db.json');

function copyFixtureDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booking-app-test-'));
  const tempDbPath = path.join(tempDir, 'db.json');
  fs.copyFileSync(fixtureDb, tempDbPath);
  return { tempDir, tempDbPath };
}

function loadHandlerWithDb(tempDbPath) {
  process.env.DATA_FILE = tempDbPath;
  delete require.cache[require.resolve('../server')];
  const { handleRequest } = require('../server');
  return handleRequest;
}

function invoke(handler, { method = 'GET', url = '/', headers = {}, body } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost', ...headers };

  return new Promise((resolve, reject) => {
    let statusCode = 200;
    let responseHeaders = {};
    const chunks = [];

    const res = {
      writeHead(code, hdrs = {}) {
        statusCode = code;
        responseHeaders = hdrs;
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        const raw = Buffer.concat(chunks).toString('utf8');
        let json;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = null;
        }
        resolve({ statusCode, headers: responseHeaders, bodyText: raw, json });
      }
    };

    Promise.resolve(handler(req, res)).catch(reject);

    process.nextTick(() => {
      if (body !== undefined) {
        const payload = typeof body === 'string' ? body : JSON.stringify(body);
        req.emit('data', payload);
      }
      req.emit('end');
    });
  });
}

function dubaiDateKeys(dateInput) {
  const date = new Date(dateInput);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = (type) => parts.find((item) => item.type === type)?.value;
  return {
    dayKey: `${get('year')}-${get('month')}-${get('day')}`,
    monthKey: `${get('year')}-${get('month')}`
  };
}

test('health endpoint returns ok', async () => {
  const { tempDir, tempDbPath } = copyFixtureDb();
  try {
    const handler = loadHandlerWithDb(tempDbPath);
    const response = await invoke(handler, { method: 'GET', url: '/healthz' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, { ok: true, service: 'tennis-book-app' });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('public booking flow creates booking and consumes slot', async () => {
  const { tempDir, tempDbPath } = copyFixtureDb();
  try {
    const handler = loadHandlerWithDb(tempDbPath);
    const initialSlotsResponse = await invoke(handler, { method: 'GET', url: '/api/slots?serviceId=1' });
    assert.equal(initialSlotsResponse.statusCode, 200);
    assert.equal(Array.isArray(initialSlotsResponse.json), true);
    assert.equal(initialSlotsResponse.json.length > 0, true);
    const slot = initialSlotsResponse.json[0];

    const createResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/bookings',
      headers: { 'content-type': 'application/json' },
      body: {
        studentId: 1,
        serviceId: 1,
        slotId: slot.id,
        notes: 'integration-test'
      }
    });

    assert.equal(createResponse.statusCode, 201);
    assert.equal(createResponse.json.studentName, 'Aarav Khan');
    assert.equal(createResponse.json.serviceName, 'Private Lesson - Kids');
    assert.equal(createResponse.json.summary.lessonsRemaining, 4);

    const slotsResponse = await invoke(handler, { method: 'GET', url: '/api/slots?serviceId=1' });
    assert.equal(slotsResponse.statusCode, 200);
    assert.equal(slotsResponse.json.some((item) => item.id === slot.id), false);

    const duplicateResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/bookings',
      headers: { 'content-type': 'application/json' },
      body: {
        studentId: 1,
        serviceId: 1,
        slotId: slot.id
      }
    });

    assert.equal(duplicateResponse.statusCode, 409);
    assert.equal(duplicateResponse.json.error, 'Slot already booked');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('new client can book with contact number and is auto-created as student', async () => {
  const { tempDir, tempDbPath } = copyFixtureDb();
  try {
    const handler = loadHandlerWithDb(tempDbPath);
    const dbBefore = JSON.parse(fs.readFileSync(tempDbPath, 'utf8'));
    const studentCountBefore = dbBefore.students.length;
    const initialSlotsResponse = await invoke(handler, { method: 'GET', url: '/api/slots?serviceId=1' });
    assert.equal(initialSlotsResponse.statusCode, 200);
    assert.equal(initialSlotsResponse.json.length > 0, true);
    const slot = initialSlotsResponse.json[0];

    const createResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/bookings',
      headers: { 'content-type': 'application/json' },
      body: {
        studentName: 'New Walk-in Client',
        contactNo: '+971500000001',
        ageGroup: 'adults',
        serviceId: 1,
        slotId: slot.id
      }
    });

    assert.equal(createResponse.statusCode, 201);
    assert.equal(createResponse.json.studentName, 'New Walk-in Client');

    const dbAfter = JSON.parse(fs.readFileSync(tempDbPath, 'utf8'));
    assert.equal(dbAfter.students.length, studentCountBefore + 1);
    assert.equal(
      dbAfter.students.some((item) => item.name === 'New Walk-in Client' && item.contactNo === '+971500000001'),
      true
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('public track endpoint returns bookings by contact number', async () => {
  const { tempDir, tempDbPath } = copyFixtureDb();
  try {
    const db = JSON.parse(fs.readFileSync(tempDbPath, 'utf8'));
    db.students[0].contactNo = '+971501111111';
    fs.writeFileSync(tempDbPath, JSON.stringify(db, null, 2), 'utf8');

    const handler = loadHandlerWithDb(tempDbPath);

    const trackResponse = await invoke(handler, {
      method: 'GET',
      url: '/api/bookings/track?contactNo=%2B971501111111'
    });
    assert.equal(trackResponse.statusCode, 200);
    assert.equal(Array.isArray(trackResponse.json), true);
    assert.equal(trackResponse.json.length > 0, true);
    assert.equal(trackResponse.json[0].studentContactNo, '+971501111111');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('public slot checker validates typed time availability', async () => {
  const { tempDir, tempDbPath } = copyFixtureDb();
  try {
    const handler = loadHandlerWithDb(tempDbPath);
    const initialSlotsResponse = await invoke(handler, { method: 'GET', url: '/api/slots?serviceId=1' });
    assert.equal(initialSlotsResponse.statusCode, 200);
    assert.equal(initialSlotsResponse.json.length > 0, true);
    const slot = initialSlotsResponse.json[0];

    const availableResponse = await invoke(handler, {
      method: 'GET',
      url: `/api/slots/check?serviceId=1&slotTime=${encodeURIComponent(slot.start)}`
    });
    assert.equal(availableResponse.statusCode, 200);
    assert.equal(availableResponse.json.found, true);
    assert.equal(availableResponse.json.available, true);

    const createResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/bookings',
      headers: { 'content-type': 'application/json' },
      body: {
        studentId: 1,
        serviceId: 1,
        slotId: slot.id
      }
    });
    assert.equal(createResponse.statusCode, 201);

    const bookedResponse = await invoke(handler, {
      method: 'GET',
      url: `/api/slots/check?serviceId=1&slotTime=${encodeURIComponent(slot.start)}`
    });
    assert.equal(bookedResponse.statusCode, 200);
    assert.equal(bookedResponse.json.found, true);
    assert.equal(bookedResponse.json.available, false);
    assert.equal(bookedResponse.json.slot.id, slot.id);

    const missingTime = new Date(Date.parse(slot.start) + 30 * 60 * 1000).toISOString();

    const missingResponse = await invoke(handler, {
      method: 'GET',
      url: `/api/slots/check?serviceId=1&slotTime=${encodeURIComponent(missingTime)}`
    });
    assert.equal(missingResponse.statusCode, 200);
    assert.equal(missingResponse.json.found, false);
    assert.equal(missingResponse.json.available, false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('admin auth guards protected routes and allows access after login', async () => {
  const { tempDir, tempDbPath } = copyFixtureDb();
  try {
    const handler = loadHandlerWithDb(tempDbPath);

    const unauthorized = await invoke(handler, { method: 'GET', url: '/api/bookings' });
    assert.equal(unauthorized.statusCode, 401);
    assert.equal(unauthorized.json.error, 'Admin authentication required');

    const unauthorizedStudents = await invoke(handler, { method: 'GET', url: '/api/students' });
    assert.equal(unauthorizedStudents.statusCode, 401);
    assert.equal(unauthorizedStudents.json.error, 'Admin authentication required');

    const loginResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { role: 'admin', password: 'admin1234' }
    });

    assert.equal(loginResponse.statusCode, 200);
    assert.equal(loginResponse.json.ok, true);
    assert.ok(loginResponse.headers['Set-Cookie']);

    const sessionCookie = loginResponse.headers['Set-Cookie'].split(';')[0];
    const authorized = await invoke(handler, {
      method: 'GET',
      url: '/api/bookings',
      headers: { cookie: sessionCookie }
    });

    assert.equal(authorized.statusCode, 200);
    assert.ok(Array.isArray(authorized.json));

    const authorizedStudents = await invoke(handler, {
      method: 'GET',
      url: '/api/students',
      headers: { cookie: sessionCookie }
    });
    assert.equal(authorizedStudents.statusCode, 200);
    assert.ok(Array.isArray(authorizedStudents.json));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('payments summary returns total, daily sale, and monthly sale', async () => {
  const { tempDir, tempDbPath } = copyFixtureDb();
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const db = JSON.parse(fs.readFileSync(tempDbPath, 'utf8'));
    db.payments = [
      { id: 1, studentId: 1, amount: 150, lessonsPurchased: 2, createdAt: now.toISOString() },
      { id: 2, studentId: 1, amount: 200, lessonsPurchased: 3, createdAt: yesterday.toISOString() },
      { id: 3, studentId: 2, amount: 300, lessonsPurchased: 4, createdAt: sixtyDaysAgo.toISOString() }
    ];
    fs.writeFileSync(tempDbPath, JSON.stringify(db, null, 2), 'utf8');

    const handler = loadHandlerWithDb(tempDbPath);
    const loginResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { role: 'admin', password: 'admin1234' }
    });
    const sessionCookie = loginResponse.headers['Set-Cookie'].split(';')[0];

    const summaryResponse = await invoke(handler, {
      method: 'GET',
      url: '/api/payments/summary',
      headers: { cookie: sessionCookie }
    });
    assert.equal(summaryResponse.statusCode, 200);

    const nowKeys = dubaiDateKeys(now);
    let expectedDaily = 0;
    let expectedMonthly = 0;
    let expectedTotal = 0;
    for (const payment of db.payments) {
      expectedTotal += payment.amount;
      const paymentKeys = dubaiDateKeys(payment.createdAt);
      if (paymentKeys.dayKey === nowKeys.dayKey) {
        expectedDaily += payment.amount;
      }
      if (paymentKeys.monthKey === nowKeys.monthKey) {
        expectedMonthly += payment.amount;
      }
    }

    assert.deepEqual(summaryResponse.json, {
      totalPayment: Number(expectedTotal.toFixed(2)),
      dailySale: Number(expectedDaily.toFixed(2)),
      monthlySale: Number(expectedMonthly.toFixed(2))
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('admin can delete empty student and cannot delete student with history', async () => {
  const { tempDir, tempDbPath } = copyFixtureDb();
  try {
    const handler = loadHandlerWithDb(tempDbPath);

    const loginResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { role: 'admin', password: 'admin1234' }
    });
    const sessionCookie = loginResponse.headers['Set-Cookie'].split(';')[0];

    const createStudent = await invoke(handler, {
      method: 'POST',
      url: '/api/students',
      headers: { 'content-type': 'application/json', cookie: sessionCookie },
      body: {
        name: 'No History',
        email: 'nohistory@example.com',
        ageGroup: 'adults'
      }
    });
    assert.equal(createStudent.statusCode, 201);

    const deleteNewStudent = await invoke(handler, {
      method: 'DELETE',
      url: `/api/students/${createStudent.json.id}`,
      headers: { cookie: sessionCookie }
    });
    assert.equal(deleteNewStudent.statusCode, 200);
    assert.equal(deleteNewStudent.json.ok, true);

    const deleteStudentWithHistory = await invoke(handler, {
      method: 'DELETE',
      url: '/api/students/1',
      headers: { cookie: sessionCookie }
    });
    assert.equal(deleteStudentWithHistory.statusCode, 409);
    assert.equal(deleteStudentWithHistory.json.error, 'Cannot delete student with existing bookings or payments');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('admin can delete available slot and cannot delete booked slot', async () => {
  const { tempDir, tempDbPath } = copyFixtureDb();
  try {
    const handler = loadHandlerWithDb(tempDbPath);

    const loginResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { role: 'admin', password: 'admin1234' }
    });
    const sessionCookie = loginResponse.headers['Set-Cookie'].split(';')[0];

    const deleteAvailableSlot = await invoke(handler, {
      method: 'DELETE',
      url: '/api/slots/2',
      headers: { cookie: sessionCookie }
    });
    assert.equal(deleteAvailableSlot.statusCode, 200);
    assert.equal(deleteAvailableSlot.json.ok, true);

    const deleteBookedSlot = await invoke(handler, {
      method: 'DELETE',
      url: '/api/slots/1',
      headers: { cookie: sessionCookie }
    });
    assert.equal(deleteBookedSlot.statusCode, 409);
    assert.equal(deleteBookedSlot.json.error, 'Cannot delete booked slot');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('admin can cancel a booking and the slot becomes available again', async () => {
  const { tempDir, tempDbPath } = copyFixtureDb();
  try {
    const handler = loadHandlerWithDb(tempDbPath);
    const initialSlotsResponse = await invoke(handler, { method: 'GET', url: '/api/slots?serviceId=1' });
    assert.equal(initialSlotsResponse.statusCode, 200);
    assert.equal(initialSlotsResponse.json.length > 0, true);
    const slot = initialSlotsResponse.json[0];

    const createResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/bookings',
      headers: { 'content-type': 'application/json' },
      body: {
        studentId: 1,
        serviceId: 1,
        slotId: slot.id
      }
    });
    assert.equal(createResponse.statusCode, 201);
    const bookingId = createResponse.json.id;

    const loginResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: { role: 'admin', password: 'admin1234' }
    });
    const sessionCookie = loginResponse.headers['Set-Cookie'].split(';')[0];

    const cancelResponse = await invoke(handler, {
      method: 'DELETE',
      url: `/api/bookings/${bookingId}`,
      headers: { cookie: sessionCookie }
    });
    assert.equal(cancelResponse.statusCode, 200);
    assert.equal(cancelResponse.json.ok, true);

    const slotsResponse = await invoke(handler, { method: 'GET', url: '/api/slots?serviceId=1' });
    assert.equal(slotsResponse.statusCode, 200);
    assert.equal(slotsResponse.json.some((item) => item.id === slot.id), true);

    const rebookResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/bookings',
      headers: { 'content-type': 'application/json' },
      body: {
        studentId: 1,
        serviceId: 1,
        slotId: slot.id
      }
    });
    assert.equal(rebookResponse.statusCode, 201);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
