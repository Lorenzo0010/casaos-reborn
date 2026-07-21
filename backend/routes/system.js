const express = require('express');
const router = express.Router();
const si = require('systeminformation');
const { getSystemHistory } = require('../services/broadcaster');

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

// Get system history
router.get('/history', (req, res) => {
  try {
    const history = getSystemHistory();
    res.json(history);
  } catch (error) {
    console.error('Error fetching system history:', error);
    res.status(500).json({ error: 'Failed to fetch system history' });
  }
});

// Get top processes
router.get('/processes', async (req, res) => {
  try {
    const processData = await si.processes();
    
    // Sort by CPU by default and limit to 100 to save bandwidth
    const topProcesses = processData.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 100)
      .map(p => ({
        pid: p.pid,
        name: p.name,
        cpu: p.cpu,
        mem: p.mem,
        user: p.user,
        state: p.state
      }));
      
    res.json(topProcesses);
  } catch (error) {
    console.error('Error fetching processes:', error);
    res.status(500).json({ error: 'Failed to fetch processes' });
  }
});

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const PREFS_DIR = path.join(__dirname, '..', 'data');
const PREFS_FILE = path.join(PREFS_DIR, 'preferences.json');
const LOGS_FILE = path.join(PREFS_DIR, 'casaos.log');
const UPLOADS_DIR = path.join(PREFS_DIR, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, 'bg-' + Date.now() + ext);
  }
});
const upload = multer({ storage: storage });

router.post('/upload-bg', upload.single('background'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nessun file caricato' });
    }
    const bgUrl = `/uploads/${req.file.filename}`;
    
    // Auto-save to preferences
    let existingPrefs = {};
    if (fs.existsSync(PREFS_FILE)) {
      try { existingPrefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')); } catch (e) {}
    }
    existingPrefs.backgroundImage = bgUrl;
    fs.writeFileSync(PREFS_FILE, JSON.stringify(existingPrefs, null, 2));

    res.json({ success: true, backgroundImage: bgUrl });
  } catch (error) {
    console.error('Error uploading background:', error);
    res.status(500).json({ error: 'Failed to upload background' });
  }
});


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

router.get('/logs', (req, res) => {
  try {
    let prevData = '';
    const PREV_LOGS_FILE = path.join(PREFS_DIR, 'casaos.prev.log');
    if (fs.existsSync(PREV_LOGS_FILE)) {
      prevData = fs.readFileSync(PREV_LOGS_FILE, 'utf8');
      if (prevData.trim()) {
        prevData = `--- LOG SESSIONE PRECEDENTE ---\n${prevData}\n--- LOG SESSIONE ATTUALE ---\n`;
      }
    }

    let currentData = '';
    if (fs.existsSync(LOGS_FILE)) {
      currentData = fs.readFileSync(LOGS_FILE, 'utf8');
    }

    let data = prevData + currentData;

    if (data) {
      // Limit to last 500000 characters to avoid payload too large if log gets huge
      const content = data.length > 500000 ? data.substring(data.length - 500000) : data;
      res.send(content);
    } else {
      res.send('Nessun log disponibile.');
    }
  } catch (error) {
    console.error('Error reading logs:', error);
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

router.delete('/logs', (req, res) => {
  try {
    if (fs.existsSync(LOGS_FILE)) {
      fs.writeFileSync(LOGS_FILE, '');
    }
    const PREV_LOGS_FILE = path.join(PREFS_DIR, 'casaos.prev.log');
    if (fs.existsSync(PREV_LOGS_FILE)) {
      fs.writeFileSync(PREV_LOGS_FILE, '');
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing logs:', error);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

module.exports = router;
