const https = require('https');

let lastNotificationTime = {};
const NOTIFICATION_COOLDOWN = 1000 * 60 * 15; // 15 minuti tra una notifica e l'altra per tipo

const sendTelegramMessage = async (token, chatId, message) => {
  if (!token || !chatId) return;

  // Cooldown per tipo di messaggio (cpu/ram/disk)
  const key = message.substring(0, 30);
  const now = Date.now();
  if (lastNotificationTime[key] && now - lastNotificationTime[key] < NOTIFICATION_COOLDOWN) return;

  const postData = JSON.stringify({
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML'
  });

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          lastNotificationTime[key] = now;
          console.log('[Telegram] Notifica inviata');
        } else {
          console.error('[Telegram] Errore risposta:', res.statusCode, data);
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      console.error('[Telegram] Errore invio notifica:', err.message);
      resolve();
    });

    req.write(postData);
    req.end();
  });
};

module.exports = { sendTelegramMessage };
