const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const path = require('path');

// ====== КОНФІГУРАЦІЯ ======
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;  // можна змінити на свій пароль або використовувати змінну середовища
const MONGODB_URI = process.env.MONGODB_URI;

// ====== ПІДКЛЮЧЕННЯ ДО БД ======
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB підключено'))
  .catch(err => console.error('Помилка підключення MongoDB:', err));

// ====== МОДЕЛЬ ГРАВЦЯ ======
const playerSchema = new mongoose.Schema({
  nickname: String,
  discordName: { type: String, unique: true },
  passwordHash: String,
  level: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  totalXp: { type: Number, default: 0 },
  freePoints: { type: Number, default: 30 },
  hp: { type: Number, default: 10 },
  maxHp: { type: Number, default: 10 },
  currentMana: { type: Number, default: 50 },
  maxMana: { type: Number, default: 50 },
  effects: [{ name: String, icon: String }],
  stats: {
    сила: { type: Number, default: 0 },
    швидкість: { type: Number, default: 0 },
    ловкість: { type: Number, default: 0 },
    захист: { type: Number, default: 0 },
    інтелект: { type: Number, default: 0 },
    мана: { type: Number, default: 0 },
    здоровя: { type: Number, default: 0 },
    харизма: { type: Number, default: 0 }
  },
  statHistory: [String],
  className: { type: String, default: 'Новачок' },
  classAssignedLevel: { type: Number, default: 0 },
  classAssignedStats: [String],   // дві назви характеристик, з яких складено поточний клас
  inventory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Component' }],
  scripts: [{
    name: String,
    description: String,
    oath: String,           // клятва
    components: [{          // використані компоненти з ролями
      component: { type: mongoose.Schema.Types.ObjectId, ref: 'Component' },
      role: String          // роль/завдання (макс 100 символів)
    }],
    createdAt: { type: Date, default: Date.now }
  }],
  passiveSkills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PassiveSkill' }]
});

const Player = mongoose.model('Player', playerSchema);

const tokenStore = new Map(); // ключ: токен, значення: { discordName, isAdmin, expires }

function generateToken(discordName, isAdmin) {
  const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const expires = Date.now() + 15 * 60 * 1000; // 15 хвилин
  tokenStore.set(token, { discordName, isAdmin, expires });
  // автоматичне видалення після закінчення терміну дії
  setTimeout(() => tokenStore.delete(token), 15 * 60 * 1000);
  return token;
}

function verifyToken(token) {
  const data = tokenStore.get(token);
  if (!data || data.expires < Date.now()) {
    tokenStore.delete(token);
    return null;
  }
  return data;
}


// ====== ДОПОМІЖНІ ФУНКЦІЇ ======
function calcMaxHp(statHealth) {
  if (statHealth <= 0) return 10;
  let total = 10;
  for (let i = 1; i <= statHealth; i++) total += Math.ceil(i / 2);
  return total;
}

function calcMaxMana(level, statMana) {
  return 50 + (level * 8) + (statMana * 6);
}

function xpForNextLevel(level) {
  return Math.floor(100 + (level * 150) + Math.pow(level, 2) * 50);
}

function processXpChange(player, amount) {
  player.xp += amount;
  player.totalXp = Math.max(0, player.totalXp + amount);

  while (player.xp >= xpForNextLevel(player.level)) {
    player.xp -= xpForNextLevel(player.level);
    player.level++;
    player.freePoints += (player.level % 5 === 0) ? 3 : 2;
    checkClassMilestone(player);   // перевірка зміни класу на кратних 10 рівнях
  }
  while (player.xp < 0 && player.level > 0) {
    if (player.level % 5 === 0) player.freePoints -= 3;
    else player.freePoints -= 2;
    player.level--;
    player.xp += xpForNextLevel(player.level);
  }
  player.xp = Math.max(0, player.xp);
  player.freePoints = Math.max(0, player.freePoints);
}

function recalcDerivedStats(player) {
  player.maxHp = calcMaxHp(player.stats.здоровя);
  if (player.hp > player.maxHp) player.hp = player.maxHp;
  player.maxMana = calcMaxMana(player.level, player.stats.мана);
  if (player.currentMana > player.maxMana) player.currentMana = player.maxMana;
}

