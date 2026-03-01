const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('login-message');

async function checkSession() {
  const response = await fetch('/api/auth/me');
  const data = await response.json();

  if (data.authenticated && data.role === 'admin') {
    window.location.href = '/admin';
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.textContent = 'Signing in...';

  const formData = new FormData(loginForm);
  const payload = {
    role: 'admin',
    password: formData.get('password')
  };

  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    loginMessage.textContent = data.error || 'Login failed';
    loginMessage.style.color = '#b91c1c';
    return;
  }

  loginMessage.textContent = 'Login successful';
  loginMessage.style.color = '#047857';
  window.location.href = '/admin';
});

checkSession();
