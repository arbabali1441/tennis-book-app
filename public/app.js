const bookingForm = document.getElementById('booking-form');
const studentSelect = document.getElementById('student-select');
const serviceSelect = document.getElementById('service-select');
const slotSelect = document.getElementById('slot-select');
const formMessage = document.getElementById('form-message');
const studentSummary = document.getElementById('student-summary');

let students = [];
let services = [];

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

function renderSummary(summaryData) {
  studentSummary.innerHTML = `
    <p><strong>Student:</strong> ${summaryData.student.name} (${summaryData.student.ageGroup})</p>
    <p><strong>Total Lessons Purchased:</strong> ${summaryData.totalLessonsPurchased}</p>
    <p><strong>Total Lessons Booked:</strong> ${summaryData.totalLessonsBooked}</p>
    <p><strong>Lessons Remaining:</strong> ${summaryData.lessonsRemaining}</p>
    <p><strong>Total Paid:</strong> AED ${summaryData.totalPaid.toFixed(2)}</p>
  `;
}

async function fetchStudents() {
  const response = await fetch('/api/students');
  students = await response.json();

  studentSelect.innerHTML = '<option value="">Select student</option>';
  for (const student of students) {
    const option = document.createElement('option');
    option.value = student.id;
    option.textContent = `${student.name} (${student.ageGroup}) ${student.contactNo ? '- ' + student.contactNo : ''}`;
    studentSelect.appendChild(option);
  }
}

async function fetchServices() {
  const response = await fetch('/api/services');
  services = await response.json();

  serviceSelect.innerHTML = '<option value="">Select lesson type</option>';
  for (const service of services) {
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = `${service.name} (${service.durationMinutes} min)`;
    serviceSelect.appendChild(option);
  }
}

async function fetchStudentSummary(studentId) {
  if (!studentId) {
    studentSummary.textContent = 'Select a student to view lesson and payment totals.';
    return;
  }

  const response = await fetch(`/api/students/${studentId}/summary`);
  const data = await response.json();

  if (!response.ok) {
    studentSummary.textContent = data.error || 'Could not load student summary.';
    return;
  }

  renderSummary(data);
}

async function fetchSlots(serviceId) {
  if (!serviceId) {
    slotSelect.innerHTML = '<option value="">Select a slot</option>';
    return;
  }

  const response = await fetch(`/api/slots?serviceId=${serviceId}`);
  const slots = await response.json();

  slotSelect.innerHTML = '<option value="">Select a slot</option>';
  for (const slot of slots) {
    const option = document.createElement('option');
    option.value = slot.id;
    option.textContent = `${formatDate(slot.start)} - ${formatDate(slot.end)}`;
    slotSelect.appendChild(option);
  }
}

studentSelect.addEventListener('change', () => {
  fetchStudentSummary(studentSelect.value);
});

serviceSelect.addEventListener('change', () => {
  fetchSlots(serviceSelect.value);
});

bookingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formMessage.textContent = 'Submitting...';

  const formData = new FormData(bookingForm);
  const payload = Object.fromEntries(formData.entries());

  const response = await fetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    formMessage.textContent = data.error || 'Booking failed';
    formMessage.style.color = '#b91c1c';
    return;
  }

  formMessage.textContent = `Lesson confirmed for ${data.studentName}. Remaining lessons: ${data.summary.lessonsRemaining}`;
  formMessage.style.color = '#047857';
  bookingForm.reset();
  slotSelect.innerHTML = '<option value="">Select a slot</option>';
  await fetchStudentSummary(payload.studentId);
});

(async function init() {
  await fetchStudents();
  await fetchServices();
})();
