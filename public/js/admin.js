const socket = io();
let selectedPlayerId = null;

// Логін
document.getElementById('adminEnter').addEventListener('click', () => {
  const pass = document.getElementById('adminPass').value;
  socket.emit('admin:login', { password: pass }, (res) => {
    if (res.error) {
      document.getElementById('adminError').textContent = res.error;
    } else {
      document.getElementById('adminLoginForm').style.display = 'none';
      document.getElementById('adminContent').style.display = 'block';
      renderPlayerList(res.players);
      setupSocketListeners();
    }
  });
});

function renderPlayerList(list) {
  const listDiv = document.getElementById('playerList');
  listDiv.innerHTML = '';
  list.forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = `${p.nickname} (${p.discordName}) lvl ${p.level}`;
    btn.style.display = 'block';
    btn.style.margin = '5px 0';
    btn.className = 'neon-btn';
    btn.addEventListener('click', () => selectPlayer(p.discordName));
    listDiv.appendChild(btn);
  });
}

function selectPlayer(discordName) {
  selectedPlayerId = discordName;
  socket.emit('admin:getPlayer', discordName, (err, data) => {
    if (err) return alert(err);
    displayPlayerData(data);
    document.getElementById('selectedPlayer').style.display = 'block';
  });
}

function displayPlayerData(p) {
  document.getElementById('selNickname').textContent = p.nickname;
  document.getElementById('selClass').textContent = p.className;
  document.getElementById('selLevel').textContent = p.level;
  document.getElementById('selHp').textContent = p.hp;
  document.getElementById('selMaxHp').textContent = p.maxHp;
  document.getElementById('selMana').textContent = p.currentMana;
  document.getElementById('selMaxMana').textContent = p.maxMana;
  document.getElementById('selXp').textContent = p.xp;
  document.getElementById('selNextXp').textContent = xpForNextLevel(p.level);
  document.getElementById('selFreePoints').textContent = p.freePoints;

const statsDiv = document.getElementById('adminStats');
  statsDiv.innerHTML = '';
  for (const [stat, val] of Object.entries(p.stats)) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <span class="stat-name">${stat}</span>
      <span class="stat-value">${val}</span>
      <button class="neon-btn stat-plus" data-stat="${stat}">+</button>
      <button class="neon-btn danger-btn stat-minus" data-stat="${stat}">-</button>
    `;
    statsDiv.appendChild(row);
  }
  document.querySelectorAll('.stat-plus').forEach(btn => {
    btn.onclick = () => changeStat(btn.dataset.stat, 1);
  });
  document.querySelectorAll('.stat-minus').forEach(btn => {
    btn.onclick = () => changeStat(btn.dataset.stat, -1);
  });

  // Ефекти з кнопкою видалення
  const effDiv = document.getElementById('currentEffects');
  effDiv.innerHTML = '';
  if (p.effects) {
    p.effects.forEach((eff, index) => {
      const span = document.createElement('span');
      span.className = 'effect-icon';
      span.style.backgroundImage = `url('icons/${eff.icon}.png')`;
      span.dataset.tooltip = eff.name;
      if (!eff.icon) span.textContent = eff.name.substring(0,2);
      // Кнопка видалення
      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.className = 'neon-btn danger-btn';
      delBtn.style.marginLeft = '5px';
      delBtn.onclick = () => {
        socket.emit('admin:removeEffect', { discordName: selectedPlayerId, effectIndex: index });
      };
      span.appendChild(delBtn);
      effDiv.appendChild(span);
    });
  }
}

function changeStat(stat, delta) {
  socket.emit('admin:updatePlayer', {
    discordName: selectedPlayerId,
    field: 'stat',
    value: { statName: stat, delta: delta }
  }, (res) => { if (res.error) alert(res.error); });
}

function setupSocketListeners() {
  socket.on('admin:playerUpdated', (player) => {
    if (selectedPlayerId === player.discordName) {
      displayPlayerData(player);
    }
  });

  // HP
  document.getElementById('healBtn').onclick = () => {
    const delta = parseInt(document.getElementById('hpDeltaInput').value) || 0;
    updatePlayer('hp', null, delta);
  };
  document.getElementById('damageBtn').onclick = () => {
    const delta = -(parseInt(document.getElementById('hpDeltaInput').value) || 0);
    updatePlayer('hp', null, delta);
  };

  // MP
  document.getElementById('manaPlusBtn').onclick = () => {
    const delta = parseInt(document.getElementById('manaDeltaInput').value) || 0;
    updatePlayer('mana', null, delta);
  };
  document.getElementById('manaMinusBtn').onclick = () => {
    const delta = -(parseInt(document.getElementById('manaDeltaInput').value) || 0);
    updatePlayer('mana', null, delta);
  };

  // XP
  document.getElementById('addXpBtn').onclick = () => {
    const delta = parseInt(document.getElementById('xpDeltaInput').value) || 0;
    updatePlayer('xp', null, delta);
  };
  document.getElementById('subtractXpBtn').onclick = () => {
    const delta = -(parseInt(document.getElementById('xpDeltaInput').value) || 0);
    updatePlayer('xp', null, delta);
  };

  // Вільні очки
  document.getElementById('addPointBtn').onclick = () => updatePlayer('freePoints', null, 1);
  document.getElementById('removePointBtn').onclick = () => updatePlayer('freePoints', null, -1);

  // Зміна імені/класу
  document.getElementById('changeNameBtn').onclick = () => { /* як раніше */ };
  document.getElementById('changeClassBtn').onclick = () => { /* як раніше */ };

  // Ефекти – додавання
  document.getElementById('addEffectBtn').onclick = () => {
    const effectKey = document.getElementById('effectSelect').value;
    socket.emit('admin:addEffect', { discordName: selectedPlayerId, effect: effectKey });
  };

  // Видалення гравця
  document.getElementById('deletePlayerBtn').onclick = () => {
    if (confirm('Ви впевнені?')) {
      socket.emit('admin:deletePlayer', { discordName: selectedPlayerId }, (res) => {
        if (res.error) alert(res.error);
        else {
          selectedPlayerId = null;
          document.getElementById('selectedPlayer').style.display = 'none';
          socket.emit('admin:refreshList');
        }
      });
    }
  };
}

function updatePlayer(field, value, delta, isPoints = false) {
  if (!selectedPlayerId) return;
  const payload = { discordName: selectedPlayerId, field };
  if (delta !== undefined && delta !== null) payload.delta = delta;
  else payload.value = value;
  socket.emit('admin:updatePlayer', payload, (res) => {
    if (res.error) alert(res.error);
  });
}

function xpForNextLevel(level) {
  return Math.floor(100 + (level * 150) + Math.pow(level, 2) * 50);
}

// Навігація адміна
document.getElementById('navChar').addEventListener('click', () => { /* активна панель */ });
document.getElementById('navInfo').addEventListener('click', () => alert('Інфо'));
document.getElementById('navMap').addEventListener('click', () => alert('Мапа'));
document.getElementById('navLogout').addEventListener('click', () => {
  window.location.href = 'index.html';
});

// Оновлення списку гравців при зміні
socket.on('admin:playerList', renderPlayerList);