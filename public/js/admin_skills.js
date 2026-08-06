const socket = io();
let selectedPlayer = null; // discordName вибраного гравця

// ---- Логін адміна ----
document.getElementById('adminLoginBtn').addEventListener('click', () => {
  const pass = document.getElementById('adminPass').value;
  socket.emit('admin:login', { password: pass }, (res) => {
    if (res.error) {
      document.getElementById('adminLoginError').textContent = res.error;
      return;
    }
    document.getElementById('adminLoginBlock').style.display = 'none';
    document.getElementById('adminMain').style.display = 'block';
    initAdmin();
  });
});

function initAdmin() {
  // Перемикання вкладок
  document.querySelectorAll('.tablink').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // Завантаження даних
  loadComponents();
  loadPassiveSkills();
  loadPlayers();
  loadSettings();

  // Обробники створення
  document.getElementById('createComponentBtn').addEventListener('click', createComponent);
  document.getElementById('createSkillBtn').addEventListener('click', createSkill);
  document.getElementById('updateMaxScripts').addEventListener('click', updateMaxScripts);

  // Обробник вибору гравця
  document.getElementById('playerSelect').addEventListener('change', onPlayerSelect);
  document.getElementById('addCompToPlayer').addEventListener('click', addComponentToPlayer);
  document.getElementById('addSkillToPlayer').addEventListener('click', addSkillToPlayer);
}

// ---- Компоненти ----
function loadComponents() {
  socket.emit('component:getAll', (res) => {
    if (!res.success) return;
    const list = document.getElementById('componentsList');
    list.innerHTML = res.components.map(c => `
      <div style="border-bottom:1px solid var(--border); padding:4px;">
        <b>${c.name}</b> (${c.type}, ${c.rarity})
        <button class="neon-btn danger-btn" onclick="deleteComponent('${c._id}')">×</button>
      </div>`).join('');
  });
}

function createComponent() {
  const data = {
    name: document.getElementById('compName').value,
    type: document.getElementById('compType').value,
    category: document.getElementById('compCategory').value,
    rarity: document.getElementById('compRarity').value,
    description: document.getElementById('compDesc').value,
    limitations: document.getElementById('compLim').value,
    source: document.getElementById('compSource').value
  };
  socket.emit('component:create', data, (res) => {
    if (res.error) return alert(res.error);
    loadComponents();
    clearComponentForm();
  });
}

function deleteComponent(id) {
  if (!confirm('Видалити компонент?')) return;
  socket.emit('component:delete', id, (res) => {
    if (res.error) return alert(res.error);
    loadComponents();
  });
}

// ---- Пасивні навички ----
function loadPassiveSkills() {
  socket.emit('passiveSkill:getAll', (res) => {
    if (!res.success) return;
    const list = document.getElementById('skillsList');
    list.innerHTML = res.skills.map(s => `
      <div style="border-bottom:1px solid var(--border); padding:4px;">
        <b>${s.name}</b> (${s.rarity})
        <button class="neon-btn danger-btn" onclick="deleteSkill('${s._id}')">×</button>
      </div>`).join('');
  });
}

function createSkill() {
  const data = {
    name: document.getElementById('skillName').value,
    rarity: document.getElementById('skillRarity').value,
    description: document.getElementById('skillDesc').value,
    source: document.getElementById('skillSource').value
  };
  socket.emit('passiveSkill:create', data, (res) => {
    if (res.error) return alert(res.error);
    loadPassiveSkills();
  });
}

function deleteSkill(id) {
  if (!confirm('Видалити навичку?')) return;
  socket.emit('passiveSkill:delete', id, (res) => {
    if (res.error) return alert(res.error);
    loadPassiveSkills();
  });
}

// ---- Гравці ----
function loadPlayers() {
  socket.emit('admin:playerList', (res) => {  // Ми створимо цю подію на сервері, або використаємо admin:login колбек. Тут припустимо, що ми маємо окремий запит. Можна обійтися: при логіні ми вже отримали список, збережемо його.
    // Якщо ви не додали admin:playerList як окремий обробник, можна скористатися тим, що при логіні ми його отримали, і зберегти глобально.
    // Для простоти я зроблю запит через admin:getPlayerList, який треба додати в серверну частину (нижче).
  });
  // Оскільки ми не маємо окремого обробника, використаємо дані з логіну (якщо ми їх зберегли). Але краще додати універсальний запит.
  // Тому я реалізую через сокет: при логіні ми отримуємо список, збережемо в змінну. Або зробимо запит admin:requestPlayerList.
  // Для повноти я додам нижче необхідний серверний обробник. А в цьому коді викличемо його.
  socket.emit('admin:getPlayerList', (players) => {
    const select = document.getElementById('playerSelect');
    select.innerHTML = '<option value="">-- Оберіть --</option>';
    players.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.discordName;
      opt.textContent = `${p.nickname} (${p.discordName})`;
      select.appendChild(opt);
    });
    // Також заповнимо списки компонентів та навичок для додавання
    fillAllComponentsSelect();
    fillAllSkillsSelect();
  });
}

