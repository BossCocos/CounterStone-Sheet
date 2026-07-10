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

  // Ефекти
  const effDiv = document.getElementById('currentEffects');
  effDiv.innerHTML = '';
  if (p.effects) {
    p.effects.forEach(e => {
      const span = document.createElement('span');
      span.textContent = e.name + ' ';
      span.className = 'effect-icon';
      effDiv.appendChild(span);
    });
  }
}

function setupSocketListeners() {
  socket.on('admin:playerUpdated', (player) => {
    if (selectedPlayerId === player.discordName) {
      displayPlayerData(player);
    }
  });

  // Кнопки HP/MP/XP/Points (дельта)
  document.getElementById('healBtn').onclick = () => updatePlayer('hp', null, 1);
  document.getElementById('damageBtn').onclick = () => updatePlayer('hp', null, -1);
  document.getElementById('manaPlusBtn').onclick = () => updatePlayer('mana', null, 1);
  document.getElementById('manaMinusBtn').onclick = () => updatePlayer('mana', null, -1);
  document.getElementById('addXpBtn').onclick = () => {
    const delta = parseInt(document.getElementById('xpDeltaInput').value) || 0;
    updatePlayer('xp', null, delta);
  };
  document.getElementById('subtractXpBtn').onclick = () => {
    const delta = -(parseInt(document.getElementById('xpDeltaInput').value) || 0);
    updatePlayer('xp', null, delta);
  };
  document.getElementById('addPointBtn').onclick = () => updatePlayer('freePoints', null, 1, true);
  document.getElementById('removePointBtn').onclick = () => updatePlayer('freePoints', null, -1, true);

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

  // Ефекти
  document.getElementById('addEffectBtn').onclick = () => {
    const effectKey = document.getElementById('effectSelect').value;
    socket.emit('admin:addEffect', { discordName: selectedPlayerId, effect: effectKey });
  };

  // Видалення гравця
  document.getElementById('deletePlayerBtn').onclick = () => {
    if (confirm('Ви впевнені, що хочете видалити цього гравця?')) {
      socket.emit('admin:deletePlayer', { discordName: selectedPlayerId }, (res) => {
        if (res.error) alert(res.error);
        else {
          selectedPlayerId = null;
          document.getElementById('selectedPlayer').style.display = 'none';
          // Оновити список (можна запросити заново)
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