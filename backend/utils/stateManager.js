const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'data', 'state.json');

const loadState = () => {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      global.activeTasks = data.activeTasks || {};
      global.availableUpdates = data.availableUpdates || {};
      console.log(`[StateManager] Loaded ${Object.keys(global.activeTasks).length} tasks and ${Object.keys(global.availableUpdates).length} updates from disk.`);
    } else {
      global.activeTasks = {};
      global.availableUpdates = {};
    }
  } catch (err) {
    console.error('[StateManager] Failed to load state:', err.message);
    global.activeTasks = {};
    global.availableUpdates = {};
  }
};

const saveState = () => {
  try {
    const data = {
      activeTasks: global.activeTasks || {},
      availableUpdates: global.availableUpdates || {}
    };
    // Save atomically to prevent corruption
    const tempFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, STATE_FILE);
  } catch (err) {
    console.error('[StateManager] Failed to save state:', err.message);
  }
};

module.exports = {
  loadState,
  saveState
};
