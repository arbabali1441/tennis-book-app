const bookingForm = document.getElementById('booking-form');
const serviceSelect = document.getElementById('service-select');
const slotSelect = document.getElementById('slot-select');
const slotTimeInput = document.getElementById('slot-time-input');
const checkSlotBtn = document.getElementById('check-slot-btn');
const slotCheckMessage = document.getElementById('slot-check-message');
const formMessage = document.getElementById('form-message');
const trackForm = document.getElementById('track-form');
const trackMessage = document.getElementById('track-message');
const trackResults = document.getElementById('track-results');
let services = [];

function formatDate(iso) {
  return new Date(iso).toLocaleString();
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

  formMessage.textContent = 'Lesson confirmed successfully.';
  formMessage.style.color = '#047857';
  bookingForm.reset();
  slotSelect.innerHTML = '<option value="">Select a slot</option>';
});

function renderTrackedBookings(bookings) {
  trackResults.innerHTML = '';

  if (bookings.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No bookings found for this contact number.';
    trackResults.appendChild(li);
    return;
  }

  for (const booking of bookings) {
    const li = document.createElement('li');
    const startLabel = booking.slotStart ? formatDate(booking.slotStart) : 'Unknown time';
    li.textContent = `Booking #${booking.id}: ${booking.serviceName} at ${startLabel}`;
    trackResults.appendChild(li);
  }
}

trackForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  trackMessage.textContent = 'Checking bookings...';
  trackMessage.style.color = '#0f172a';

  const formData = new FormData(trackForm);
  const contactNo = String(formData.get('contactNo') || '').trim();

  const response = await fetch(`/api/bookings/track?contactNo=${encodeURIComponent(contactNo)}`);
  const data = await response.json();

  if (!response.ok) {
    trackMessage.textContent = data.error || 'Unable to track bookings';
    trackMessage.style.color = '#b91c1c';
    trackResults.innerHTML = '';
    return;
  }

  trackMessage.textContent = `Found ${data.length} booking${data.length === 1 ? '' : 's'}.`;
  trackMessage.style.color = '#047857';
  renderTrackedBookings(data);
});

checkSlotBtn.addEventListener('click', async () => {
  const serviceId = String(serviceSelect.value || '').trim();
  const slotTimeRaw = String(slotTimeInput.value || '').trim();
  if (!serviceId) {
    slotCheckMessage.textContent = 'Select lesson type first.';
    slotCheckMessage.style.color = '#b91c1c';
    return;
  }
  if (!slotTimeRaw) {
    slotCheckMessage.textContent = 'Enter slot date and time first.';
    slotCheckMessage.style.color = '#b91c1c';
    return;
  }

  const slotTime = new Date(slotTimeRaw);
  if (Number.isNaN(slotTime.getTime())) {
    slotCheckMessage.textContent = 'Invalid date/time format.';
    slotCheckMessage.style.color = '#b91c1c';
    return;
  }

  slotCheckMessage.textContent = 'Checking slot...';
  slotCheckMessage.style.color = '#0f172a';

  const response = await fetch(
    `/api/slots/check?serviceId=${encodeURIComponent(serviceId)}&slotTime=${encodeURIComponent(slotTime.toISOString())}`
  );
  const data = await response.json();

  if (!response.ok) {
    slotCheckMessage.textContent = data.error || 'Failed to check slot availability.';
    slotCheckMessage.style.color = '#b91c1c';
    return;
  }

  slotCheckMessage.textContent = data.message || 'Check completed.';
  slotCheckMessage.style.color = data.available ? '#047857' : '#b91c1c';

  if (data.available && data.slot && data.slot.id) {
    slotSelect.value = String(data.slot.id);
  }
});

(async function init() {
  await fetchServices();
})();
