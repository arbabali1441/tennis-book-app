const studentForm = document.getElementById('student-form');
const paymentForm = document.getElementById('payment-form');
const slotForm = document.getElementById('slot-form');

const paymentStudentSelect = document.getElementById('payment-student-select');
const serviceSelect = document.getElementById('admin-service-select');

const studentMessage = document.getElementById('student-message');
const paymentMessage = document.getElementById('payment-message');
const slotMessage = document.getElementById('slot-message');

const studentTotalsList = document.getElementById('student-totals-list');
const bookingsList = document.getElementById('admin-bookings-list');
const paymentsList = document.getElementById('admin-payments-list');
const slotsList = document.getElementById('admin-slots-list');
const logoutBtn = document.getElementById('logout-btn');

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

function toIsoString(localDatetime) {
  return new Date(localDatetime).toISOString();
}

async function requireAdminSession() {
  const response = await fetch('/api/auth/me');
  const data = await response.json();

  if (!data.authenticated || data.role !== 'admin') {
    window.location.href = '/login';
    return false;
  }

  return true;
}

async function fetchStudentsAndFillSelects() {
  const response = await fetch('/api/students');
  const students = await response.json();

  paymentStudentSelect.innerHTML = '<option value="">Select student</option>';
  for (const student of students) {
    const option = document.createElement('option');
    option.value = student.id;
    option.textContent = `${student.name} (${student.ageGroup}) ${student.contactNo ? '- ' + student.contactNo : ''}`;
    paymentStudentSelect.appendChild(option);
  }
}

async function fetchServices() {
  const response = await fetch('/api/services');
  const services = await response.json();

  serviceSelect.innerHTML = '<option value="">Select lesson type</option>';
  for (const service of services) {
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = `${service.name} (${service.durationMinutes} min)`;
    serviceSelect.appendChild(option);
  }
}

async function fetchStudentSummaries() {
  const response = await fetch('/api/student-summaries');
  if (response.status === 401) {
    window.location.href = '/login';
    return;
  }

  const summaries = await response.json();
  studentTotalsList.innerHTML = '';

  if (summaries.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No students yet.';
    studentTotalsList.appendChild(empty);
    return;
  }

  for (const student of summaries) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `${student.name} (${student.ageGroup}) ${student.contactNo ? '| Contact: ' + student.contactNo : ''} | Paid: AED ${student.totalPaid.toFixed(
      2
    )} | Purchased: ${student.totalLessonsPurchased} | Booked: ${student.totalLessonsBooked} | Remaining: ${
      student.lessonsRemaining
    }`;
    li.appendChild(text);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'list-action danger-btn';
    deleteBtn.dataset.action = 'delete-student';
    deleteBtn.dataset.studentId = String(student.id);
    deleteBtn.textContent = 'Delete';
    li.appendChild(deleteBtn);
    studentTotalsList.appendChild(li);
  }
}

async function fetchBookings() {
  const response = await fetch('/api/bookings');
  if (response.status === 401) {
    window.location.href = '/login';
    return;
  }

  const bookings = await response.json();
  bookingsList.innerHTML = '';

  if (bookings.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No bookings yet.';
    bookingsList.appendChild(empty);
    return;
  }

  for (const booking of bookings.slice().reverse()) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `${booking.studentName} (${booking.studentAgeGroup}) ${booking.studentContactNo ? '- ' + booking.studentContactNo : ''} booked ${booking.serviceName} at ${formatDate(
      booking.slotStart
    )}`;
    li.appendChild(text);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'list-action danger-btn';
    cancelBtn.dataset.action = 'cancel-booking';
    cancelBtn.dataset.bookingId = String(booking.id);
    cancelBtn.textContent = 'Cancel';
    li.appendChild(cancelBtn);
    bookingsList.appendChild(li);
  }
}

async function fetchPayments() {
  const response = await fetch('/api/payments');
  if (response.status === 401) {
    window.location.href = '/login';
    return;
  }

  const payments = await response.json();
  paymentsList.innerHTML = '';

  if (payments.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No payments yet.';
    paymentsList.appendChild(empty);
    return;
  }

  for (const payment of payments.slice().reverse()) {
    const li = document.createElement('li');
    li.textContent = `${payment.studentName} paid AED ${payment.amount.toFixed(2)} for ${payment.lessonsPurchased} lessons on ${formatDate(
      payment.createdAt
    )}`;
    paymentsList.appendChild(li);
  }
}

