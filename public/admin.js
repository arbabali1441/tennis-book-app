const studentForm = document.getElementById('student-form');
const paymentForm = document.getElementById('payment-form');
const slotForm = document.getElementById('slot-form');

const paymentStudentSelect = document.getElementById('payment-student-select');
const serviceSelect = document.getElementById('admin-service-select');

const studentMessage = document.getElementById('student-message');
const paymentMessage = document.getElementById('payment-message');
const slotMessage = document.getElementById('slot-message');

const studentTotalsList = document.getElementById('student-totals-list');
const studentContactsList = document.getElementById('student-contacts-list');
const bookingsList = document.getElementById('admin-bookings-list');
const paymentsList = document.getElementById('admin-payments-list');
const slotsList = document.getElementById('admin-slots-list');
const totalPaymentValue = document.getElementById('total-payment-value');
const dailySaleValue = document.getElementById('daily-sale-value');
const monthlySaleValue = document.getElementById('monthly-sale-value');
const dailyLessonValue = document.getElementById('daily-lesson-value');
const dailyLessonList = document.getElementById('daily-lesson-list');
const logoutBtn = document.getElementById('logout-btn');
const weekdaysChartBtn = document.getElementById('weekdays-chart-btn');
const fullWeekChartBtn = document.getElementById('full-week-chart-btn');
const allClientsChartBtn = document.getElementById('all-clients-chart-btn');
const financeBtn = document.getElementById('finance-btn');
const bookingChartCaption = document.getElementById('booking-chart-caption');
const bookingBarChart = document.getElementById('booking-bar-chart');
const bookingChartGrid = document.getElementById('booking-chart-grid');
const financeSection = document.getElementById('finance-section');

const WEEKDAYS_ONLY = 'weekdays';
const FULL_WEEK = 'full-week';
const ALL_CLIENTS = 'all-clients';
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let chartMode = WEEKDAYS_ONLY;
let bookingsCache = [];

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

function toIsoString(localDatetime) {
  return new Date(localDatetime).toISOString();
}

function formatCurrency(value) {
  return `AED ${Number(value || 0).toFixed(2)}`;
}

function countDailyLessons(bookings) {
  const today = toDateKey(new Date());
  return bookings.filter((booking) => {
    if (!booking.slotStart) {
      return false;
    }
    const start = new Date(booking.slotStart);
    if (Number.isNaN(start.getTime())) {
      return false;
    }
    return toDateKey(start) === today;
  }).length;
}

function getTodayBookings(bookings) {
  const today = toDateKey(new Date());
  return bookings
    .filter((booking) => {
      if (!booking.slotStart) {
        return false;
      }
      const start = new Date(booking.slotStart);
      if (Number.isNaN(start.getTime())) {
        return false;
      }
      return toDateKey(start) === today;
    })
    .sort((a, b) => new Date(a.slotStart).getTime() - new Date(b.slotStart).getTime());
}