// Визначення класу за двома найвищими характеристиками
const classMap = {
  "сила-швидкість": "Берсерк", "сила-захист": "Танк", "сила-ловкість": "Воїн",
  "сила-інтелект": "Стратег", "сила-мана": "Варвар", "сила-здоровя": "Джаггернаут",
  "сила-харизма": "Воєвода",
  "швидкість-ловкість": "Скаут", "швидкість-захист": "Дуелянт",
  "швидкість-інтелект": "Стрілок", "швидкість-мана": "Метеор",
  "швидкість-здоровя": "Атлет", "швидкість-харизма": "Трікстер",
  "ловкість-захист": "Монах", "ловкість-інтелект": "Ніндзя",
  "ловкість-мана": "Фокусник", "ловкість-здоровя": "Акробат",
  "ловкість-харизма": "Віртуоз",
  "захист-інтелект": "Інженер", "захист-мана": "Паладин",
  "захист-здоровя": "Титан", "захист-харизма": "Знаменосець",
  "інтелект-мана": "Чарівник", "інтелект-здоровя": "Лікар",
  "інтелект-харизма": "Савант",
  "мана-здоровя": "Жрець", "мана-харизма": "Бард",
  "здоровя-харизма": "Пасіонарій"
};

function determineClass(stats, statHistory) {
  const statNames = Object.keys(stats);
  // сортуємо за спаданням значення, потім за історією (чим пізніше додано – вище)
  statNames.sort((a, b) => {
    if (stats[b] !== stats[a]) return stats[b] - stats[a];
    const idxA = statHistory.lastIndexOf(a);
    const idxB = statHistory.lastIndexOf(b);
    return idxB - idxA;
  });
  const t1 = statNames[0], t2 = statNames[1];
  if (stats[t1] === 0) return "Новачок"; // немає очок взагалі
  return classMap[`${t1}-${t2}`] || classMap[`${t2}-${t1}`] || "Шукач";
}

// Перевірка на зміну класу після підвищення рівня (кратність 10)
function checkClassMilestone(player) {
  if (player.className === 'Новачок') return;            // ще не витрачено 30 очок
  if (player.level % 10 !== 0) return;                  // не кратний 10
  const currentTop = determineTopTwo(player.stats, player.statHistory);
  const storedTop = player.classAssignedStats.sort().join(',');
  if (currentTop !== storedTop) {
    // змінились дві головні характеристики – оновлюємо клас
    player.className = determineClass(player.stats, player.statHistory);
    player.classAssignedStats = currentTop.split(',');
    player.classAssignedLevel = player.level;
    // (можна додати лог сповіщення, але зміна відбудеться автоматично)
  }
}

function determineTopTwo(stats, history) {
  const names = Object.keys(stats).sort((a, b) => {
    if (stats[b] !== stats[a]) return stats[b] - stats[a];
    return history.lastIndexOf(b) - history.lastIndexOf(a);
  });
  return [names[0], names[1]].sort().join(','); // сортуємо для порівняння
}

// Перше призначення класу після витрати стартових 30 очок
function assignInitialClass(player) {
  if (player.freePoints <= 0 && player.className === 'Новачок') {
    player.className = determineClass(player.stats, player.statHistory);
    player.classAssignedStats = determineTopTwo(player.stats, player.statHistory).split(',');
    player.classAssignedLevel = player.level;
  }
}

// Безпечне представлення гравця (без пароля)
async function sanitizePlayer(player) {
  // отримуємо повні дані компонентів, навичок
  const inventoryComps = await Component.find({ _id: { $in: player.inventory } }).lean();
  const scriptsWithComps = await Promise.all(player.scripts.map(async (s) => {
    const comps = await Component.find({ _id: { $in: s.components.map(c => c.component) } }).lean();
    return {
      ...s.toObject(),
      componentDetails: s.components.map(sc => {
        const comp = comps.find(c => c._id.equals(sc.component));
        return { ...sc, component: comp };
      })
    };
  }));
  const passiveSkills = await PassiveSkill.find({ _id: { $in: player.passiveSkills } }).lean();

  return {
    nickname: player.nickname,
    discordName: player.discordName,
    level: player.level,
    xp: player.xp,
    totalXp: player.totalXp,
    freePoints: player.freePoints,
    hp: player.hp,
    maxHp: player.maxHp,
    currentMana: player.currentMana,
    maxMana: player.maxMana,
    effects: player.effects,
    stats: player.stats,
    statHistory: player.statHistory,
    className: player.className,
    classAssignedLevel: player.classAssignedLevel,
    classAssignedStats: player.classAssignedStats,
    inventory: inventoryComps,
    scripts: scriptsWithComps,
    passiveSkills: passiveSkills
  };
}

