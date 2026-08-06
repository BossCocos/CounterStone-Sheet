const socket = io();
let selectedPlayer = null;
let allPlayers = []; // збережемо список гравців

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

  // Редагування компонента
  document.getElementById('saveEditComponent').addEventListener('click', saveEditComponent);
  document.getElementById('cancelEditComponent').addEventListener('click', () => {
    document.getElementById('editComponentModal').classList.remove('active');
  });

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
        <button class="neon-btn" onclick="editComponent('${c._id}')">✏️</button>
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

function editComponent(id) {
  // Отримуємо всі компоненти, щоб знайти потрібний
  socket.emit('component:getAll', (res) => {
    if (!res.success) return;
    const comp = res.components.find(c => c._id === id);
    if (!comp) return;
    document.getElementById('editCompId').value = comp._id;
    document.getElementById('editCompName').value = comp.name;
    document.getElementById('editCompType').value = comp.type;
    document.getElementById('editCompCategory').value = comp.category;
    document.getElementById('editCompRarity').value = comp.rarity;
    document.getElementById('editCompDesc').value = comp.description || '';
    document.getElementById('editCompLim').value = comp.limitations || '';
    document.getElementById('editCompSource').value = comp.source || '';
    document.getElementById('editComponentModal').classList.add('active');
  });
}

function saveEditComponent() {
  const id = document.getElementById('editCompId').value;
  const data = {
    name: document.getElementById('editCompName').value,
    type: document.getElementById('editCompType').value,
    category: document.getElementById('editCompCategory').value,
    rarity: document.getElementById('editCompRarity').value,
    description: document.getElementById('editCompDesc').value,
    limitations: document.getElementById('editCompLim').value,
    source: document.getElementById('editCompSource').value
  };
  socket.emit('component:update', { componentId: id, data }, (res) => {
    if (res.error) return alert(res.error);
    document.getElementById('editComponentModal').classList.remove('active');
    loadComponents();
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
  socket.emit('admin:getPlayerList', (players) => {
    allPlayers = players;
    const select = document.getElementById('playerSelect');
    select.innerHTML = '<option value="">-- Оберіть --</option>';
    players.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.discordName;
      opt.textContent = `${p.nickname} (${p.discordName})`;
      select.appendChild(opt);
    });
    // Заповнюємо списки компонентів та навичок
    fillSelects();
  });
}

function fillSelects() {
  socket.emit('component:getAll', (res) => {
    if (!res.success) return;
    const compSelect = document.getElementById('allComponentsSelect');
    compSelect.innerHTML = '';
    res.components.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c._id;
      opt.textContent = `${c.name} (${c.type})`;
      compSelect.appendChild(opt);
    });
  });
  socket.emit('passiveSkill:getAll', (res) => {
    if (!res.success) return;
    const skillSelect = document.getElementById('allSkillsSelect');
    skillSelect.innerHTML = '';
    res.skills.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s._id;
      opt.textContent = s.name;
      skillSelect.appendChild(opt);
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
  socket.emit('admin:getPlayer', discordName, (err, data) => {
    if (err) return alert(err);
    displayPlayerInventory(data.inventory);
    displayPlayerPassives(data.passiveSkills);
    displayPlayerScripts(data.scripts);
    document.getElementById('playerActions').style.display = 'block';
  });
}

function displayPlayerInventory(inventory) {
  const div = document.getElementById('playerInventory');
  if (!inventory || inventory.length === 0) {
    div.innerHTML = '<p>Немає компонентів</p>';
    return;
  }
  div.innerHTML = '<ul>' + inventory.map(c => 
    `<li>${c.name} (${c.type}, ${c.rarity}) <button class="neon-btn danger-btn" onclick="removeComponentFromPlayer('${c._id}')">×</button></li>`
  ).join('') + '</ul>';
}

function displayPlayerPassives(skills) {
  const div = document.getElementById('playerPassives');
  if (!skills || skills.length === 0) {
    div.innerHTML = '<p>Немає навичок</p>';
    return;
  }
  div.innerHTML = '<ul>' + skills.map(s => 
    `<li>${s.name} (${s.rarity}) <button class="neon-btn danger-btn" onclick="removeSkillFromPlayer('${s._id}')">×</button></li>`
  ).join('') + '</ul>';
}

function displayPlayerScripts(scripts) {
  const div = document.getElementById('playerScripts');
  if (!scripts || scripts.length === 0) {
    div.innerHTML = '<p>Немає скриптів</p>';
    return;
  }
  div.innerHTML = scripts.map(s => `
    <div style="border:1px solid var(--border); margin:4px; padding:4px;">
      <b>${s.name || 'Без назви'}</b>
      <p>${s.description || ''}</p>
      <small>Компоненти: ${s.componentDetails.map(c=>c.component.name).join(', ')}</small>
    </div>
  `).join('');
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