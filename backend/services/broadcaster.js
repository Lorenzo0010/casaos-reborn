const si = require('systeminformation');
const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { injectCasaOSMetadata } = require('../utils/yamlBuilder');

const docker = new Docker();
const CASAOS_APPS_DIR = process.env.CASAOS_APPS_DIR || (process.platform === 'win32' ? path.join(os.homedir(), 'casaos-apps') : '/var/lib/casaos/apps');

let intervalId = null;

// History array to keep last 15 minutes (300 samples at 3 sec interval)
const MAX_HISTORY = 300;
let systemHistory = [];

const getSystemHistory = () => systemHistory;

const initBroadcaster = (io) => {
  if (intervalId) return;

  intervalId = setInterval(async () => {
    // Check if there are any connected clients
    if (!io || io.engine.clientsCount === 0) return;

    try {
      // 1. Fetch System Stats
      const [cpuLoad, mem, fsSize, osInfo, cpuTemp, netStats] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.osInfo(),
        si.cpuTemperature(),
        si.networkStats()
      ]);

      const primaryDisk = fsSize.find(fs => fs.mount === '/') || fsSize[0];
      const rx_sec = netStats && netStats.length > 0 ? netStats.reduce((sum, net) => sum + (net.rx_sec || 0), 0) : 0;
      const tx_sec = netStats && netStats.length > 0 ? netStats.reduce((sum, net) => sum + (net.tx_sec || 0), 0) : 0;

      const stats = {
        cpu: {
          load: cpuLoad.currentLoad.toFixed(1),
          cores: cpuLoad.cpus.length,
          temperature: cpuTemp.main
        },
        memory: {
          total: mem.total,
          used: mem.active,
          percent: ((mem.active / mem.total) * 100).toFixed(1)
        },
        disk: {
          total: primaryDisk ? primaryDisk.size : 0,
          used: primaryDisk ? primaryDisk.used : 0,
          percent: primaryDisk ? primaryDisk.use : 0
        },
        network: {
          rx_sec: rx_sec,
          tx_sec: tx_sec
        },
        os: {
          platform: osInfo.platform,
          distro: osInfo.distro,
          release: osInfo.release,
          uptime: si.time().uptime
        }
      };

      // Push to history
      systemHistory.push({
        time: Date.now(),
        cpu: parseFloat(stats.cpu.load),
        memory: parseFloat(stats.memory.percent),
        memoryUsed: stats.memory.used,
        memoryTotal: stats.memory.total
      });
      if (systemHistory.length > MAX_HISTORY) {
        systemHistory.shift();
      }

      // Health Check & Telegram Notifications
      try {
        const fs = require('fs');
        const path = require('path');
        const PREFS_FILE = path.join(__dirname, '..', 'data', 'preferences.json');
        if (fs.existsSync(PREFS_FILE)) {
          const prefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
          if (prefs.telegramToken && prefs.telegramChatId) {
            const { sendTelegramMessage } = require('./telegram');
            const cpuLoad = parseFloat(stats.cpu.load);
            const memPercent = parseFloat(stats.memory.percent);
            const diskPercent = typeof stats.disk.percent === 'number' ? stats.disk.percent : parseFloat(stats.disk.percent);
            if (cpuLoad > 90) {
              sendTelegramMessage(prefs.telegramToken, prefs.telegramChatId, `⚠️ <b>Allarme CasaOS</b>\nCarico CPU critico: ${cpuLoad}%`);
            }
            if (memPercent > 95) {
              sendTelegramMessage(prefs.telegramToken, prefs.telegramChatId, `⚠️ <b>Allarme CasaOS</b>\nUtilizzo RAM critico: ${memPercent}%`);
            }
            if (diskPercent > 90) {
              sendTelegramMessage(prefs.telegramToken, prefs.telegramChatId, `⚠️ <b>Allarme CasaOS</b>\nSpazio disco in esaurimento: ${diskPercent.toFixed(1)}%`);
            }
          }
        }
      } catch (err) {
        console.error('[Broadcaster] Telegram check error:', err.message);
      }

      // Emit stats
      io.emit('system.stats', stats);

    } catch (e) {
      console.error('[Broadcaster] Error fetching stats:', e.message);
    }

    try {
      // 2. Fetch Containers
      const containers = await docker.listContainers({ all: true });
      injectCasaOSMetadata(containers, CASAOS_APPS_DIR);
      io.emit('docker.containers', containers);
    } catch (e) {
      console.error('[Broadcaster] Error fetching containers:', e.message);
    }

  }, 3000); // Poll every 3 seconds for broadcast
};

module.exports = { initBroadcaster, getSystemHistory };