function findPlayerSocket(discordName) {
  const sockets = io.sockets.sockets;
  for (let [id, socket] of sockets) {
    if (socket.playerId === discordName) return socket;
  }
  return null;
}

async function getPlayerList() {
  const all = await Player.find({}, 'discordName nickname level').lean();
  return all.map(p => ({ discordName: p.discordName, nickname: p.nickname, level: p.level }));
}

// ====== EXPRESS + SOCKET.IO ======
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

io.on('connection', (socket) => {
  console.log('Нове підключення:', socket.id);

  // ---------- ГРАВЕЦЬ ----------
    socket.on('player:login', async ({ discordName, password }, callback) => {
    try {
        const player = await Player.findOne({ discordName });
        if (!player) return callback({ error: 'Гравця не знайдено' });
        if (!bcrypt.compareSync(password, player.passwordHash))
            return callback({ error: 'Невірний пароль' });
        socket.playerId = discordName;
        socket.join(`player:${discordName}`);
        const token = generateToken(discordName, false);
        socket.emit('player:state', await sanitizePlayer(player));
        callback({ success: true, token });
    } catch (err) {
        callback({ error: 'Помилка сервера' });
    }
});

  socket.on('player:register', async ({ nickname, discordName, password }, callback) => {
    try {
      const exists = await Player.findOne({ discordName });
      if (exists) return callback({ error: 'Гравець з таким ім\'ям вже існує' });
      const hash = bcrypt.hashSync(password, 10);
      const newPlayer = new Player({
        nickname,
        discordName,
        passwordHash: hash
        // решта полів за замовчуванням
      });
      await newPlayer.save();
      const token = generateToken(discordName, false);
      callback({ success: true, token });
    } catch (err) {
      callback({ error: 'Помилка реєстрації' });
    }
  });

  socket.on('player:spendPoint', async ({ statName, delta }, callback) => {
    if (!socket.playerId) return callback({ error: 'Не авторизований' });
    try {
      const player = await Player.findOne({ discordName: socket.playerId });
      if (!player) return callback({ error: 'Гравця не знайдено' });

      if (delta > 0 && player.freePoints <= 0) return callback({ error: 'Немає вільних очок' });
      if (delta < 0 && player.stats[statName] <= 0) return callback({ error: 'Не можна зменшити нижче 0' });

      player.stats[statName] += delta;
      player.freePoints -= delta;
      if (delta > 0) {
        player.statHistory = player.statHistory.filter(s => s !== statName);
        player.statHistory.push(statName);
      }

      recalcDerivedStats(player);
      assignInitialClass(player);          // перше призначення після витрати 30 очок
      if (player.className !== 'Новачок') checkClassMilestone(player); // перевірка на рівні, кратному 10

      await player.save();

      io.to(`player:${socket.playerId}`).emit('player:state', await sanitizePlayer(player));
      io.to('admins').emit('admin:playerUpdated', await sanitizePlayer(player));
      const token = generateToken(discordName, false);
      callback({ success: true, token });
    } catch (err) {
      callback({ error: 'Помилка сервера' });
    }
  });

    // Гравець: об'єднати компоненти у скрипт
  socket.on('script:create', async ({ componentIds }, callback) => {
    if (!socket.playerId) return callback({ error: 'Не авторизований' });
    try {
      const player = await Player.findOne({ discordName: socket.playerId });
      if (!player) return callback({ error: 'Гравця не знайдено' });

      const maxScripts = (await Settings.findOne({ key: 'maxScripts' }))?.value || 3;
      if (player.scripts.length >= maxScripts) return callback({ error: 'Досягнуто максимуму скриптів' });

      // Перевірити, що всі componentIds є в інвентарі
      const comps = await Component.find({ _id: { $in: componentIds } });
      if (comps.length !== 3) return callback({ error: 'Некоректний набір компонентів' });
      // Перевірити, що типи різні: Тригер, Ядро, Вектор
      const types = comps.map(c => c.type);
      if (new Set(types).size !== 3) return callback({ error: 'Потрібні три різні типи' });
      // Переконатися, що всі ID належать інвентарю гравця
      const valid = componentIds.every(id => player.inventory.some(invId => invId.equals(id)));
      if (!valid) return callback({ error: 'Деякі компоненти відсутні' });

      // Видалити компоненти з інвентаря
      player.inventory = player.inventory.filter(id => !componentIds.some(cid => cid.equals(id)));
      // Додати скрипт з порожніми полями (гравець заповнить пізніше)
      player.scripts.push({
        name: '',
        description: '',
        oath: '',
        components: comps.map(c => ({ component: c._id, role: '' })),
        createdAt: new Date()
      });
      await player.save();

      io.to(`player:${socket.playerId}`).emit('player:state', await sanitizePlayer(player));
      io.to('admins').emit('admin:playerUpdated', await sanitizePlayer(player));
      callback({ success: true, scriptIndex: player.scripts.length - 1 }); // повертаємо індекс для подальшого редагування
    } catch (err) {
      callback({ error: 'Помилка сервера' });
    }
  });

  // Гравець: оновити скрипт (заповнити форму)
  socket.on('script:update', async ({ scriptIndex, data }, callback) => {
    if (!socket.playerId) return callback({ error: 'Не авторизований' });
    try {
      const player = await Player.findOne({ discordName: socket.playerId });
      if (!player || !player.scripts[scriptIndex]) return callback({ error: 'Скрипт не знайдено' });
      // Оновлюємо поля: name, description, oath, components.role
      if (data.name) player.scripts[scriptIndex].name = data.name;
      if (data.description) player.scripts[scriptIndex].description = data.description;
      if (data.oath) player.scripts[scriptIndex].oath = data.oath;
      if (data.components) {
        // data.components: [{ componentId, role }]
        for (let i = 0; i < player.scripts[scriptIndex].components.length; i++) {
          const upd = data.components.find(c => c.componentId === player.scripts[scriptIndex].components[i].component.toString());
          if (upd && upd.role) {
            player.scripts[scriptIndex].components[i].role = upd.role.substring(0, 100);
          }
        }
      }
      await player.save();
      io.to(`player:${socket.playerId}`).emit('player:state', await sanitizePlayer(player));
      io.to('admins').emit('admin:playerUpdated', await sanitizePlayer(player));
      const token = generateToken(discordName, false);
      callback({ success: true, token });
    } catch (err) {
      callback({ error: 'Помилка сервера' });
    }
  });

  // Гравець: роз'єднати скрипт
  socket.on('script:disassemble', async ({ scriptIndex }, callback) => {
    if (!socket.playerId) return callback({ error: 'Не авторизований' });
    try {
      const player = await Player.findOne({ discordName: socket.playerId });
      if (!player || !player.scripts[scriptIndex]) return callback({ error: 'Скрипт не знайдено' });
      const script = player.scripts[scriptIndex];
      // Повернути компоненти в інвентар
      const compIds = script.components.map(c => c.component);
      player.inventory.push(...compIds);
      // Видалити скрипт
      player.scripts.splice(scriptIndex, 1);
      await player.save();
      io.to(`player:${socket.playerId}`).emit('player:state', await sanitizePlayer(player));
      io.to('admins').emit('admin:playerUpdated', await sanitizePlayer(player));
      const token = generateToken(discordName, false);
      callback({ success: true, token });
    } catch (err) {
      callback({ error: 'Помилка сервера' });
    }
  });
  // ---------- АДМІН ----------
  // Адмін: створити компонент
  socket.on('component:create', async (data, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Немає прав' });
    try {
      const comp = new Component(data);
      await comp.save();
      callback({ success: true, component: comp });
    } catch (err) {
      callback({ error: 'Помилка створення компонента' });
    }
  });

  // Адмін: отримати всі компоненти (для свого списку)
  socket.on('component:getAll', async (callback) => {
    if (!socket.isAdmin) return callback({ error: 'Немає прав' });
    try {
      const comps = await Component.find().lean();
      callback({ success: true, components: comps });
    } catch (err) {
      callback({ error: 'Помилка завантаження' });
    }
  });

  // Адмін: видалити компонент (видалити з глобального списку і з інвентарів гравців)
  socket.on('component:delete', async (componentId, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Немає прав' });
    try {
      await Component.findByIdAndDelete(componentId);
      // Видаляємо з інвентарів усіх гравців
      await Player.updateMany({}, { $pull: { inventory: componentId } });
      // Також видаляємо зі скриптів? Компоненти в скриптах зберігаються як посилання; можна залишити або видалити скрипти, що містять цей компонент. Поки що просто видаляємо з інвентаря.
      const token = generateToken(discordName, false);
      callback({ success: true, token });
    } catch (err) {
      callback({ error: 'Помилка видалення' });
    }
  });

  // Адмін: додати компонент гравцю (з існуючих)
  socket.on('component:addToPlayer', async ({ discordName, componentId }, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Немає прав' });
    try {
      const player = await Player.findOne({ discordName });
      if (!player) return callback({ error: 'Гравця не знайдено' });
      if (player.inventory.includes(componentId)) return callback({ error: 'Компонент вже є' });
      player.inventory.push(componentId);
      await player.save();
      // Сповістити гравця (якщо онлайн)
      io.to(`player:${discordName}`).emit('player:state', await sanitizePlayer(player));
      const token = generateToken(discordName, false);
      callback({ success: true, token });
    } catch (err) {
      callback({ error: 'Помилка сервера' });
    }
  });

  // Адмін: видалити компонент у гравця
  socket.on('component:removeFromPlayer', async ({ discordName, componentId }, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Немає прав' });
    try {
      const player = await Player.findOne({ discordName });
      if (!player) return callback({ error: 'Гравця не знайдено' });
      player.inventory.pull(componentId);
      await player.save();
      io.to(`player:${discordName}`).emit('player:state', await sanitizePlayer(player));
      const token = generateToken(discordName, false);
      callback({ success: true, token });
    } catch (err) {
      callback({ error: 'Помилка сервера' });
    }
  });

    // Адмін: створити навичку
  socket.on('passiveSkill:create', async (data, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Немає прав' });
    try {
      const skill = new PassiveSkill(data);
      await skill.save();
      callback({ success: true, skill });
    } catch (err) {
      callback({ error: 'Помилка створення' });
    }
  });

  // Адмін: отримати всі навички
  socket.on('passiveSkill:getAll', async (callback) => {
    if (!socket.isAdmin) return callback({ error: 'Немає прав' });
    try {
      const skills = await PassiveSkill.find().lean();
      callback({ success: true, skills });
    } catch (err) {
      callback({ error: 'Помилка' });
    }
  });

  // Адмін: видалити навичку
  socket.on('passiveSkill:delete', async (skillId, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Немає прав' });
    try {
      await PassiveSkill.findByIdAndDelete(skillId);
      await Player.updateMany({}, { $pull: { passiveSkills: skillId } });
      const token = generateToken(discordName, false);
      callback({ success: true, token });
    } catch (err) {
      callback({ error: 'Помилка' });
    }
  });

  // Адмін: додати гравцю
  socket.on('passiveSkill:addToPlayer', async ({ discordName, skillId }, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Немає прав' });
    try {
      const player = await Player.findOne({ discordName });
      if (!player) return callback({ error: 'Гравця не знайдено' });
      if (player.passiveSkills.includes(skillId)) return callback({ error: 'Навичка вже додана' });
      player.passiveSkills.push(skillId);
      await player.save();
      io.to(`player:${discordName}`).emit('player:state', await sanitizePlayer(player));
      const token = generateToken(discordName, false);
      callback({ success: true, token });
    } catch (err) {
      callback({ error: 'Помилка' });
    }
  });

  // Адмін: видалити у гравця
  socket.on('passiveSkill:removeFromPlayer', async ({ discordName, skillId }, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Немає прав' });
    try {
      const player = await Player.findOne({ discordName });
      if (!player) return callback({ error: 'Гравця не знайдено' });
      player.passiveSkills.pull(skillId);
      await player.save();
      io.to(`player:${discordName}`).emit('player:state', await sanitizePlayer(player));
      const token = generateToken(discordName, false);
      callback({ success: true, token });
    } catch (err) {
      callback({ error: 'Помилка' });
    }
  });

  socket.on('component:update', async ({ componentId, data }, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Немає прав' });
    try {
      const comp = await Component.findByIdAndUpdate(componentId, data, { new: true });
      if (!comp) return callback({ error: 'Компонент не знайдено' });
      callback({ success: true, component: comp });
    } catch (err) {
      callback({ error: 'Помилка оновлення' });
    }
  });

  socket.on('settings:get', async (callback) => {
    try {
      const maxScripts = await Settings.findOne({ key: 'maxScripts' });
      callback({ maxScripts: maxScripts?.value || 3 });
    } catch (err) {
      callback({ maxScripts: 3 });
    }
  });

  socket.on('settings:update', async ({ maxScripts }, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Немає прав' });
    try {
      await Settings.findOneAndUpdate({ key: 'maxScripts' }, { value: maxScripts }, { upsert: true });
      const token = generateToken(discordName, false);
      callback({ success: true, token });
    } catch (err) {
      callback({ error: 'Помилка оновлення' });
    }
  });

  // Отримати список гравців (для адміна)
  socket.on('admin:getPlayer', async (discordName, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Недостатньо прав' });
    try {
        const player = await Player.findOne({ discordName });
        if (!player) return callback({ error: 'Гравця не знайдено' });
        const sanitized = await sanitizePlayer(player);
        callback(null, sanitized);
    } catch (err) {
        callback({ error: 'Помилка сервера' });
    }
  });


  socket.on('admin:login', async ({ password }, callback) => {
      if (password !== ADMIN_PASSWORD) return callback({ error: 'Невірний пароль адміністратора' });
      socket.isAdmin = true;
      socket.join('admins');
      try {
          const allPlayers = await Player.find({}, 'discordName nickname level').lean();
          const list = allPlayers.map(p => ({
              discordName: p.discordName,
              nickname: p.nickname,
              level: p.level
          }));
          const token = generateToken('admin', true); // ім'я 'admin' як ідентифікатор
          callback({ success: true, players: list, token });
      } catch (err) {
          callback({ error: 'Помилка завантаження списку' });
      }
  });

  socket.on('auth:token', (token, callback) => {
    const data = verifyToken(token);
    if (!data) return callback({ error: 'Токен недійсний або прострочений' });
    if (data.isAdmin) {
      socket.isAdmin = true;
      socket.join('admins');
      callback({ success: true, isAdmin: true, discordName: 'admin' });
    } else {
      socket.playerId = data.discordName;
      socket.join(`player:${data.discordName}`);
      // відправити стан гравця
      Player.findOne({ discordName: data.discordName }).then(player => {
        if (player) {
          sanitizePlayer(player).then(sanitized => {
            socket.emit('player:state', sanitized);
          });
        }
      });
      callback({ success: true, isAdmin: false, discordName: data.discordName });
    }
  });

  socket.on('admin:getPlayer', async (discordName, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Недостатньо прав' });
    try {
      const player = await Player.findOne({ discordName });
      if (!player) return callback({ error: 'Гравця не знайдено' });
      callback(null, await sanitizePlayer(player));
    } catch (err) {
      callback({ error: 'Помилка сервера' });
    }
  });

  socket.on('admin:updatePlayer', async ({ discordName, field, value, delta }, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Недостатньо прав' });
    try {
      const player = await Player.findOne({ discordName });
      if (!player) return callback({ error: 'Гравця не знайдено' });

      switch (field) {
        case 'xp':
          processXpChange(player, delta || 0);
          break;
        case 'hp':
          const maxHp = calcMaxHp(player.stats.здоровя);
          if (value !== undefined) player.hp = Math.max(0, Math.min(maxHp, value));
          else if (delta) player.hp = Math.max(0, Math.min(maxHp, player.hp + delta));
          break;
        case 'mana':
          const maxMana = calcMaxMana(player.level, player.stats.мана);
          if (value !== undefined) player.currentMana = Math.max(0, Math.min(maxMana, value));
          else if (delta) player.currentMana = Math.max(0, Math.min(maxMana, player.currentMana + delta));
          break;
        case 'stat':
          const stat = value.statName;
          if (player.stats.hasOwnProperty(stat)) {
            if (value.delta) player.stats[stat] = Math.max(0, player.stats[stat] + value.delta);
            else player.stats[stat] = Math.max(0, value.newValue);
            player.statHistory = player.statHistory.filter(s => s !== stat);
            player.statHistory.push(stat);
            recalcDerivedStats(player);
            assignInitialClass(player);
            if (player.className !== 'Новачок') checkClassMilestone(player);
          }
          break;
        case 'freePoints':
          if (delta !== undefined) {
              player.freePoints = Math.max(0, player.freePoints + delta);
          } else if (value !== undefined) {
              player.freePoints = Math.max(0, value);
          }
          assignInitialClass(player);
          break;
      }

      recalcDerivedStats(player);
      await player.save();

      io.to(`player:${discordName}`).emit('player:state', await sanitizePlayer(player));
      io.to('admins').emit('admin:playerUpdated', await sanitizePlayer(player));
      const token = generateToken(discordName, false);
      callback({ success: true, token });
    } catch (err) {
      callback({ error: 'Помилка сервера' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Відключення:', socket.id);
  });
  
  // Адмін надсилає запит на зміну імені
  socket.on('admin:requestNameChange', async ({ discordName, newName }) => {
    if (!socket.isAdmin) return;
    const playerSocket = findPlayerSocket(discordName);
    if (playerSocket) {
      playerSocket.emit('player:changeRequest', { type: 'nickname', value: newName });
    }
    // Можна зберегти запит у БД тимчасово, якщо гравець офлайн
  });

  // Аналогічно для класу
  socket.on('admin:requestClassChange', async ({ discordName, newClass }) => {
    if (!socket.isAdmin) return;
    const playerSocket = findPlayerSocket(discordName);
    if (playerSocket) {
      playerSocket.emit('player:changeRequest', { type: 'class', value: newClass });
    }
  });

  // Відповідь гравця
  socket.on('player:changeResponse', async ({ accept, type, value }) => {
    if (!socket.playerId) return;
    const player = await Player.findOne({ discordName: socket.playerId });
    if (!player) return;
    if (accept) {
      if (type === 'nickname') player.nickname = value;
      else if (type === 'class') player.className = value;
      await player.save();
      io.to(`player:${socket.playerId}`).emit('player:state', await sanitizePlayer(player));
      io.to('admins').emit('admin:playerUpdated', await sanitizePlayer(player));
    } else {
      // Сповістити адміна про відмову (можна окрему подію)
    }
  });

// Додавання ефекту
socket.on('admin:addEffect', async ({ discordName, effect }) => {
    if (!socket.isAdmin) return;
    try {
        const player = await Player.findOne({ discordName });
        if (!player) return;
        const effectLib = {
          attack_up: { name: 'Атака +', icon: 'attack_up' },
          crit_up: { name: 'Критичний удар +', icon: 'crit_up' },
          speed_up: { name: 'Швидкість +', icon: 'speed_up' },
          defense_up: { name: 'Захист +', icon: 'defense_up' },
          lifesteal: { name: 'Викрадення життя', icon: 'lifesteal' },
          reflect: { name: 'Відбиття', icon: 'reflect' },
          regeneration: { name: 'Регенерація', icon: 'regeneration' },
          barrier: { name: 'Бар\'єр', icon: 'barrier' },
          immunity: { name: 'Імунітет', icon: 'immunity' },
          invulnerability: { name: 'Непереможність', icon: 'invulnerability' },
          stealth: { name: 'Прихованість', icon: 'stealth' },
          invisibility: { name: 'Невидимість', icon: 'invisibility' },
          poison: { name: 'Отрута', icon: 'poison' },
          bleed: { name: 'Кровотеча', icon: 'bleed' },
          burn: { name: 'Паління', icon: 'burn' },
          freeze: { name: 'Замороження', icon: 'freeze' },
          slow: { name: 'Повільність', icon: 'slow' },
          stun: { name: 'Оглушення', icon: 'stun' },
          blind: { name: 'Сліпота', icon: 'blind' },
          silence: { name: 'Мовчання', icon: 'silence' },
          weakness: { name: 'Слабкість', icon: 'weakness' },
          fragility: { name: 'Хрупкість', icon: 'fragility' },
          curse: { name: 'Прокляття', icon: 'curse' },
          fear: { name: 'Страх', icon: 'fear' },
          paralysis: { name: 'Параліч', icon: 'paralysis' },
          hypnosis: { name: 'Гіпноз', icon: 'hypnosis' },
          madness: { name: 'Безумство', icon: 'madness' },
          seal: { name: 'Печать', icon: 'seal' },
          sleep: { name: 'Сон', icon: 'sleep' },
          drain: { name: 'Виснаження', icon: 'drain' },
          doom: { name: 'Поразка', icon: 'doom' },
          lucky: { name: 'Удача', icon: 'lucky' },
          unknown: { name: 'Невідомий', icon: 'unknown' }
        };
        const eff = effectLib[effect] || { name: effect, icon: 'default' };
        player.effects.push(eff);
        await player.save();
        io.to(`player:${discordName}`).emit('player:state', await sanitizePlayer(player));
        io.to('admins').emit('admin:playerUpdated', await sanitizePlayer(player));
    } catch (err) {
        console.error(err);
    }
});

// Видалення ефекту за індексом
socket.on('admin:removeEffect', async ({ discordName, effectIndex }) => {
    if (!socket.isAdmin) return;
    try {
        const player = await Player.findOne({ discordName });
        if (!player || !player.effects[effectIndex]) return;
        player.effects.splice(effectIndex, 1);
        await player.save();
        io.to(`player:${discordName}`).emit('player:state', await sanitizePlayer(player));
        io.to('admins').emit('admin:playerUpdated', await sanitizePlayer(player));
    } catch (err) {
        console.error(err);
    }
});

  // Видалення гравця
  socket.on('admin:deletePlayer', async ({ discordName }, callback) => {
    if (!socket.isAdmin) return callback({ error: 'Немає прав' });
    await Player.deleteOne({ discordName });
    // Сповістити гравця, якщо онлайн
    const targetSocket = findPlayerSocket(discordName);
    if (targetSocket) {
      targetSocket.emit('player:state', null); // або спеціальна подія про видалення
      targetSocket.playerId = null;
    }
    io.to('admins').emit('admin:playerList', await getPlayerList());
      const token = generateToken(discordName, false);
      callback({ success: true, token });
  });

  // Оновлення списку (викликається при потребі)
  socket.on('admin:refreshList', async () => {
    if (!socket.isAdmin) return;
    socket.emit('admin:playerList', await getPlayerList());
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущено на порту ${PORT}`);
});

// ===== Модель Компонента =====
const componentSchema = new mongoose.Schema({
  name: String,
  type: { type: String, enum: ['Тригер', 'Ядро', 'Вектор'] },
  category: { type: String, enum: ['Фізика', 'Просторові', 'Сенсорні', 'Елементарні', 'Психологічні', 'Надскладні'] },
  rarity: { type: String, enum: ['Звичайний', 'Незвичайний', 'Рідкісний', 'Епічний', 'Легендарний', 'Унікальний'] },
  description: String,
  limitations: String,
  source: String,
  createdByAdmin: { type: Boolean, default: true }  // щоб відрізняти
});
const Component = mongoose.model('Component', componentSchema);

// ===== Модель Пасивної Навички =====
const passiveSkillSchema = new mongoose.Schema({
  name: String,
  rarity: { type: String, enum: ['Звичайний', 'Незвичайний', 'Рідкісний', 'Епічний', 'Легендарний', 'Унікальний'] },
  description: String,
  source: String,
  createdByAdmin: { type: Boolean, default: true }
});
const PassiveSkill = mongoose.model('PassiveSkill', passiveSkillSchema);

// ===== Модель Налаштувань =====
const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
});
const Settings = mongoose.model('Settings', settingsSchema);

// Ініціалізація налаштувань (maxScripts = 3 за замовчуванням)
async function initSettings() {
  const exists = await Settings.findOne({ key: 'maxScripts' });
  if (!exists) {
    await new Settings({ key: 'maxScripts', value: 3 }).save();
  }
}
initSettings();