function renderDailyLessons(bookings) {
  dailyLessonList.innerHTML = '';
  const todayBookings = getTodayBookings(bookings);

  if (todayBookings.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No lessons booked today.';
    dailyLessonList.appendChild(empty);
    return;
  }

  for (const booking of todayBookings) {
    const li = document.createElement('li');
    li.textContent = `${new Date(booking.slotStart).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    })} - ${booking.studentName} (${booking.serviceName})`;
    dailyLessonList.appendChild(li);
  }
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatSlotHour(hour) {
  const amPm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:00 ${amPm}`;
}

function getCurrentMonday() {
  const today = new Date();
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  const diff = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - diff);
  return monday;
}

function getChartDays(mode) {
  const monday = getCurrentMonday();
  const dayRules = [
    { index: 1, startHour: 17, endHour: 22 },
    { index: 2, startHour: 17, endHour: 22 },
    { index: 3, startHour: 17, endHour: 22 },
    { index: 4, startHour: 17, endHour: 22 },
    { index: 5, startHour: 17, endHour: 22 }
  ];

  if (mode === FULL_WEEK || mode === ALL_CLIENTS) {
    dayRules.push({ index: 6, startHour: 6, endHour: 22 });
    dayRules.push({ index: 0, startHour: 6, endHour: 22 });
  }

  return dayRules.map((rule) => {
    const date = new Date(monday);
    const offset = rule.index === 0 ? 6 : rule.index - 1;
    date.setDate(monday.getDate() + offset);
    return {
      ...rule,
      date,
      dayName: WEEKDAY_NAMES[rule.index],
      dateKey: toDateKey(date)
    };
  });
}

function getChartButtonClass(isActive) {
  return isActive ? 'secondary-btn chart-btn-active' : 'secondary-btn';
}

function setChartMode(nextMode) {
  chartMode = nextMode;
  weekdaysChartBtn.className = getChartButtonClass(chartMode === WEEKDAYS_ONLY);
  fullWeekChartBtn.className = getChartButtonClass(chartMode === FULL_WEEK);
  allClientsChartBtn.className = getChartButtonClass(chartMode === ALL_CLIENTS);
  financeBtn.className = getChartButtonClass(false);
  renderBookingChart();
}

function createBookingMap(bookings, mode) {
  const map = new Map();
  for (const booking of bookings) {
    if (!booking.slotStart) {
      continue;
    }
    const start = new Date(booking.slotStart);
    if (Number.isNaN(start.getTime())) {
      continue;
    }
    const key =
      mode === ALL_CLIENTS ? `${start.getDay()}-${start.getHours()}` : `${toDateKey(start)}-${start.getHours()}`;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(booking);
  }
  return map;
}

function renderDailyBarChart(bookings, chartDays, mode) {
  const countsByDay = new Map();
  for (const day of chartDays) {
    const key = mode === ALL_CLIENTS ? String(day.index) : day.dateKey;
    countsByDay.set(key, 0);
  }

  for (const booking of bookings) {
    if (!booking.slotStart) {
      continue;
    }
    const start = new Date(booking.slotStart);
    if (Number.isNaN(start.getTime())) {
      continue;
    }
    const dayKey = mode === ALL_CLIENTS ? String(start.getDay()) : toDateKey(start);
    if (!countsByDay.has(dayKey)) {
      continue;
    }
    countsByDay.set(dayKey, countsByDay.get(dayKey) + 1);
  }

  const maxCount = Math.max(...countsByDay.values(), 1);
  bookingBarChart.innerHTML = '';

  for (const day of chartDays) {
    const key = mode === ALL_CLIENTS ? String(day.index) : day.dateKey;
    const count = countsByDay.get(key) || 0;
    const widthPercent = Math.max((count / maxCount) * 100, count > 0 ? 12 : 0);

    const row = document.createElement('div');
    row.className = 'bar-chart-row';

    const label = document.createElement('p');
    label.className = 'bar-chart-label';
    label.textContent =
      mode === ALL_CLIENTS ? `${day.dayName} (all)` : `${day.dayName} ${day.date.getMonth() + 1}/${day.date.getDate()}`;
    row.appendChild(label);

    const track = document.createElement('div');
    track.className = 'bar-chart-track';

    const fill = document.createElement('div');
    fill.className = 'bar-chart-fill';
    fill.style.width = `${widthPercent}%`;
    fill.textContent = `${count} booking${count === 1 ? '' : 's'}`;
    track.appendChild(fill);

    row.appendChild(track);
    bookingBarChart.appendChild(row);
  }
}

function getWeekBookings() {
  const monday = getCurrentMonday();
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return bookingsCache.filter((booking) => {
    if (!booking.slotStart) {
      return false;
    }
    const slotStart = new Date(booking.slotStart);
    return slotStart >= monday && slotStart <= sunday;
  });
}

function renderBookingChart() {
  const chartDays = getChartDays(chartMode);
  const chartBookings = chartMode === ALL_CLIENTS ? bookingsCache : getWeekBookings();
  const bookingMap = createBookingMap(chartBookings, chartMode);
  bookingChartGrid.innerHTML = '';

  if (chartMode === FULL_WEEK) {
    bookingChartCaption.textContent = 'Full week chart: Monday-Friday 5:00 PM to 10:00 PM, Saturday-Sunday 6:00 AM to 10:00 PM';
  } else if (chartMode === ALL_CLIENTS) {
    bookingChartCaption.textContent =
      'All clients chart: all-time bookings grouped by day and hour. Monday-Friday 5:00 PM to 10:00 PM, Saturday-Sunday 6:00 AM to 10:00 PM';
  } else {
    bookingChartCaption.textContent = 'Weekdays chart: Monday-Friday 5:00 PM to 10:00 PM';
  }
  renderDailyBarChart(chartBookings, chartDays, chartMode);

  for (const day of chartDays) {
    const dayColumn = document.createElement('article');
    dayColumn.className = 'chart-day-column';

    const dayHeader = document.createElement('h3');
    dayHeader.className = 'chart-day-title';
    dayHeader.textContent = chartMode === ALL_CLIENTS ? day.dayName : `${day.dayName} ${day.date.toLocaleDateString()}`;
    dayColumn.appendChild(dayHeader);

    for (let hour = day.startHour; hour < day.endHour; hour += 1) {
      const slotRow = document.createElement('div');
      slotRow.className = 'chart-slot-row';

      const time = document.createElement('p');
      time.className = 'chart-slot-time';
      time.textContent = formatSlotHour(hour);
      slotRow.appendChild(time);

      const bookingsCell = document.createElement('div');
      bookingsCell.className = 'chart-slot-bookings';

      const key = chartMode === ALL_CLIENTS ? `${day.index}-${hour}` : `${day.dateKey}-${hour}`;
      const slotBookings = bookingMap.get(key) || [];

      if (slotBookings.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'chart-no-booking';
        empty.textContent = 'No booking';
        bookingsCell.appendChild(empty);
      } else {
        for (const booking of slotBookings) {
          const item = document.createElement('p');
          item.className = 'chart-booking-item';
          item.textContent =
            chartMode === ALL_CLIENTS
              ? `${booking.studentName} - ${booking.serviceName} (${new Date(booking.slotStart).toLocaleDateString()})`
              : `${booking.studentName} - ${booking.serviceName}`;
          bookingsCell.appendChild(item);
        }
      }

      slotRow.appendChild(bookingsCell);
      dayColumn.appendChild(slotRow);
    }

    bookingChartGrid.appendChild(dayColumn);
  }
}

async function openFinanceSection() {
  financeBtn.disabled = true;
  financeBtn.className = getChartButtonClass(true);
  try {
    await fetchPayments();
    await fetchPaymentsSummary();
    financeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } finally {
    financeBtn.disabled = false;
  }
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
  if (response.status === 401) {
    window.location.href = '/login';
    return;
  }
  const students = await response.json();

  paymentStudentSelect.innerHTML = '<option value="">Select student</option>';
  studentContactsList.innerHTML = '';

  if (students.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No students yet.';
    studentContactsList.appendChild(empty);
  }

  for (const student of students) {
    const option = document.createElement('option');
    option.value = student.id;
    option.textContent = `${student.name} (${student.ageGroup}) ${student.contactNo ? '- ' + student.contactNo : ''}`;
    paymentStudentSelect.appendChild(option);

    const contactItem = document.createElement('li');
    contactItem.textContent = `${student.name} (${student.ageGroup}) | Email: ${student.email || 'N/A'} | Contact: ${
      student.contactNo || 'N/A'
    }`;
    studentContactsList.appendChild(contactItem);
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
    text.textContent = `${student.name} (${student.ageGroup}) | Email: ${student.email || 'N/A'} | Contact: ${
      student.contactNo || 'N/A'
    } | Paid: AED ${student.totalPaid.toFixed(2)} | Purchased: ${student.totalLessonsPurchased} | Booked: ${
      student.totalLessonsBooked
    } | Remaining: ${student.lessonsRemaining}`;
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
  bookingsCache = bookings;
  bookingsList.innerHTML = '';

  if (bookings.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No bookings yet.';
    bookingsList.appendChild(empty);
    dailyLessonValue.textContent = '0';
    renderDailyLessons([]);
    renderBookingChart();
    return;
  }

  dailyLessonValue.textContent = String(countDailyLessons(bookings));
  renderDailyLessons(bookings);

  for (const booking of bookings.slice().reverse()) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `${booking.studentName} (${booking.studentAgeGroup}) | Email: ${booking.studentEmail || 'N/A'} | Contact: ${
      booking.studentContactNo || 'N/A'
    } | Booked: ${booking.serviceName} at ${formatDate(booking.slotStart)}`;
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

  renderBookingChart();
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
    li.textContent = `${payment.studentName} | Email: ${payment.studentEmail || 'N/A'} | Contact: ${
      payment.studentContactNo || 'N/A'
    } | Paid: AED ${payment.amount.toFixed(2)} for ${payment.lessonsPurchased} lessons on ${formatDate(payment.createdAt)}`;
    paymentsList.appendChild(li);
  }
}

async function fetchPaymentsSummary() {
  const response = await fetch('/api/payments/summary');
  if (response.status === 401) {
    window.location.href = '/login';
    return;
  }

  if (!response.ok) {
    totalPaymentValue.textContent = 'N/A';
    dailySaleValue.textContent = 'N/A';
    monthlySaleValue.textContent = 'N/A';
    return;
  }

  const summary = await response.json();
  totalPaymentValue.textContent = formatCurrency(summary.totalPayment);
  dailySaleValue.textContent = formatCurrency(summary.dailySale);
  monthlySaleValue.textContent = formatCurrency(summary.monthlySale);
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
    text.textContent = `Service #${slot.serviceId} | ${formatDate(slot.start)} - ${formatDate(slot.end)}`;
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
      const booked = document.createElement('span');
      booked.className = 'slot-status-booked';
      const label = document.createElement('span');
      label.textContent = 'Booked';
      const icon = document.createElement('span');
      icon.className = 'slot-booked-icon';
      icon.textContent = '✓';
      booked.appendChild(label);
      booked.appendChild(icon);
      li.appendChild(booked);
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
  await fetchPaymentsSummary();
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

weekdaysChartBtn.addEventListener('click', () => {
  setChartMode(WEEKDAYS_ONLY);
});

fullWeekChartBtn.addEventListener('click', () => {
  setChartMode(FULL_WEEK);
});

allClientsChartBtn.addEventListener('click', () => {
  setChartMode(ALL_CLIENTS);
});

financeBtn.addEventListener('click', async () => {
  await openFinanceSection();
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
  await fetchPaymentsSummary();
  await fetchSlots();
})();
