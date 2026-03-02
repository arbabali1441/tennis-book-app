const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const APP_TIMEZONE = 'Asia/Dubai';
const TARGET_MONTH_BOOKINGS = 40;

const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Apple Pay', 'Google Pay'];
const AMOUNTS = [120, 140, 150, 175, 200, 220, 240, 260, 300, 320, 360, 400];
const LESSON_COUNTS = [1, 2, 3, 4, 5, 6];

const STUDENT_SEEDS = [
  { name: 'Noah Ali', ageGroup: 'kids' },
  { name: 'Mia Rahman', ageGroup: 'kids' },
  { name: 'Luca Nasser', ageGroup: 'kids' },
  { name: 'Sara Khan', ageGroup: 'kids' },
  { name: 'Zara Malik', ageGroup: 'kids' },
  { name: 'Omar Saeed', ageGroup: 'kids' },
  { name: 'Adam Rehman', ageGroup: 'kids' },
  { name: 'Aisha Noor', ageGroup: 'kids' },
  { name: 'James Carter', ageGroup: 'adults' },
  { name: 'Olivia Reed', ageGroup: 'adults' },
  { name: 'Ethan Brooks', ageGroup: 'adults' },
  { name: 'Ava Turner', ageGroup: 'adults' },
  { name: 'Liam Scott', ageGroup: 'adults' },
  { name: 'Sophia Green', ageGroup: 'adults' },
  { name: 'Mason Hill', ageGroup: 'adults' },
  { name: 'Ella Price', ageGroup: 'adults' }
];

function nextId(items) {
  return items.length === 0 ? 1 : Math.max(...items.map((item) => Number(item.id) || 0)) + 1;
}

function getTimeZoneParts(dateInput, timeZone) {
  const date = new Date(dateInput);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = (type) => parts.find((item) => item.type === type)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day'))
  };
}

function isInMonth(isoDate, year, month, timeZone) {
  const parts = getTimeZoneParts(isoDate, timeZone);
  return parts.year === year && parts.month === month;
}

function seedStudents(db) {
  const existingEmails = new Set(db.students.map((s) => String(s.email || '').toLowerCase()));
  const existingContacts = new Set(db.students.map((s) => String(s.contactNo || '')));
  let studentId = nextId(db.students);

  for (let i = 0; i < STUDENT_SEEDS.length; i += 1) {
    const seed = STUDENT_SEEDS[i];
    const email = `${seed.name.toLowerCase().replace(/\s+/g, '.')}@demo.local`;
    const contactNo = `+97150000${String(100 + i).padStart(3, '0')}`;
    if (existingEmails.has(email) || existingContacts.has(contactNo)) {
      continue;
    }

    db.students.push({
      id: studentId,
      name: seed.name,
      email,
      contactNo,
      ageGroup: seed.ageGroup,
      createdAt: new Date().toISOString()
    });
    studentId += 1;
  }
}

function findOrCreateSlot(db, { serviceId, startIso, durationMinutes, slotIdRef }) {
  const existing = db.slots.find((slot) => slot.serviceId === serviceId && slot.start === startIso);
  if (existing) {
    return existing;
  }

  const endIso = new Date(new Date(startIso).getTime() + durationMinutes * 60 * 1000).toISOString();
  const slot = {
    id: slotIdRef.value,
    serviceId,
    start: startIso,
    end: endIso,
    available: true,
    managed: true
  };
  slotIdRef.value += 1;
  db.slots.push(slot);
  return slot;
}

