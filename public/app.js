const bookingForm = document.getElementById('booking-form');
const serviceSelect = document.getElementById('service-select');
const slotSelect = document.getElementById('slot-select');
const formMessage = document.getElementById('form-message');
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

(async function init() {
  await fetchServices();
})();
