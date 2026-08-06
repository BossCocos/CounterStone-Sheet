const socket = io();

// Перевірка токена
const savedToken = sessionStorage.getItem('authToken');
if (savedToken) {
    socket.emit('auth:token', savedToken, (res) => {
        if (res.success) {
            if (res.isAdmin) {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'player.html';
            }
        } else {
            sessionStorage.removeItem('authToken');
        }
    });
}
// Перемикання форм
function toggleForms() {
  document.getElementById('loginCard').classList.toggle('hidden');
  document.getElementById('registerCard').classList.toggle('hidden');
}
function showAdminLogin() {
  document.getElementById('loginCard').classList.add('hidden');
  document.getElementById('adminCard').classList.remove('hidden');
}
function hideAdminLogin() {
  document.getElementById('adminCard').classList.add('hidden');
  document.getElementById('loginCard').classList.remove('hidden');
}
window.toggleForms = toggleForms;
window.showAdminLogin = showAdminLogin;
window.hideAdminLogin = hideAdminLogin;

// Вхід гравця
document.getElementById('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const discordName = document.getElementById('loginDiscordName').value.trim();
  const password = document.getElementById('loginPassword').value;
  socket.emit('player:login', { discordName, password }, (response) => {
    if (response.error) {
      document.getElementById('loginError').textContent = response.error;
      document.getElementById('loginError').style.display = 'block';
    } else {
      sessionStorage.setItem('authToken', res.token);
      sessionStorage.setItem('playerId', discordName);
      window.location.href = 'player.html';
    }
  });
});

// Реєстрація
document.getElementById('registerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const nickname = document.getElementById('regNickname').value.trim();
  const discordName = document.getElementById('regDiscordName').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regConfirmPassword').value;

  if (password !== confirm) {
    document.getElementById('registerError').textContent = 'Паролі не співпадають';
    document.getElementById('registerError').style.display = 'block';
    return;
  }

  socket.emit('player:register', { nickname, discordName, password }, (response) => {
    if (response.error) {
      document.getElementById('registerError').textContent = response.error;
      document.getElementById('registerError').style.display = 'block';
    } else {
      document.getElementById('registerSuccess').textContent = 'Реєстрація успішна! Тепер увійдіть.';
      document.getElementById('registerSuccess').style.display = 'block';
      document.getElementById('registerError').style.display = 'none';
      setTimeout(() => toggleForms(), 1500);
    }
  });
});

// Вхід адміна
document.getElementById('adminForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const password = document.getElementById('adminPassword').value;
  socket.emit('admin:login', { password }, (response) => {
    if (response.error) {
      document.getElementById('adminError').textContent = response.error;
      document.getElementById('adminError').style.display = 'block';
    } else {
      sessionStorage.setItem('isAdmin', 'true');
      window.location.href = 'admin.html';
    }
  });
});