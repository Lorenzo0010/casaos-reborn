const express = require('express');
const router = express.Router();
const si = require('systeminformation');

// Get current system load/stats
router.get('/stats', async (req, res) => {
  try {
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

    res.json({
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
    });
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({ error: 'Failed to fetch system statistics' });
  }
});

const fs = require('fs');
const path = require('path');
const PREFS_DIR = path.join(__dirname, '..', 'data');
const PREFS_FILE = path.join(PREFS_DIR, 'preferences.json');

router.get('/preferences', (req, res) => {
  try {
    if (fs.existsSync(PREFS_FILE)) {
      const data = fs.readFileSync(PREFS_FILE, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json({});
    }
  } catch (error) {
    console.error('Error reading preferences:', error);
    res.status(500).json({ error: 'Failed to read preferences' });
  }
});

router.post('/preferences', (req, res) => {
  try {
    if (!fs.existsSync(PREFS_DIR)) {
      fs.mkdirSync(PREFS_DIR, { recursive: true });
    }
    let existingPrefs = {};
    if (fs.existsSync(PREFS_FILE)) {
      try { existingPrefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')); } catch (e) {}
    }
    const newPrefs = { ...existingPrefs, ...req.body };
    fs.writeFileSync(PREFS_FILE, JSON.stringify(newPrefs, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

module.exports = router;
