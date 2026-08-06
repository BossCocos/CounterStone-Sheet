const socket = io();
let playerData = null;
let selectedComponentId = null;
let currentScriptIndex = -1; // індекс скрипта, що редагується
const slots = { trigger: null, core: null, vector: null };

const savedToken = sessionStorage.getItem('authToken');
if (savedToken) {
  socket.emit('auth:token', savedToken, (res) => {
    if (res.success && !res.isAdmin) {
      loginContainer.style.display = 'none';
      playerContainer.style.display = 'block';
      // player:state прийде автоматично
    } else {
      sessionStorage.removeItem('authToken');
      loginContainer.style.display = 'block';
    }
  });
} else {
  loginContainer.style.display = 'block';
}
// ---- Авторизація ----
const loginBlock = document.getElementById('loginBlock');
const skillsMain = document.getElementById('skillsMain');
const loginDiscord = document.getElementById('loginDiscord');
const loginPass = document.getElementById('loginPass');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');

// Перевіряємо, чи є збережений playerId (можна використати для автозаповнення)
const savedId = sessionStorage.getItem('playerId');
if (savedId) {
  loginDiscord.value = savedId;
  loginBlock.style.display = 'block';
} else {
  loginBlock.style.display = 'block';
}

loginBtn.addEventListener('click', () => {
  const name = loginDiscord.value.trim();
  const pass = loginPass.value;
  if (!name || !pass) return;
  socket.emit('player:login', { discordName: name, password: pass }, (resp) => {
    if (resp.error) {
      loginError.textContent = resp.error;
      return;
    } else {
            sessionStorage.setItem('authToken', res.token);
    }
    // Успіх – зберігаємо ID та показуємо інтерфейс
    sessionStorage.setItem('playerId', name);
    loginBlock.style.display = 'none';
    skillsMain.style.display = 'block';
    // Запитуємо початковий стан (хоча player:state прийде після логіну)
  });
});

// ---- Отримання даних гравця ----
socket.on('player:state', (data) => {
  playerData = data;
  renderInventory();
  renderScripts();
  updateCombineButton();
});

// ---- Взаємодія зі слотами ----
document.querySelectorAll('.slot').forEach(slot => {
  slot.addEventListener('click', () => {
    const slotType = slot.dataset.slot;
    if (!selectedComponentId || !playerData) return;

    const comp = playerData.inventory.find(c => c._id === selectedComponentId);
    if (!comp) return;
    if (comp.type.toLowerCase() !== slotType) {
      alert(`Для слота "${slotType}" потрібен компонент типу "${slotType}"`);
      return;
    }

    // Перевіряємо, чи цей компонент вже не використаний в іншому слоті
    if (Object.values(slots).some(s => s && s._id === comp._id)) {
      alert('Цей компонент вже використаний в іншому слоті');
      return;
    }

    // Встановлюємо компонент у слот
    slots[slotType] = comp;
    slot.textContent = comp.name;
    slot.classList.add('filled');
    // Забираємо видимість вибраного компонента (можна підсвічувати)
    selectedComponentId = null;
    clearSelection();
    updateCombineButton();
  });
});

// ---- Інвентар ----
function renderInventory() {
  const invList = document.getElementById('invList');
  invList.innerHTML = '';
  if (!playerData.inventory || playerData.inventory.length === 0) {
    invList.innerHTML = '<p style="color:var(--text-dim);">Немає компонентів</p>';
    return;
  }
  playerData.inventory.forEach(comp => {
    // Перевіряємо, чи компонент вже використаний у слотах (тимчасово)
    const used = Object.values(slots).some(s => s && s._id === comp._id);
    const div = document.createElement('div');
    div.className = 'component-item' + (used ? ' used' : '');
    div.textContent = `${comp.name} (${comp.type})`;
    if (!used) {
      div.addEventListener('click', () => {
        // Вибираємо компонент
        clearSelection();
        div.classList.add('selected');
        selectedComponentId = comp._id;
      });
    } else {
      div.style.opacity = '0.5';
      div.title = 'Вже в слоті';
    }
    invList.appendChild(div);
  });
}

function clearSelection() {
  document.querySelectorAll('.component-item').forEach(el => el.classList.remove('selected'));
}