async function fetchSlots() {
  const response = await fetch('/api/slots?includeAll=true');
  if (response.status === 401) {
    window.location.href = '/login';
    return;
  }

  const slots = await response.json();
  slotsList.innerHTML = '';

  if (slots.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No slots yet.';
    slotsList.appendChild(empty);
    return;
  }

  for (const slot of slots) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `Service #${slot.serviceId} | ${formatDate(slot.start)} - ${formatDate(slot.end)} | ${
      slot.available ? 'available' : 'booked'
    }`;
    li.appendChild(text);

    if (slot.available) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'list-action danger-btn';
      deleteBtn.dataset.action = 'delete-slot';
      deleteBtn.dataset.slotId = String(slot.id);
      deleteBtn.textContent = 'Delete';
      li.appendChild(deleteBtn);
    } else {
      const locked = document.createElement('span');
      locked.className = 'slot-locked';
      locked.textContent = 'Locked';
      li.appendChild(locked);
    }

    slotsList.appendChild(li);
  }
}

studentTotalsList.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.dataset.action !== 'delete-student') {
    return;
  }

  const studentId = target.dataset.studentId;
  if (!studentId) {
    return;
  }

  if (!window.confirm('Delete this student? Students with bookings/payments cannot be deleted.')) {
    return;
  }

  studentMessage.textContent = 'Deleting student...';
  const response = await fetch(`/api/students/${studentId}`, { method: 'DELETE' });
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }
    studentMessage.textContent = data.error || 'Failed to delete student';
    studentMessage.style.color = '#b91c1c';
    return;
  }

  studentMessage.textContent = 'Student deleted';
  studentMessage.style.color = '#047857';
  await fetchStudentsAndFillSelects();
  await fetchStudentSummaries();
});

slotsList.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.dataset.action !== 'delete-slot') {
    return;
  }

  const slotId = target.dataset.slotId;
  if (!slotId) {
    return;
  }

  if (!window.confirm('Delete this slot? Booked slots cannot be deleted.')) {
    return;
  }

  slotMessage.textContent = 'Deleting slot...';
  const response = await fetch(`/api/slots/${slotId}`, { method: 'DELETE' });
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }
    slotMessage.textContent = data.error || 'Failed to delete slot';
    slotMessage.style.color = '#b91c1c';
    return;
  }

  slotMessage.textContent = 'Slot deleted';
  slotMessage.style.color = '#047857';
  await fetchSlots();
});

bookingsList.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.dataset.action !== 'cancel-booking') {
    return;
  }

  const bookingId = target.dataset.bookingId;
  if (!bookingId) {
    return;
  }

  if (!window.confirm('Cancel this booking? This will free up the slot again.')) {
    return;
  }

  paymentMessage.textContent = '';
  const response = await fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' });
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }
    slotMessage.textContent = data.error || 'Failed to cancel booking';
    slotMessage.style.color = '#b91c1c';
    return;
  }

  slotMessage.textContent = 'Booking canceled';
  slotMessage.style.color = '#047857';
  await fetchBookings();
  await fetchSlots();
  await fetchStudentSummaries();
});

studentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  studentMessage.textContent = 'Saving student...';

  const payload = Object.fromEntries(new FormData(studentForm).entries());
  const response = await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    studentMessage.textContent = data.error || 'Failed to create student';
    studentMessage.style.color = '#b91c1c';
    return;
  }

  studentMessage.textContent = 'Student created';
  studentMessage.style.color = '#047857';
  studentForm.reset();
  await fetchStudentsAndFillSelects();
  await fetchStudentSummaries();
});

paymentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  paymentMessage.textContent = 'Saving payment...';

  const payload = Object.fromEntries(new FormData(paymentForm).entries());
  const response = await fetch('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    paymentMessage.textContent = data.error || 'Failed to add payment';
    paymentMessage.style.color = '#b91c1c';
    return;
  }

  paymentMessage.textContent = 'Payment added';
  paymentMessage.style.color = '#047857';
  paymentForm.reset();
  await fetchPayments();
  await fetchStudentSummaries();
});

slotForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  slotMessage.textContent = 'Saving slot...';

  const payload = Object.fromEntries(new FormData(slotForm).entries());
  payload.start = toIsoString(payload.start);
  payload.end = toIsoString(payload.end);

  const response = await fetch('/api/slots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    slotMessage.textContent = data.error || 'Failed to create slot';
    slotMessage.style.color = '#b91c1c';
    return;
  }

  slotMessage.textContent = 'Slot created';
  slotMessage.style.color = '#047857';
  slotForm.reset();
  await fetchSlots();
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
});

(async function init() {
  const ok = await requireAdminSession();
  if (!ok) {
    return;
  }

  await fetchStudentsAndFillSelects();
  await fetchServices();
  await fetchStudentSummaries();
  await fetchBookings();
  await fetchPayments();
  await fetchSlots();
})();
