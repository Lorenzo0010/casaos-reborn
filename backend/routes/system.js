const express = require('express');
const router = express.Router();
const si = require('systeminformation');

// Get current system load/stats
router.get('/stats', async (req, res) => {
  try {
    const [cpuLoad, mem, fsSize, osInfo, cpuTemp] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.cpuTemperature()
    ]);

    const primaryDisk = fsSize.find(fs => fs.mount === '/') || fsSize[0];

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

module.exports = router;
