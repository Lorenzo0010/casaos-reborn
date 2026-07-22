const TelegramBot = require('node-telegram-bot-api');
const si = require('systeminformation');
const Docker = require('dockerode');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const http = require('http');

let bot = null;
let currentChatId = null;
let lastNotificationTime = {};
const NOTIFICATION_COOLDOWN = 1000 * 60 * 15;

const initBot = (token, chatId) => {
  if (bot) {
    try { bot.stopPolling(); } catch (e) {}
    bot = null;
  }
  
  if (!token || !chatId) return;

  currentChatId = String(chatId);
  bot = new TelegramBot(token, { polling: true });

  // Security Middleware
  const isAuthorized = (msg) => {
    return String(msg.chat?.id || msg.message?.chat?.id) === currentChatId;
  };

  // Commands
  bot.onText(/\/(start|help)/, (msg) => {
    if (!isAuthorized(msg)) return;
    const text = `🤖 *CasaOS Reborn Bot*\n\nSono il tuo assistente per gestire il server.\n\nComandi disponibili:\n/system - Statistiche di sistema (CPU, RAM, Disco)\n/containers - Gestisci i container (Avvia/Ferma)\n/updates - Controlla e installa aggiornamenti\n/prune - Pulisci risorse Docker inutilizzate`;
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/system/, async (msg) => {
    if (!isAuthorized(msg)) return;
    try {
      const [cpuLoad, mem, fsSize, temp] = await Promise.all([
        si.currentLoad(), si.mem(), si.fsSize(), si.cpuTemperature()
      ]);
      const primaryDisk = fsSize.find(f => f.mount === '/') || fsSize[0];
      
      const cpu = cpuLoad.currentLoad.toFixed(1);
      const ram = ((mem.active / mem.total) * 100).toFixed(1);
      const disk = primaryDisk ? primaryDisk.use.toFixed(1) : 0;
      
      const bar = (pct) => {
        const blocks = Math.round(pct / 10);
        return '█'.repeat(blocks) + '░'.repeat(10 - blocks);
      };

      const text = `📊 *Statistiche di Sistema*\n\n` +
        `🖥 *CPU:* ${cpu}%\n\`[${bar(cpu)}]\`\n🌡 Temp: ${temp.main || '?'}°C\n\n` +
        `🧠 *RAM:* ${ram}%\n\`[${bar(ram)}]\`\n\n` +
        `💾 *Disco:* ${disk}%\n\`[${bar(disk)}]\``;
      
      bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    } catch (e) {
      bot.sendMessage(msg.chat.id, `Errore recupero statistiche: ${e.message}`);
    }
  });

  bot.onText(/\/prune/, (msg) => {
    if (!isAuthorized(msg)) return;
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🗑️ Immagini', callback_data: 'prune_images' }],
          [{ text: '🗑️ Volumi', callback_data: 'prune_volumes' }],
          [{ text: '🗑️ Reti', callback_data: 'prune_networks' }]
        ]
      }
    };
    bot.sendMessage(msg.chat.id, 'Cosa vuoi pulire?', opts);
  });

  bot.onText(/\/updates/, (msg) => {
    if (!isAuthorized(msg)) return;
    const updates = Object.values(global.availableUpdates || {});
    if (updates.length === 0) {
      bot.sendMessage(msg.chat.id, '✅ Tutti i container sono aggiornati.');
      return;
    }
    
    let text = `📦 *Aggiornamenti Disponibili (${updates.length})*\n\n`;
    updates.forEach(u => {
      text += `- *${u.name}*\n  \`${u.image}\`\n`;
    });

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⬇️ Aggiorna Tutto (Salva e Ricrea)', callback_data: 'update_all' }]
        ]
      }
    };
    bot.sendMessage(msg.chat.id, text, opts);
  });

  bot.onText(/\/containers/, async (msg) => {
    if (!isAuthorized(msg)) return;
    try {
      const containers = await docker.listContainers({ all: true });
      const keyboard = containers.map(c => {
        const name = c.Names[0].replace('/', '');
        const state = c.State === 'running' ? '🟢' : '🔴';
        return [{ text: `${state} ${name}`, callback_data: `cont_opts_${c.Id.substring(0,12)}` }];
      });
      
      bot.sendMessage(msg.chat.id, 'Seleziona un container:', {
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (e) {
      bot.sendMessage(msg.chat.id, `Errore recupero container: ${e.message}`);
    }
  });

  // Handle Callbacks
  bot.on('callback_query', async (query) => {
    if (!isAuthorized(query)) return;
    const chatId = query.message.chat.id;
    const data = query.data;

    try {
      if (data.startsWith('prune_')) {
        const type = data.replace('prune_', '');
        bot.answerCallbackQuery(query.id, { text: `Avvio pulizia ${type}...` });
        if (type === 'images') await docker.pruneImages({ filters: { dangling: ["false"] } });
        if (type === 'volumes') await docker.pruneVolumes();
        if (type === 'networks') await docker.pruneNetworks();
        bot.sendMessage(chatId, `✅ Pulizia ${type} completata.`);
      }

      if (data === 'update_all') {
        const updates = Object.values(global.availableUpdates || {});
        if (updates.length === 0) return bot.answerCallbackQuery(query.id, { text: 'Nessun aggiornamento trovato.' });
        
        bot.answerCallbackQuery(query.id, { text: 'Avvio aggiornamenti in corso...' });
        bot.sendMessage(chatId, `⏳ Avvio "Salva e Ricrea" per ${updates.length} container... potresti ricevere notifiche dalla dashboard.`);
        
        for (const u of updates) {
           const payload = JSON.stringify({ image: u.image });
           const reqOpts = {
             hostname: '127.0.0.1',
             port: 3000,
             path: `/api/docker/containers/${u.id}/update`,
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Content-Length': Buffer.byteLength(payload)
             }
           };
           const r = http.request(reqOpts, (res) => {});
           r.on('error', (e) => console.error('[Telegram] Local HTTP Error:', e));
           r.write(payload);
           r.end();
        }
      }

      if (data.startsWith('cont_opts_')) {
        const cid = data.replace('cont_opts_', '');
        const opts = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '▶️ Avvia', callback_data: `cont_start_${cid}` }, { text: '⏹️ Ferma', callback_data: `cont_stop_${cid}` }],
              [{ text: '🔄 Riavvia', callback_data: `cont_restart_${cid}` }]
            ]
          }
        };
        bot.editMessageText(`Scegli azione:`, {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: opts.reply_markup
        });
      }

      if (data.startsWith('cont_start_')) {
        const cid = data.replace('cont_start_', '');
        bot.answerCallbackQuery(query.id, { text: 'Avvio in corso...' });
        await docker.getContainer(cid).start();
        bot.sendMessage(chatId, `✅ Container avviato.`);
      }
      if (data.startsWith('cont_stop_')) {
        const cid = data.replace('cont_stop_', '');
        bot.answerCallbackQuery(query.id, { text: 'Arresto in corso...' });
        await docker.getContainer(cid).stop();
        bot.sendMessage(chatId, `✅ Container fermato.`);
      }
      if (data.startsWith('cont_restart_')) {
        const cid = data.replace('cont_restart_', '');
        bot.answerCallbackQuery(query.id, { text: 'Riavvio in corso...' });
        await docker.getContainer(cid).restart();
        bot.sendMessage(chatId, `✅ Container riavviato.`);
      }
    } catch (e) {
      bot.answerCallbackQuery(query.id, { text: '⚠️ Errore: ' + e.message, show_alert: true });
    }
  });

  console.log('[Telegram] Bot avviato in modalità polling');
};

