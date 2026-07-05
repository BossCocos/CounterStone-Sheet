const socket = io();
let playerData = null;

// Обробка успішної авторизації
socket.on('player:state', (data) => {
  playerData = data;
  document.getElementById('loginFormContainer').style.display = 'none';
  document.getElementById('playerContainer').style.display = 'block';
  renderPlayer();
});

// Повідомлення про помилку
socket.on('errorMsg', (msg) => alert(msg));

// Якщо гравець не авторизований, показуємо форму входу
document.getElementById('loginAgainForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const discordName = document.getElementById('discordName').value.trim();
  const password = document.getElementById('password').value;
  socket.emit('player:login', { discordName, password }, (response) => {
    if (response.error) {
      document.getElementById('loginError').textContent = response.error;
    } else {
      // чекаємо player:state
    }
  });
});

function renderPlayer() {
  document.getElementById('nickname').textContent = playerData.nickname;
  document.getElementById('level').textContent = playerData.level;
  document.getElementById('freePoints').textContent = playerData.freePoints;
  document.getElementById('characterClass').textContent = playerData.className || 'Новачок';
  const nextXp = xpForNextLevel(playerData.level);
  const xpPercent = Math.min((playerData.xp / nextXp) * 100, 100);
  document.getElementById('xpBar').value = xpPercent;
  document.getElementById('xpText').textContent = `${playerData.xp} / ${nextXp}`;

  const hpPercent = (playerData.maxHp > 0) ? (playerData.hp / playerData.maxHp) * 100 : 0;
  document.getElementById('hpBar').value = hpPercent;
  document.getElementById('hpText').textContent = `${playerData.hp} / ${playerData.maxHp}`;

  const manaPercent = (playerData.maxMana > 0) ? (playerData.currentMana / playerData.maxMana) * 100 : 0;
  document.getElementById('manaBar').value = manaPercent;
  document.getElementById('manaText').textContent = `${playerData.currentMana} / ${playerData.maxMana}`;

  const statsList = document.getElementById('statsList');
  statsList.innerHTML = '';
  for (const [stat, value] of Object.entries(playerData.stats)) {
    const row = document.createElement('div');
    row.innerHTML = `
      <span>${stat}: ${value}</span>
      <button class="plusBtn" data-stat="${stat}" ${playerData.freePoints <= 0 ? 'disabled' : ''}>+</button>
    `;
    statsList.appendChild(row);
  }

  document.querySelectorAll('.plusBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const stat = btn.dataset.stat;
      socket.emit('player:spendPoint', { statName: stat, delta: 1 }, (response) => {
        if (response.error) alert(response.error);
      });
    });
  });
}

function xpForNextLevel(level) {
  return Math.floor(100 + (level * 150) + Math.pow(level, 2) * 50);
}