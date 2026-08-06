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
  document.getElementById('selNickname').textContent = p.nickname || '—';
  document.getElementById('selClass').textContent = p.className || 'Новачок';
  document.getElementById('selLevel').textContent = p.level;
  document.getElementById('selHp').textContent = p.hp;
  document.getElementById('selMaxHp').textContent = p.maxHp;
  document.getElementById('selMana').textContent = p.currentMana;
  document.getElementById('selMaxMana').textContent = p.maxMana;
  document.getElementById('selXp').textContent = p.xp;
  document.getElementById('selNextXp').textContent = xpForNextLevel(p.level);
  document.getElementById('selFreePoints').textContent = p.freePoints;

  // Характеристики
  const statsDiv = document.getElementById('adminStats');
  statsDiv.innerHTML = '';
  for (const [stat, val] of Object.entries(p.stats || {})) {
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

  // Ефекти
  const effDiv = document.getElementById('currentEffects');
  effDiv.innerHTML = '';
  if (p.effects && p.effects.length) {
    p.effects.forEach((eff, index) => {
      const wrapper = document.createElement('span');
      wrapper.className = 'effect-wrapper';

      const icon = document.createElement('span');
      icon.className = 'effect-icon';
      icon.style.backgroundImage = `url('icons/${eff.icon}.png')`;
      icon.style.backgroundSize = 'cover';  // про всяк випадок
      icon.dataset.tooltip = eff.name;
      if (!eff.icon) icon.textContent = eff.name.substring(0,2);

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-effect-btn';
      delBtn.textContent = '✕';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        socket.emit('admin:removeEffect', { discordName: selectedPlayerId, effectIndex: index });
      };

      wrapper.appendChild(icon);
      wrapper.appendChild(delBtn);
      effDiv.appendChild(wrapper);
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
  document.getElementById('healBtn').onclick = () => updateWithDelta('hp', 'hpDeltaInput', 1);
  document.getElementById('damageBtn').onclick = () => updateWithDelta('hp', 'hpDeltaInput', -1);

  // MP
  document.getElementById('manaPlusBtn').onclick = () => updateWithDelta('mana', 'manaDeltaInput', 1);
  document.getElementById('manaMinusBtn').onclick = () => updateWithDelta('mana', 'manaDeltaInput', -1);

  // XP
  document.getElementById('addXpBtn').onclick = () => updateWithDelta('xp', 'xpDeltaInput', 1);
  document.getElementById('subtractXpBtn').onclick = () => updateWithDelta('xp', 'xpDeltaInput', -1);

  // Вільні очки
  document.getElementById('addPointBtn').onclick = () => updatePlayer('freePoints', null, 1);
  document.getElementById('removePointBtn').onclick = () => updatePlayer('freePoints', null, -1);

  // Зміна імені/класу
  document.getElementById('changeNameBtn').onclick = () => {
    const newName = document.getElementById('newNickname').value.trim();
    if (!newName) return alert('Введіть ім\'я');
    socket.emit('admin:requestNameChange', { discordName: selectedPlayerId, newName });
  };
  document.getElementById('changeClassBtn').onclick = () => {
    const newClass = document.getElementById('newClass').value.trim();
    if (!newClass) return alert('Введіть клас');
    socket.emit('admin:requestClassChange', { discordName: selectedPlayerId, newClass });
  };

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

function updateWithDelta(field, inputId, sign) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const delta = (parseInt(input.value) || 0) * sign;
  updatePlayer(field, null, delta);
}

function updatePlayer(field, value, delta) {
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

// Навігація
document.getElementById('navChar').addEventListener('click', () => alert('Характеристики'));
document.getElementById('navInfo').addEventListener('click', () => alert('Інфо'));
document.getElementById('navMap').addEventListener('click', () => alert('Мапа'));
document.getElementById('navSkills').addEventListener('click', () => {window.location.href = 'admin_skills.html';});
document.getElementById('navTavern').addEventListener('click', () => alert('Таверна'));
document.getElementById('navChat').addEventListener('click', () => alert('Чат'));
document.getElementById('navLogout').addEventListener('click', () => {
  window.location.href = 'index.html';
});

socket.on('admin:playerList', renderPlayerList);