// ---- Скрипти ----
function renderScripts() {
  const container = document.getElementById('scriptsContainer');
  container.innerHTML = '';
  if (!playerData.scripts || playerData.scripts.length === 0) {
    container.innerHTML = '<p>Немає створених скриптів</p>';
    return;
  }
  playerData.scripts.forEach((script, idx) => {
    const div = document.createElement('div');
    div.className = 'script-entry';
    div.innerHTML = `
      <strong>${script.name || 'Без назви'}</strong>
      <span style="color:var(--text-dim);">(${script.componentDetails.map(c=>c.component.name).join(', ')})</span>
      <button class="neon-btn editScript" data-index="${idx}">✏️ Редагувати</button>
      <button class="neon-btn danger-btn disassembleScript" data-index="${idx}">💔 Роз'єднати</button>
    `;
    container.appendChild(div);
  });

  // Обробники кнопок
  document.querySelectorAll('.editScript').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      openScriptModal(idx);
    });
  });
  document.querySelectorAll('.disassembleScript').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      if (confirm('Роз\'єднати скрипт? Компоненти повернуться в інвентар.')) {
        socket.emit('script:disassemble', { scriptIndex: idx }, (res) => {
          if (res.error) return alert(res.error);
          // Стан оновиться через player:state
        });
      }
    });
  });
}

// Кнопка "Об'єднати"
document.getElementById('combineBtn').addEventListener('click', () => {
  if (!slots.trigger || !slots.core || !slots.vector) {
    alert('Заповніть всі три слоти різними компонентами');
    return;
  }
  const ids = [slots.trigger._id, slots.core._id, slots.vector._id];
  socket.emit('script:create', { componentIds: ids }, (res) => {
    if (res.error) return alert(res.error);
    // Очищаємо слоти
    clearSlots();
    currentScriptIndex = res.scriptIndex;
    // Відкриваємо модальне вікно для заповнення
    openScriptModal(currentScriptIndex);
  });
});

// Кнопка "Роз'єднати" (для поточного скрипта) – залишимо для швидкого доступу, але вже є в списку
document.getElementById('disassembleBtn').addEventListener('click', () => {
  if (currentScriptIndex === -1) return;
  socket.emit('script:disassemble', { scriptIndex: currentScriptIndex }, (res) => {
    if (res.error) return alert(res.error);
    currentScriptIndex = -1;
    document.getElementById('disassembleBtn').disabled = true;
  });
});

function clearSlots() {
  ['trigger', 'core', 'vector'].forEach(type => {
    slots[type] = null;
    const slotEl = document.querySelector(`.slot.${type}`);
    slotEl.textContent = type === 'trigger' ? 'Тригер' : (type === 'core' ? 'Ядро' : 'Вектор');
    slotEl.classList.remove('filled');
  });
  updateCombineButton();
}

function updateCombineButton() {
  const allFilled = slots.trigger && slots.core && slots.vector;
  document.getElementById('combineBtn').disabled = !allFilled;
  // Роз'єднати можна, тільки якщо є скрипт (currentScriptIndex != -1) – керуємо вручну
}

// ---- Модальне вікно скрипта ----
const modal = document.getElementById('scriptModal');
const codoramaFields = document.getElementById('codoramaFields');
document.getElementById('cancelScript').addEventListener('click', () => {
  modal.classList.remove('active');
});

function openScriptModal(scriptIndex) {
  const script = playerData.scripts[scriptIndex];
  if (!script) return;

  document.getElementById('scriptName').value = script.name || '';
  document.getElementById('scriptDesc').value = script.description || '';
  document.getElementById('scriptOath').value = script.oath || '';

  // Генеруємо поля ролей для кожного компонента
  codoramaFields.innerHTML = '';
  script.componentDetails.forEach((comp, i) => {
    const div = document.createElement('div');
    div.innerHTML = `
      <label>${comp.component.name} (${comp.component.type})</label>
      <input type="text" class="role-input" data-index="${i}" maxlength="100" value="${comp.role || ''}" placeholder="Роль/завдання">
    `;
    codoramaFields.appendChild(div);
  });

  // Зберігаємо індекс для подальшого збереження
  currentScriptIndex = scriptIndex;
  modal.classList.add('active');

  // Обробник збереження
  document.getElementById('saveScript').onclick = () => {
    const name = document.getElementById('scriptName').value.trim();
    const desc = document.getElementById('scriptDesc').value.trim();
    const oath = document.getElementById('scriptOath').value.trim();
    const roles = [];
    document.querySelectorAll('.role-input').forEach(input => {
      roles.push({
        componentId: script.componentDetails[input.dataset.index].component._id,
        role: input.value.substring(0, 100)
      });
    });

    socket.emit('script:update', { scriptIndex, data: { name, description: desc, oath, components: roles } }, (res) => {
      if (res.error) return alert(res.error);
      modal.classList.remove('active');
    });
  };
}

// Очистка при старті
clearSlots();