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

    const createResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/bookings',
      headers: { 'content-type': 'application/json' },
      body: {
        studentId: 1,
        serviceId: 1,
        slotId: 5,
        notes: 'integration-test'
      }
    });

    assert.equal(createResponse.statusCode, 201);
    assert.equal(createResponse.json.studentName, 'Aarav Khan');
    assert.equal(createResponse.json.serviceName, 'Private Lesson - Kids');
    assert.equal(createResponse.json.summary.lessonsRemaining, 4);

    const slotsResponse = await invoke(handler, { method: 'GET', url: '/api/slots?serviceId=1' });
    assert.equal(slotsResponse.statusCode, 200);
    assert.equal(slotsResponse.json.some((item) => item.id === 5), false);

    const duplicateResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/bookings',
      headers: { 'content-type': 'application/json' },
      body: {
        studentId: 1,
        serviceId: 1,
        slotId: 5
      }
    });

    assert.equal(duplicateResponse.statusCode, 409);
    assert.equal(duplicateResponse.json.error, 'Slot already booked');
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

    const createResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/bookings',
      headers: { 'content-type': 'application/json' },
      body: {
        studentId: 1,
        serviceId: 1,
        slotId: 5
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
    assert.equal(slotsResponse.json.some((item) => item.id === 5), true);

    const rebookResponse = await invoke(handler, {
      method: 'POST',
      url: '/api/bookings',
      headers: { 'content-type': 'application/json' },
      body: {
        studentId: 1,
        serviceId: 1,
        slotId: 5
      }
    });
    assert.equal(rebookResponse.statusCode, 201);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
