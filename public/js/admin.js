const socket = io();
let selectedPlayerId = null;

document.getElementById('adminEnter').addEventListener('click', () => {
  const pass = document.getElementById('adminPass').value;
  socket.emit('admin:login', { password: pass }, (res) => {
    if (res.error) {
      document.getElementById('adminError').textContent = res.error;
    } else {
      document.getElementById('adminLoginForm').style.display = 'none';
      document.getElementById('adminContent').style.display = 'block';
      // Отримуємо список одразу з res.players
      renderPlayerList(res.players);
      // Підписуємось на майбутні оновлення
      socket.on('admin:playerList', renderPlayerList); // не обов'язково, але для динаміки
      socket.on('admin:playerUpdated', (player) => {
        if (selectedPlayerId === player.discordName) {
          displayPlayerData(player);
        }
      });
      // Налаштовуємо кнопки дій для обраного гравця
      setupAdminActions();
    }
  });
});

function renderPlayerList(list) {
  const listDiv = document.getElementById('playerList');
  listDiv.innerHTML = '<h3>Гравці:</h3>';
  list.forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = `${p.nickname} (${p.discordName}) lvl ${p.level}`;
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
  document.getElementById('selLevel').textContent = p.level;
  document.getElementById('xpInput').value = p.xp;
  document.getElementById('hpInput').value = p.hp;
  document.getElementById('manaInput').value = p.currentMana;

  const statsDiv = document.getElementById('adminStats');
  statsDiv.innerHTML = '';
  for (const [stat, val] of Object.entries(p.stats)) {
    const row = document.createElement('div');
    row.innerHTML = `
      <span>${stat}: ${val}</span>
      <button class="statPlus" data-stat="${stat}">+</button>
      <button class="statMinus" data-stat="${stat}">-</button>
    `;
    statsDiv.appendChild(row);
  }
  // Прив'язуємо події до кнопок статів (тут вони створюються динамічно)
  document.querySelectorAll('.statPlus').forEach(btn => {
    btn.onclick = () => changeStat(btn.dataset.stat, 1);
  });
  document.querySelectorAll('.statMinus').forEach(btn => {
    btn.onclick = () => changeStat(btn.dataset.stat, -1);
  });
}

function changeStat(stat, delta) {
  socket.emit('admin:updatePlayer', {
    discordName: selectedPlayerId,
    field: 'stat',
    value: { statName: stat, delta: delta }
  }, (res) => {
    if (res.error) alert(res.error);
  });
}

function setupAdminActions() {
  // XP
  document.getElementById('addXpBtn').onclick = () => {
    const delta = parseInt(document.getElementById('xpInput').value) || 0;
    socket.emit('admin:updatePlayer', { discordName: selectedPlayerId, field: 'xp', delta }, (res) => {
      if (res.error) alert(res.error);
    });
  };
  document.getElementById('subtractXpBtn').onclick = () => {
    const delta = -(parseInt(document.getElementById('xpInput').value) || 0);
    socket.emit('admin:updatePlayer', { discordName: selectedPlayerId, field: 'xp', delta }, (res) => {
      if (res.error) alert(res.error);
    });
  };

  // HP
  document.getElementById('setHpBtn').onclick = () => {
    const val = parseInt(document.getElementById('hpInput').value);
    socket.emit('admin:updatePlayer', { discordName: selectedPlayerId, field: 'hp', value: val }, (res) => {
      if (res.error) alert(res.error);
    });
  };
  document.getElementById('healHpBtn').onclick = () => {
    socket.emit('admin:updatePlayer', { discordName: selectedPlayerId, field: 'hp', delta: 1 }, (res) => {
      if (res.error) alert(res.error);
    });
  };
  document.getElementById('damageHpBtn').onclick = () => {
    socket.emit('admin:updatePlayer', { discordName: selectedPlayerId, field: 'hp', delta: -1 }, (res) => {
      if (res.error) alert(res.error);
    });
  };

  // MP
  document.getElementById('setManaBtn').onclick = () => {
    const val = parseInt(document.getElementById('manaInput').value);
    socket.emit('admin:updatePlayer', { discordName: selectedPlayerId, field: 'mana', value: val }, (res) => {
      if (res.error) alert(res.error);
    });
  };
  document.getElementById('restoreManaBtn').onclick = () => {
    socket.emit('admin:updatePlayer', { discordName: selectedPlayerId, field: 'mana', delta: 1 }, (res) => {
      if (res.error) alert(res.error);
    });
  };
  document.getElementById('drainManaBtn').onclick = () => {
    socket.emit('admin:updatePlayer', { discordName: selectedPlayerId, field: 'mana', delta: -1 }, (res) => {
      if (res.error) alert(res.error);
    });
  };
}