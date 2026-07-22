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

// Get top processes and container stats
const os = require('os');
router.get('/processes', async (req, res) => {
  try {
    const [processData, dockerStats, dockerContainersInfo] = await Promise.all([
      si.processes(),
      si.dockerContainerStats('*').catch(() => []),
      si.dockerContainers('all').catch(() => [])
    ]);
    
    // Sort by CPU by default and limit to 100 to save bandwidth
    const topProcesses = processData.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 100)
      .map(p => ({
        pid: p.pid,
        name: p.name,
        cpu: p.cpu / os.cpus().length,
        mem: p.mem,
        memBytes: (p.memRss || 0) * 1024,
        user: p.user,
        state: p.state
      }));

    let topContainers = [];
    if (Array.isArray(dockerStats)) {
      topContainers = dockerStats.map(c => {
        // Find matching container info to get the real name
        const info = Array.isArray(dockerContainersInfo) ? dockerContainersInfo.find(info => info.id === c.id) : null;
        let cName = info ? info.name : (c.name || 'Unknown');
        // Clean up name (Docker often prefixes with '/')
        if (cName.startsWith('/')) cName = cName.substring(1);
        
        return {
          id: c.id.substring(0, 12),
          name: cName,
          cpu: (c.cpuPercent || 0) / os.cpus().length,
          mem: c.memPercent || 0,
          memBytes: c.memUsage || 0
        };
      }).sort((a, b) => b.cpu - a.cpu);
    }
      
    res.json({ processes: topProcesses, containers: topContainers });
  } catch (error) {
    console.error('Error fetching processes:', error);
    res.status(500).json({ error: 'Failed to fetch processes' });
  }
});

// Get detailed network usage for containers and interfaces
router.get('/network-details', async (req, res) => {
  try {
    const [dockerStats, dockerContainersInfo, networkInterfaces] = await Promise.all([
      si.dockerContainerStats('*').catch(() => []),
      si.dockerContainers('all').catch(() => []),
      si.networkInterfaces().catch(() => [])
    ]);

    let containers = [];
    if (Array.isArray(dockerStats)) {
      containers = dockerStats.map(c => {
        const info = Array.isArray(dockerContainersInfo) ? dockerContainersInfo.find(info => info.id === c.id) : null;
        let cName = info ? info.name : (c.name || 'Unknown');
        if (cName.startsWith('/')) cName = cName.substring(1);
        
        return {
          id: c.id.substring(0, 12),
          name: cName,
          rx: c.netIO?.rx || 0,
          tx: c.netIO?.tx || 0
        };
      }).sort((a, b) => (b.rx + b.tx) - (a.rx + a.tx));
    }

    const interfaces = Array.isArray(networkInterfaces) ? networkInterfaces.map(net => ({
      iface: net.iface,
      ip4: net.ip4,
      operstate: net.operstate,
      type: net.type
    })) : [];

    res.json({ containers, interfaces });
  } catch (error) {
    console.error('Error fetching network details:', error);
    res.status(500).json({ error: 'Failed to fetch network details' });
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

const archiver = require('archiver');
const extract = require('extract-zip');
const { exec } = require('child_process');

const CASAOS_APPS_DIR = process.env.CASAOS_APPS_DIR || (process.platform === 'win32' ? path.join(os.homedir(), 'casaos-apps') : '/var/lib/casaos/apps');

router.get('/backup', async (req, res) => {
  try {
    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment('casaos_backup.zip');
    
    archive.on('error', (err) => {
      res.status(500).send({ error: err.message });
    });

    archive.pipe(res);

    // Add preferences folder
    if (fs.existsSync(PREFS_DIR)) {
      archive.directory(PREFS_DIR, 'data');
    }

    // Add CasaOS apps folder
    if (fs.existsSync(CASAOS_APPS_DIR)) {
      archive.directory(CASAOS_APPS_DIR, 'apps');
    }

    await archive.finalize();
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

router.post('/restore', upload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file di backup caricato' });

  try {
    const extractPath = path.join(os.tmpdir(), `casaos_restore_${Date.now()}`);
    
    await extract(req.file.path, { dir: extractPath });

    // Copy extracted data back
    const extractedDataPath = path.join(extractPath, 'data');
    if (fs.existsSync(extractedDataPath)) {
      fs.cpSync(extractedDataPath, PREFS_DIR, { recursive: true, force: true });
    }

    const extractedAppsPath = path.join(extractPath, 'apps');
    if (fs.existsSync(extractedAppsPath)) {
      fs.cpSync(extractedAppsPath, CASAOS_APPS_DIR, { recursive: true, force: true });
    }

    // Clean up
    fs.rmSync(extractPath, { recursive: true, force: true });
    fs.rmSync(req.file.path, { force: true });

    res.json({ success: true, message: 'Backup ripristinato. I container non sono stati riavviati automaticamente.' });
  } catch (error) {
    console.error('Restore error:', error);
    res.status(500).json({ error: 'Failed to restore backup' });
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
