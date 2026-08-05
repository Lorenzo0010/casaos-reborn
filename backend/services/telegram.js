const TelegramBot = require('node-telegram-bot-api');
const si = require('systeminformation');
const Docker = require('dockerode');
const docker = new Docker();
const http = require('http');
const https = require('https');
const { exec } = require('child_process');

let bot = null;
let alertInterval = null;
let currentChatId = null;
let lastNotificationTime = {};
const NOTIFICATION_COOLDOWN = 1000 * 60 * 15;

const execHost = (cmd, callback) => {
  const hostCmd = `export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH; ${cmd}`;
  exec(`nsenter -t 1 -m -u -i -n -p /bin/sh -c "${hostCmd}"`, (err, stdout, stderr) => {
    if (err && (err.message.includes('nsenter: command not found') || err.message.includes('nsenter: failed to execute') || err.message.includes('not found') && !err.message.includes('tailscale'))) {
      exec(cmd, callback);
    } else {
      callback(err, stdout, stderr);
    }
  });
};

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
  bot.onText(/\/(start|help|menu)/, async (msg) => {
    if (!isAuthorized(msg)) return;
    
    // Rimuove la vecchia Reply Keyboard inviando un messaggio temporaneo
    const sent = await bot.sendMessage(msg.chat.id, '...', { reply_markup: { remove_keyboard: true } });
    bot.deleteMessage(msg.chat.id, sent.message_id).catch(() => {});

    const mainKeyboard = {
      inline_keyboard: [
        [{ text: '📊 System', callback_data: 'menu_system' }, { text: '📦 Containers', callback_data: 'menu_containers' }],
        [{ text: '🔄 Updates', callback_data: 'menu_updates' }, { text: '🧹 Prune', callback_data: 'menu_prune' }],
        [{ text: '🌐 Network', callback_data: 'menu_network' }, { text: '⚠️ Host', callback_data: 'menu_host' }]
      ]
    };
    const text = `🤖 *CasaOS Reborn Bot*\n\nSono il tuo assistente per gestire il server.\n\nScegli un'opzione dal menu:`;
    const opts = {
      parse_mode: 'Markdown',
      reply_markup: mainKeyboard
    };
    bot.sendMessage(msg.chat.id, text, opts);
  });

  bot.onText(/^\/cmd\s+(.+)/, (msg, match) => {
    if (!isAuthorized(msg)) return;
    const cmd = match[1];
    bot.sendMessage(msg.chat.id, `⏳ Esecuzione di: \`${cmd}\``, { parse_mode: 'Markdown' });
    execHost(cmd, (error, stdout, stderr) => {
      let result = stdout || stderr || '';
      if (error) result = `Errore:\n${error.message}\n\n${result}`;
      if (!result) result = 'Comando eseguito senza output.';
      if (result.length > 4000) result = result.substring(0, 4000) + '\n...[TRONCATO]';
      bot.sendMessage(msg.chat.id, `\`\`\`bash\n${result}\n\`\`\``, { parse_mode: 'Markdown' });
    });
  });

  // Handle Callbacks
  bot.on('callback_query', async (query) => {
    if (!isAuthorized(query)) return;
    const chatId = query.message.chat.id;
    const data = query.data;

    const mainKeyboard = {
      inline_keyboard: [
        [{ text: '📊 System', callback_data: 'menu_system' }, { text: '📦 Containers', callback_data: 'menu_containers' }],
        [{ text: '🔄 Updates', callback_data: 'menu_updates' }, { text: '🧹 Prune', callback_data: 'menu_prune' }],
        [{ text: '🌐 Network', callback_data: 'menu_network' }, { text: '⚠️ Host', callback_data: 'menu_host' }]
      ]
    };
    const backBtn = [[{ text: '🔙 Menu Principale', callback_data: 'menu_main' }]];

    try {
      if (data === 'menu_main') {
        bot.answerCallbackQuery(query.id);
        const text = `🤖 *CasaOS Reborn Bot*\n\nSono il tuo assistente per gestire il server.\n\nScegli un'opzione dal menu:`;
        bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', reply_markup: mainKeyboard });
      }

      if (data === 'menu_system') {
        bot.answerCallbackQuery(query.id);
        const [cpuLoad, mem, fsSize, temp] = await Promise.all([si.currentLoad(), si.mem(), si.fsSize(), si.cpuTemperature()]);
        const primaryDisk = fsSize.find(f => f.mount === '/') || fsSize[0];
        const cpu = cpuLoad.currentLoad.toFixed(1);
        const ram = ((mem.active / mem.total) * 100).toFixed(1);
        const disk = primaryDisk ? primaryDisk.use.toFixed(1) : 0;
        const bar = (pct) => { const blocks = Math.round(pct / 10); return '█'.repeat(blocks) + '░'.repeat(10 - blocks); };
        const text = `📊 *Statistiche di Sistema*\n\n🖥 *CPU:* ${cpu}%\n\`[${bar(cpu)}]\`\n🌡 Temp: ${temp.main || '?'}°C\n\n🧠 *RAM:* ${ram}%\n\`[${bar(ram)}]\`\n\n💾 *Disco:* ${disk}%\n\`[${bar(disk)}]\``;
        bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: backBtn } });
      }

      if (data === 'menu_containers') {
        bot.answerCallbackQuery(query.id);
        const containers = await docker.listContainers({ all: true });
        const keyboard = containers.map(c => {
          const name = c.Names[0].replace('/', '');
          const state = c.State === 'running' ? '🟢' : '🔴';
          return [{ text: `${state} ${name}`, callback_data: `cont_opts_${c.Id.substring(0,12)}` }];
        });
        keyboard.push(backBtn[0]);
        bot.editMessageText('Seleziona un container:', { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: keyboard } });
      }

      if (data === 'menu_updates') {
        bot.answerCallbackQuery(query.id);
        const updates = Object.values(global.availableUpdates || {});
        if (updates.length === 0) return bot.editMessageText('✅ Tutti i container sono aggiornati.', { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: backBtn } });
        let text = `📦 *Aggiornamenti Disponibili (${updates.length})*\n\n`;
        updates.forEach(u => { text += `- *${u.name}*\n  \`${u.image}\`\n`; });
        bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬇️ Aggiorna Tutto', callback_data: 'update_all' }], backBtn[0]] } });
      }

      if (data === 'menu_prune') {
        bot.answerCallbackQuery(query.id);
        bot.editMessageText('Cosa vuoi pulire?', {
          chat_id: chatId, message_id: query.message.message_id,
          reply_markup: { inline_keyboard: [[{ text: '🗑️ Immagini', callback_data: 'prune_images' }], [{ text: '🗑️ Volumi', callback_data: 'prune_volumes' }], [{ text: '🗑️ Reti', callback_data: 'prune_networks' }], backBtn[0]] }
        });
      }

      if (data === 'menu_network') {
        bot.answerCallbackQuery(query.id, { text: 'Recupero info rete...' });
        let text = `🌐 *Info di Rete*\n\n`;
        execHost('ip -4 -o addr show', (err, stdout) => {
          if (!err && stdout) {
            const lines = stdout.split('\n');
            lines.forEach(line => {
              if (line.trim()) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 4) {
                  const iface = parts[1];
                  const ipAddr = parts[3].split('/')[0];
                  if (['lo', 'wlan0', 'end0', 'eth0'].includes(iface)) {
                    text += `🔹 *${iface}*: \`${ipAddr}\`\n`;
                  }
                }
              }
            });
          } else {
            text += `Errore recupero IP host.\n`;
          }
          
          https.get('https://api.ipify.org', (res) => {
            let publicIp = '';
            res.on('data', d => publicIp += d);
            res.on('end', () => {
              text += `\n🌍 *IP Pubblico*: \`${publicIp}\``;
              bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Tailscale Status', callback_data: 'ts_status' }], backBtn[0]] } });
            });
          }).on('error', () => {
            text += `\n🌍 *IP Pubblico*: Errore`;
            bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Tailscale Status', callback_data: 'ts_status' }], backBtn[0]] } });
          });
        });
      }

      if (data === 'menu_host') {
        bot.answerCallbackQuery(query.id);
        bot.editMessageText('⚠️ *Attenzione*: Vuoi spegnere o riavviare il server host?', {
          chat_id: chatId, message_id: query.message.message_id,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🔄 Riavvia', callback_data: 'host_reboot' }, { text: '🛑 Spegni', callback_data: 'host_shutdown' }], backBtn[0]] }
        });
      }

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
             port: 80,
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
              [{ text: '🔄 Riavvia', callback_data: `cont_restart_${cid}` }],
              [{ text: '📜 Logs', callback_data: `cont_logs_${cid}` }, { text: '📈 Stats', callback_data: `cont_stats_${cid}` }],
              [{ text: '🔙 Containers', callback_data: 'menu_containers' }]
            ]
          }
        };
        bot.editMessageText(`Scegli azione per il container:`, {
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
      if (data.startsWith('cont_logs_')) {
        const cid = data.replace('cont_logs_', '');
        bot.answerCallbackQuery(query.id, { text: 'Recupero logs...' });
        const logBuffer = await docker.getContainer(cid).logs({ tail: 50, stdout: true, stderr: true });
        let logs = logBuffer.toString('utf8').replace(/[\u0000-\u001F]/g, ''); // Clean docker log multiplexing headers
        if (logs.length > 3900) logs = logs.substring(logs.length - 3900);
        if (!logs) logs = "Nessun log disponibile.";
        bot.sendMessage(chatId, `📜 *Logs Container*\n\`\`\`text\n${logs}\n\`\`\``, { parse_mode: 'Markdown' });
      }
      if (data.startsWith('cont_stats_')) {
        const cid = data.replace('cont_stats_', '');
        bot.answerCallbackQuery(query.id, { text: 'Recupero stats...' });
        const stats = await docker.getContainer(cid).stats({ stream: false });
        
        let cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        let systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        let cpu = 0.0;
        if (systemDelta > 0.0 && cpuDelta > 0.0) {
          cpu = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100.0;
        }
        
        let usedMemory = stats.memory_stats.usage - (stats.memory_stats.stats?.cache || 0);
        let mem = (usedMemory / stats.memory_stats.limit) * 100.0;
        
        bot.sendMessage(chatId, `📈 *Stats Live Container*\nCPU: ${cpu.toFixed(2)}%\nRAM: ${mem.toFixed(2)}%`, { parse_mode: 'Markdown' });
      }

      if (data === 'ts_status') {
        bot.answerCallbackQuery(query.id, { text: 'Controllo Tailscale...' });
        execHost('systemctl status tailscaled', (err, stdout, stderr) => {
          let text = `🌐 *Stato Tailscale*\n\n`;
          let sysText = stdout || stderr || (err ? err.message : 'Nessun output.');
          text += `**Systemctl Status:**\n\`\`\`bash\n${sysText.substring(0, 800)}\n\`\`\`\n`;
          
          execHost('tailscale status', (err2, stdout2, stderr2) => {
             let tsText = stdout2 || stderr2 || (err2 ? err2.message : 'Nessun output.');
             text += `**Tailscale Status:**\n\`\`\`bash\n${tsText.substring(0, 800)}\n\`\`\``;
             
             bot.editMessageText(text, { 
               chat_id: chatId, 
               message_id: query.message.message_id, 
               parse_mode: 'Markdown', 
               reply_markup: { 
                 inline_keyboard: [
                   [{ text: '🔄 Riavvia Tailscale', callback_data: 'ts_restart' }],
                   [{ text: '🔙 Menu Principale', callback_data: 'menu_main' }]
                 ] 
               } 
             });
          });
        });
      }

      if (data === 'ts_restart') {
        bot.answerCallbackQuery(query.id, { text: 'Riavvio Tailscale in corso...' });
        execHost('systemctl restart tailscaled', (err, stdout, stderr) => {
          if (err) {
            bot.sendMessage(chatId, `❌ Errore riavvio Tailscale:\n\`\`\`text\n${stderr || err.message}\n\`\`\``, { parse_mode: 'Markdown' });
          } else {
            bot.sendMessage(chatId, '✅ Tailscale riavviato con successo.');
          }
        });
      }

      if (data === 'host_reboot') {
        bot.answerCallbackQuery(query.id, { text: 'Riavvio in corso...' });
        bot.sendMessage(chatId, `🔄 Riavvio del server in corso...`);
        execHost('reboot', () => {});
      }

      if (data === 'host_shutdown') {
        bot.answerCallbackQuery(query.id, { text: 'Spegnimento in corso...' });
        bot.sendMessage(chatId, `🛑 Spegnimento del server in corso...`);
        execHost('shutdown -h now', () => {});
      }
    } catch (e) {
      bot.answerCallbackQuery(query.id, { text: '⚠️ Errore: ' + e.message, show_alert: true });
    }
  });

  if (alertInterval) clearInterval(alertInterval);
  alertInterval = setInterval(async () => {
    try {
      const [cpuLoad, mem, fsSize] = await Promise.all([si.currentLoad(), si.mem(), si.fsSize()]);
      const primaryDisk = fsSize.find(f => f.mount === '/') || fsSize[0];
      
      const cpuPct = cpuLoad.currentLoad;
      const ramPct = (mem.active / mem.total) * 100;
      const diskPct = primaryDisk ? primaryDisk.use : 0;
      
      if (cpuPct > 90 || ramPct > 90 || diskPct > 90) {
        bot.sendMessage(currentChatId, `🚨 *ALLARME SISTEMA* 🚨\n\nRisorse oltre il 90%:\nCPU: ${cpuPct.toFixed(1)}%\nRAM: ${ramPct.toFixed(1)}%\nDisco: ${diskPct.toFixed(1)}%`, { parse_mode: 'Markdown' });
      }
    } catch (e) {}
  }, 1000 * 60 * 5); // 5 minutes

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