function fillAllComponentsSelect() {
  socket.emit('component:getAll', (res) => {
    if (!res.success) return;
    const sel = document.getElementById('allComponentsSelect');
    sel.innerHTML = '';
    res.components.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c._id;
      opt.textContent = `${c.name} (${c.type})`;
      sel.appendChild(opt);
    });
  });
}

function fillAllSkillsSelect() {
  socket.emit('passiveSkill:getAll', (res) => {
    if (!res.success) return;
    const sel = document.getElementById('allSkillsSelect');
    sel.innerHTML = '';
    res.skills.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s._id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
  });
}

function onPlayerSelect() {
  const discordName = document.getElementById('playerSelect').value;
  if (!discordName) {
    document.getElementById('playerActions').style.display = 'none';
    return;
  }
  selectedPlayer = discordName;
  // Отримуємо деталі гравця (інвентар, навички) через admin:getPlayer
  socket.emit('admin:getPlayer', discordName, (err, data) => {
    if (err) return alert(err);
    displayPlayerInventory(data.inventory);
    displayPlayerPassives(data.passiveSkills);
    document.getElementById('playerActions').style.display = 'block';
  });
}

function displayPlayerInventory(inventory) {
  const div = document.getElementById('playerInventory');
  if (!inventory || inventory.length === 0) {
    div.innerHTML = '<p>Немає компонентів</p>';
    return;
  }
  div.innerHTML = inventory.map(c => `
    <div><b>${c.name}</b> (${c.type}) 
      <button class="neon-btn danger-btn" onclick="removeComponentFromPlayer('${c._id}')">×</button>
    </div>`).join('');
}

function displayPlayerPassives(skills) {
  const div = document.getElementById('playerPassives');
  if (!skills || skills.length === 0) {
    div.innerHTML = '<p>Немає навичок</p>';
    return;
  }
  div.innerHTML = skills.map(s => `
    <div><b>${s.name}</b> 
      <button class="neon-btn danger-btn" onclick="removeSkillFromPlayer('${s._id}')">×</button>
    </div>`).join('');
}

function addComponentToPlayer() {
  const compId = document.getElementById('allComponentsSelect').value;
  if (!compId || !selectedPlayer) return;
  socket.emit('component:addToPlayer', { discordName: selectedPlayer, componentId: compId }, (res) => {
    if (res.error) return alert(res.error);
    onPlayerSelect(); // оновити
  });
}

function addSkillToPlayer() {
  const skillId = document.getElementById('allSkillsSelect').value;
  if (!skillId || !selectedPlayer) return;
  socket.emit('passiveSkill:addToPlayer', { discordName: selectedPlayer, skillId }, (res) => {
    if (res.error) return alert(res.error);
    onPlayerSelect();
  });
}

function removeComponentFromPlayer(compId) {
  if (!selectedPlayer) return;
  socket.emit('component:removeFromPlayer', { discordName: selectedPlayer, componentId: compId }, (res) => {
    if (res.error) return alert(res.error);
    onPlayerSelect();
  });
}

function removeSkillFromPlayer(skillId) {
  if (!selectedPlayer) return;
  socket.emit('passiveSkill:removeFromPlayer', { discordName: selectedPlayer, skillId }, (res) => {
    if (res.error) return alert(res.error);
    onPlayerSelect();
  });
}

// ---- Налаштування ----
function loadSettings() {
  socket.emit('settings:get', (data) => {
    document.getElementById('maxScriptsInput').value = data.maxScripts || 3;
  });
}

function updateMaxScripts() {
  const val = parseInt(document.getElementById('maxScriptsInput').value);
  if (isNaN(val) || val < 1) return alert('Мінімум 1');
  socket.emit('settings:update', { maxScripts: val }, (res) => {
    if (res.error) return alert(res.error);
    alert('Оновлено');
  });
}