const sendTelegramMessage = async (token, chatId, message) => {
  if (!token || !chatId) return;

  const key = message.substring(0, 30);
  const now = Date.now();
  if (lastNotificationTime[key] && now - lastNotificationTime[key] < NOTIFICATION_COOLDOWN) return;

  if (bot && currentChatId === String(chatId)) {
    try {
      await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      lastNotificationTime[key] = now;
      return;
    } catch (e) {
      console.error('[Telegram] Errore invio tramite bot', e.message);
    }
  }

  // Fallback HTTP
  const https = require('https');
  const postData = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' });
  const options = {
    hostname: 'api.telegram.org', port: 443, path: `/bot${token}/sendMessage`,
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
  };
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode === 200) lastNotificationTime[key] = now;
        resolve();
      });
    });
    req.on('error', () => resolve());
    req.write(postData);
    req.end();
  });
};

const reloadBot = () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const PREFS_FILE = path.join(__dirname, '..', 'data', 'preferences.json');
    if (fs.existsSync(PREFS_FILE)) {
      const prefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
      if (prefs.telegramToken && prefs.telegramChatId) {
        initBot(prefs.telegramToken, prefs.telegramChatId);
      } else if (bot) {
        bot.stopPolling();
        bot = null;
      }
    }
  } catch (e) {
    console.error('[Telegram] Errore ricaricamento bot', e);
  }
};

module.exports = { sendTelegramMessage, initBot, reloadBot };
