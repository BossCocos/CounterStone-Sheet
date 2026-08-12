const socket = io();
let playerData = null;

document.addEventListener('DOMContentLoaded', () => {
    const loginContainer = document.getElementById('loginFormContainer');
    const playerContainer = document.getElementById('playerContainer');

    // Автологін
    const savedToken = sessionStorage.getItem('authToken');
    if (savedToken) {
        socket.emit('auth:token', savedToken, (res) => {
            if (res.success && !res.isAdmin) {
                loginContainer.style.display = 'none';
                playerContainer.style.display = 'block';
                // player:state прийде автоматично (сервер його надсилає в auth:token)
            } else {
                sessionStorage.removeItem('authToken');
                loginContainer.style.display = 'block';
                playerContainer.style.display = 'none';
            }
        });
    } else {
        loginContainer.style.display = 'block';
        playerContainer.style.display = 'none';
    }

    // Ручний вхід
    document.getElementById('loginAgainForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const discordName = document.getElementById('discordName').value.trim();
        const password = document.getElementById('password').value;
        socket.emit('player:login', { discordName, password }, (res) => {
            if (res.error) {
                document.getElementById('loginError').textContent = res.error;
            } else {
                sessionStorage.setItem('authToken', res.token);
                // приховування форми відбудеться через player:state
            }
        });
    });
});

// ---- Отримання стану (поза DOMContentLoaded, бо всередині використовуємо безпечно) ----
socket.on('player:state', (data) => {
    playerData = data;
    document.getElementById('loginFormContainer').style.display = 'none';
    document.getElementById('playerContainer').style.display = 'block';
    renderPlayer();
});

// Отримання стану персонажа
socket.on('player:state', (data) => {
  playerData = data;
  loginContainer.style.display = 'none';
  playerContainer.style.display = 'block';
  renderPlayer();
});

socket.on('errorMsg', (msg) => alert(msg));

// Запит зміни імені/класу від адміна
socket.on('player:changeRequest', ({ type, value }) => {
  currentChangeRequest = { type, value };
  if (type === 'nickname') {
    changeMessage.textContent = `Адміністратор пропонує змінити ім'я на "${value}". Погоджуєтесь?`;
  } else if (type === 'class') {
    changeMessage.textContent = `Адміністратор пропонує змінити клас на "${value}". Погоджуєтесь?`;
  }
  modal.classList.add('active');
});

document.getElementById('acceptChange').addEventListener('click', () => {
  if (!currentChangeRequest) return;
  socket.emit('player:changeResponse', { accept: true, ...currentChangeRequest });
  modal.classList.remove('active');
});

document.getElementById('declineChange').addEventListener('click', () => {
  if (!currentChangeRequest) return;
  socket.emit('player:changeResponse', { accept: false, ...currentChangeRequest });
  modal.classList.remove('active');
});

// Навігація (заглушки)
document.getElementById('navChar').addEventListener('click', () => {
  // показати лист персонажа (вже показано)
});
document.getElementById('navInfo').addEventListener('click', () => {
  alert('Інформаційна сторінка (буде реалізована)');
});
document.getElementById('navMap').addEventListener('click', () => {
  alert('Карта (буде реалізована)');
});
document.getElementById('navSkills').addEventListener('click', () => {
  window.location.href = 'skills.html';
});
document.getElementById('navTavern').addEventListener('click', () => {
  alert('Таверна (буде реалізована)');
});
document.getElementById('navChat').addEventListener('click', () => {
  alert('Чат (буде реалізована)');
});
document.getElementById('navLogout').addEventListener('click', () => {
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('playerId');
  window.location.href = 'index.html';
});

function renderPlayer() {
  document.getElementById('nickname').textContent = playerData.nickname;
  document.getElementById('characterClass').textContent = playerData.className || 'Новачок';
  document.getElementById('level').textContent = playerData.level;
  document.getElementById('freePoints').textContent = playerData.freePoints;

  const nextXp = xpForNextLevel(playerData.level);
  const xpPercent = Math.min((playerData.xp / nextXp) * 100, 100);
  document.getElementById('xpBar').style.width = xpPercent + '%';
  document.getElementById('xpNext').textContent = `${playerData.xp} / ${nextXp}`;

  // HP bar – тільки смужка, максимум показуємо
  const hpPercent = (playerData.maxHp > 0) ? (playerData.hp / playerData.maxHp) * 100 : 0;
  document.getElementById('hpBar').style.width = hpPercent + '%';
  document.getElementById('maxHp').textContent = playerData.maxHp;
  const hpBar = document.getElementById('hpBar');
  if (hpPercent < 25) {
    hpBar.classList.add('low');
  } else {
    hpBar.classList.remove('low');
  }

  // MP bar
  const manaPercent = (playerData.maxMana > 0) ? (playerData.currentMana / playerData.maxMana) * 100 : 0;
  document.getElementById('manaBar').style.width = manaPercent + '%';
  document.getElementById('maxMana').textContent = playerData.maxMana;

  // Характеристики
  const statsList = document.getElementById('statsList');
  statsList.innerHTML = '';
  for (const [stat, value] of Object.entries(playerData.stats)) {
    const row = document.createElement('div');
    row.className = 'attr-row';
    row.innerHTML = `
      <span>${stat}</span>
      <span class="attr-value">${value}</span>
      <button class="neon-btn plusBtn" data-stat="${stat}" ${playerData.freePoints <= 0 ? 'disabled' : ''}>+</button>
    `;
    statsList.appendChild(row);
  }
  

  document.querySelectorAll('.plusBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('player:spendPoint', { statName: btn.dataset.stat, delta: 1 }, (resp) => {
        if (resp.error) alert(resp.error);
      });
    });
  });

  // Ефекти
  const effectsContainer = document.getElementById('effectsList');
  effectsContainer.innerHTML = '';
  if (playerData.effects && playerData.effects.length) {
    playerData.effects.forEach(eff => {
      const icon = document.createElement('div');
      icon.className = 'effect-icon';
      icon.style.backgroundImage = `url('icons/${eff.icon}.png')`; // ви підставите свої
      icon.dataset.tooltip = eff.name;
      // Якщо немає зображень, покажемо текст
      if (!eff.icon) icon.textContent = eff.name.substring(0,2);
      effectsContainer.appendChild(icon);
    });
  }
}

function xpForNextLevel(level) {
  return Math.floor(100 + (level * 150) + Math.pow(level, 2) * 50);
}