function main() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  if (!Array.isArray(db.services)) db.services = [];
  if (!Array.isArray(db.students)) db.students = [];
  if (!Array.isArray(db.slots)) db.slots = [];
  if (!Array.isArray(db.bookings)) db.bookings = [];
  if (!Array.isArray(db.payments)) db.payments = [];

  seedStudents(db);

  const now = new Date();
  const currentMonthParts = getTimeZoneParts(now.toISOString(), APP_TIMEZONE);
  const targetYear = currentMonthParts.year;
  const targetMonth = currentMonthParts.month;
  const daysInMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();

  const slotsById = new Map(db.slots.map((slot) => [slot.id, slot]));
  const bookingsThisMonth = db.bookings.filter((booking) => {
    const slot = slotsById.get(booking.slotId);
    return slot && isInMonth(slot.start, targetYear, targetMonth, APP_TIMEZONE);
  });
  const toCreate = Math.max(0, TARGET_MONTH_BOOKINGS - bookingsThisMonth.length);
  if (toCreate === 0) {
    console.log(`No new bookings needed. ${TARGET_MONTH_BOOKINGS} bookings already exist for ${targetYear}-${String(targetMonth).padStart(2, '0')}.`);
    return;
  }

  const kidsStudents = db.students.filter((s) => s.ageGroup === 'kids');
  const adultStudents = db.students.filter((s) => s.ageGroup === 'adults');
  const services = db.services.filter((service) => Number(service.id) > 0);
  if (services.length === 0) {
    throw new Error('No services found in data/db.json');
  }

  let bookingId = nextId(db.bookings);
  let paymentId = nextId(db.payments);
  const slotIdRef = { value: nextId(db.slots) };

  const occupiedSlotIds = new Set(db.bookings.map((booking) => booking.slotId));
  const occupiedKeys = new Set(
    db.bookings
      .map((booking) => {
        const slot = slotsById.get(booking.slotId);
        if (!slot) return null;
        return `${booking.serviceId}|${slot.start}`;
      })
      .filter(Boolean)
  );

  const hourChoices = [13, 14, 15, 16, 17];
  const minuteChoices = [0, 15, 30, 45];

  for (let i = 0; i < toCreate; i += 1) {
    let service = services[i % services.length];
    let studentPool = service.ageGroup === 'kids' ? kidsStudents : adultStudents;
    if (studentPool.length === 0) {
      studentPool = db.students;
    }
    const student = studentPool[(i * 3) % studentPool.length];

    let day = ((i * 5) % daysInMonth) + 1;
    let hour = hourChoices[i % hourChoices.length];
    let minute = minuteChoices[i % minuteChoices.length];
    let startIso = new Date(Date.UTC(targetYear, targetMonth - 1, day, hour, minute, 0, 0)).toISOString();
    let key = `${service.id}|${startIso}`;
    let attempts = 0;

    while (occupiedKeys.has(key) && attempts < 24) {
      attempts += 1;
      day = ((day + 1) % daysInMonth) + 1;
      hour = hourChoices[(i + attempts) % hourChoices.length];
      minute = minuteChoices[(i + attempts) % minuteChoices.length];
      service = services[(i + attempts) % services.length];
      studentPool = service.ageGroup === 'kids' ? kidsStudents : adultStudents;
      if (studentPool.length === 0) {
        studentPool = db.students;
      }
      startIso = new Date(Date.UTC(targetYear, targetMonth - 1, day, hour, minute, 0, 0)).toISOString();
      key = `${service.id}|${startIso}`;
    }

    const slot = findOrCreateSlot(db, {
      serviceId: service.id,
      startIso,
      durationMinutes: Number(service.durationMinutes || 60),
      slotIdRef
    });

    occupiedKeys.add(`${service.id}|${slot.start}`);
    occupiedSlotIds.add(slot.id);
    slot.available = false;
    slot.managed = true;

    const bookingCreatedAt = new Date(Date.UTC(targetYear, targetMonth - 1, day, 8, 30, 0, 0)).toISOString();
    const reminderAt = new Date(new Date(slot.start).getTime() - 180 * 60 * 1000).toISOString();
    const method = PAYMENT_METHODS[i % PAYMENT_METHODS.length];
    const amount = AMOUNTS[i % AMOUNTS.length];
    const lessonsPurchased = LESSON_COUNTS[i % LESSON_COUNTS.length];

    db.bookings.push({
      id: bookingId,
      studentId: student.id,
      serviceId: service.id,
      slotId: slot.id,
      notes: `Month seed booking ${i + 1} | payment: ${method} | amount AED ${amount.toFixed(2)}`,
      createdAt: bookingCreatedAt,
      reminderAt,
      reminderSent: false,
      reminderSentAt: null
    });
    bookingId += 1;

    db.payments.push({
      id: paymentId,
      studentId: student.id,
      amount,
      lessonsPurchased,
      method,
      note: `Seeded payment for month booking ${i + 1}`,
      createdAt: new Date(Date.UTC(targetYear, targetMonth - 1, day, 7, 15, 0, 0)).toISOString()
    });
    paymentId += 1;
  }

  fs.writeFileSync(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  console.log(
    `Generated ${toCreate} bookings and ${toCreate} payments for ${targetYear}-${String(targetMonth).padStart(2, '0')}.`
  );
}

main();
