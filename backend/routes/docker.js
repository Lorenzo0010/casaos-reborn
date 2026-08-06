const express = require('express');
const { isDeepStrictEqual } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const Docker = require('dockerode');
const { checkUpdates, getUpdaterStatus } = require('../services/updater');
const { buildCasaOSCompose } = require('../utils/yamlBuilder');
const { syncWithCasaOS, unsyncFromCasaOS } = require('../utils/casaosSync');
const { saveState } = require('../utils/stateManager');
const { isLocked, withContainerLock } = require('../utils/containerLocks');

// Base directory for CasaOS compose apps
const CASAOS_APPS_DIR = process.env.CASAOS_APPS_DIR || (process.platform === 'win32' ? path.join(os.homedir(), 'casaos-apps') : '/var/lib/casaos/apps');
if (!fs.existsSync(CASAOS_APPS_DIR)) {
  fs.mkdirSync(CASAOS_APPS_DIR, { recursive: true });
}

// Connect to local docker socket
const docker = new Docker();

global.activeTasks = global.activeTasks || {};

// Get active background tasks
router.get('/tasks', (req, res) => {
  res.json(Object.values(global.activeTasks));
});

// Get available updates from cache
router.get('/updates', (req, res) => {
  res.json({
    updates: Object.values(global.availableUpdates || {}),
    status: getUpdaterStatus()
  });
});

// Trigger manual update check
router.post('/check-updates', async (req, res) => {
  try {
    // Run asynchronously
    checkUpdates(req.io).catch(err => console.error("Error during manual check:", err));
    res.json({ success: true, message: 'Update check started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    
    const { injectCasaOSMetadata } = require('../utils/yamlBuilder');
    injectCasaOSMetadata(containers, CASAOS_APPS_DIR);
    
    res.json(containers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get container inspect details
router.get('/containers/:id/inspect', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const data = await container.inspect();
    
    try {
      const image = docker.getImage(data.Image);
      const imageData = await image.inspect();
      data.ImageEnv = imageData.Config?.Env || [];
    } catch (e) {
      console.warn("Could not fetch image info for", data.Image, e.message);
      data.ImageEnv = [];
    }
    
    const { injectCasaOSMetadata } = require('../utils/yamlBuilder');
    injectCasaOSMetadata(data, CASAOS_APPS_DIR);
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function getOwnContainerId() {
  try {
    const data = fs.readFileSync('/proc/self/mountinfo', 'utf8');
    const match = data.match(/containers\/([a-f0-9]{64})/);
    if (match) return match[1];
  } catch (e) {}

  try {
    const data = fs.readFileSync('/proc/self/cgroup', 'utf8');
    const match = data.match(/(?:docker|containers)\/([a-f0-9]{64})/);
    if (match) return match[1];
  } catch (e) {}

  try {
    const os = require('os');
    return os.hostname();
  } catch (e) {}

  return null;
}

// Recreate a container with new settings
router.post('/containers/:id/recreate', async (req, res) => {
  const { id } = req.params;
  const { image, tag, name, displayName } = req.body;
  const fullImage = tag ? `${image}:${tag}` : image;
  const io = req.io;
  
  let containerName = (name || '').replace('/', '').replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9_-]/g, '');

  try {
    const oldContainer = docker.getContainer(id);
    const oldInspect = await oldContainer.inspect();
    if (!containerName) {
      containerName = oldInspect.Name.replace('/', '').replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    }
    
    // Port Validation
    const requestedPorts = [];
    if (req.body.webUI && req.body.webUI.port && req.body.webUI.port !== '0') {
        requestedPorts.push(String(req.body.webUI.port));
    }
    if (req.body.ports) {
        Object.values(req.body.ports).forEach(bindings => {
            bindings.forEach(b => {
                if (b.HostPort) requestedPorts.push(String(b.HostPort));
            });
        });
    }

    if (requestedPorts.length > 0) {
        const allContainers = await docker.listContainers({ all: true });
        const conflict = requestedPorts.find(port => {
            return allContainers.some(c => {
                if (c.Id.startsWith(id)) return false;
                if (containerName && c.Names && c.Names.includes(`/${containerName}`)) return false;
                return c.Ports && c.Ports.some(cp => String(cp.PublicPort) === port);
            });
        });
        if (conflict) {
            return res.status(409).json({ error: `Port ${conflict} is already in use by another container.` });
        }
    }

    res.status(202).json({ success: true, message: 'Recreate started', id });
    req.body.name = containerName;
    const oldImage = oldInspect.Config.Image;
    
    withContainerLock(containerName, async () => {
    const taskId = `recreate_${id}`;
    
    global.activeTasks[taskId] = {
      id: id,
      taskId,
      type: 'recreate',
      name: containerName,
      image: fullImage,
      status: 'Generating compose file...',
      progressDetail: null
    };
    saveState();

    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Generating compose file...', taskId });

    const composeYaml = buildCasaOSCompose(req.body);
    const appDir = path.join(CASAOS_APPS_DIR, containerName);
    
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true });
    }
    
    const composePath = path.join(appDir, 'docker-compose.yml');
    fs.writeFileSync(composePath, composeYaml, 'utf8');

    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Pulling latest image...', taskId });

    // Pull image using compose
    try {
      await new Promise((resolve, reject) => {
        exec('docker compose pull -q', { cwd: appDir, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
          if (error) {
             console.warn(`docker compose pull error: ${error.message}`);
             // We don't reject here, we allow up -d to try
          }
          resolve();
        });
      });
    } catch(e) {}

    const projectName = oldInspect.Config?.Labels?.['com.docker.compose.project'];

    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Recreating container via Compose...', taskId });
    
    // Rimuoviamo sempre il container forzatamente prima per evitare errori di 'name conflict' con docker compose up.
    // Docker Compose lo ricreerà tranquillamente.
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Removing old container...', taskId });
    try {
      await oldContainer.remove({ force: true });
    } catch (removeErr) {
      console.warn('Failed to remove old container (might be already gone):', removeErr.message);
    }

    // 3. Eseguiamo la sincronizzazione con CasaOS Originale.
    // Se ha successo, CasaOS originale eseguirà "docker compose up" nativamente e inietterà
    // i suoi label segreti (es. working_dir), rendendo l'app ufficialmente Nativa.
    let syncSuccess = false;
    
    try {
      await syncWithCasaOS(composePath, io);
      syncSuccess = true;
    } catch (err) {
      console.warn('Sincronizzazione CasaOS fallita, fallback su docker compose locale:', err.message);
    }

    // Se la sincronizzazione nativa ha fallito (es. CasaOS non installato), eseguiamo in locale.
    if (!syncSuccess) {
      await new Promise((resolve, reject) => {
        exec('docker compose up -d --quiet-pull', { cwd: appDir, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
          if (error) {
            console.error(`docker compose up error: ${error.message}`);
            return reject(error);
          }
          resolve(stdout);
        });
      });
    }

    // Find the new container ID to return it
    const containers = await docker.listContainers();
    const newContainerInfo = containers.find(c => 
      c.Names.includes(`/${containerName}`) || 
      (c.Labels && c.Labels['com.docker.compose.project'] === containerName)
    );

    if (global.availableUpdates && global.availableUpdates[id]) {
      delete global.availableUpdates[id];
      if (io) io.emit('updater.results', Object.values(global.availableUpdates));
    }
    if (global.activeTasks[taskId]) {
      delete global.activeTasks[taskId];
      saveState();
    }
    if (io) io.emit('container.recreate.success', { 
      id: newContainerInfo ? newContainerInfo.Id : id, 
      oldId: id, 
      name: containerName, 
      taskId 
    });
    }).catch(error => {
      console.error('Error recreating container (background):', error);
      const taskId = `recreate_${id}`;
      if (global.activeTasks[taskId]) {
        delete global.activeTasks[taskId];
        saveState();
      }
      if (io) io.emit('container.recreate.error', { id, name: req.body.name || id, error: error.message, taskId });
    });
  } catch (error) {
    console.error('Error in recreate route (sync):', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a container preserving ALL its existing settings
router.post('/containers/:id/update', async (req, res) => {
  const { id } = req.params;
  let { image } = req.body;
  const io = req.io;

  res.status(202).json({ success: true, message: 'Update started', id });

  try {
    const oldContainer = docker.getContainer(id);
    const oldInspect = await oldContainer.inspect();
    const containerName = oldInspect.Name.replace('/', '');
    
    // Se l'immagine non è passata nel body, usa quella attuale del container
    if (!image) {
      image = oldInspect.Config.Image;
    }
    
    if (isLocked(containerName)) {
        return res.status(409).json({ error: `An operation is already in progress for container: ${containerName}` });
    }

    withContainerLock(containerName, async () => {
    const taskId = `recreate_${id}`;
    
    global.activeTasks[taskId] = {
      id: id,
      taskId,
      type: 'recreate',
      name: containerName,
      image,
      status: 'Inizializzazione aggiornamento...',
      progressDetail: null
    };
    saveState();

    const projectName = oldInspect.Config.Labels?.['com.docker.compose.project'];
    
    if (projectName) {
      // Compose Engine
      const appDir = path.join(CASAOS_APPS_DIR, projectName);
      if (fs.existsSync(appDir)) {
        if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Pulling latest image via Compose...', taskId });
        
        await new Promise((resolve, reject) => {
          exec('docker compose pull -q', { cwd: appDir, maxBuffer: 1024 * 1024 * 10 }, (error) => {
            if (error) console.warn(`docker compose pull error: ${error.message}`);
            resolve();
          });
        });

        if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Removing old container...', taskId });
        try {
          await oldContainer.remove({ force: true });
        } catch (removeErr) {
          console.warn('Failed to remove old container (might be already gone):', removeErr.message);
        }

        if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Recreating container via Compose...', taskId });
        
        const composePath = path.join(appDir, 'docker-compose.yml');
        let syncSuccess = false;
        
        try {
          await syncWithCasaOS(composePath, io);
          syncSuccess = true;
        } catch (err) {
          console.warn('Sincronizzazione CasaOS fallita durante update, fallback su docker compose locale:', err.message);
        }

        if (!syncSuccess) {
          await new Promise((resolve, reject) => {
            exec('docker compose up -d --quiet-pull', { cwd: appDir, maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
              if (error) return reject(error);
              resolve(stdout);
            });
          });
        }
        
        if (global.availableUpdates && global.availableUpdates[id]) {
          delete global.availableUpdates[id];
          if (io) io.emit('updater.results', Object.values(global.availableUpdates));
        }
        if (global.activeTasks[taskId]) {
          delete global.activeTasks[taskId];
          saveState();
        }
        if (io) io.emit('container.recreate.success', { id, name: containerName, taskId });
        return;
      }
    }

    // Fallback: Legacy / Standalone Container Update
    // Se il container è legacy, lo convertiamo in un'app CasaOS Nativa!
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Converting Legacy container to Native...', taskId });
    
    // Costruiamo il payload per buildCasaOSCompose partendo da oldInspect
    const payload = {
      name: containerName,
      image: image.split(':')[0],
      tag: image.split(':')[1] || 'latest',
      restartPolicy: oldInspect.HostConfig?.RestartPolicy?.Name || 'unless-stopped',
      networkMode: oldInspect.HostConfig?.NetworkMode || 'bridge',
      privileged: !!oldInspect.HostConfig?.Privileged,
      memory: oldInspect.HostConfig?.Memory,
      cpuQuota: oldInspect.HostConfig?.CpuShares,
      cmd: oldInspect.Config?.Cmd,
      capAdd: oldInspect.HostConfig?.CapAdd,
      ports: {},
      volumes: [],
      env: oldInspect.Config?.Env || [],
      displayName: oldInspect.Config?.Labels?.['casaos.app.name'] || containerName,
      icon: oldInspect.Config?.Labels?.['icon']
    };

    if (oldInspect.HostConfig?.PortBindings) {
      for (const [key, bindings] of Object.entries(oldInspect.HostConfig.PortBindings)) {
        if (bindings) {
          payload.ports[key] = bindings.map(b => ({ HostPort: b.HostPort }));
        }
      }
    }

    if (oldInspect.HostConfig?.Binds) {
      payload.volumes = oldInspect.HostConfig.Binds;
    }
    if (oldInspect.HostConfig?.Devices) {
      payload.devices = oldInspect.HostConfig.Devices;
    }

    // Aggiungiamo i label webUI se presenti
    if (oldInspect.Config?.Labels?.['casaos.reborn.web.port']) {
      payload.webUI = {
        scheme: oldInspect.Config.Labels['casaos.reborn.web.scheme'] || 'http',
        path: oldInspect.Config.Labels['casaos.reborn.web.path'] || '/',
        port: oldInspect.Config.Labels['casaos.reborn.web.port']
      };
    }

    const composeYaml = buildCasaOSCompose(payload);
    const appDir = path.join(CASAOS_APPS_DIR, containerName);
    
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true });
    }
    
    const composePath = path.join(appDir, 'docker-compose.yml');
    fs.writeFileSync(composePath, composeYaml, 'utf8');

    if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Pulling latest image...', taskId });
    try {
      await new Promise((resolve, reject) => {
        exec('docker compose pull -q', { cwd: appDir, maxBuffer: 1024 * 1024 * 10 }, (error) => resolve());
      });
    } catch(e) {}

    if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Removing old container...', taskId });
    try { await oldContainer.remove({ force: true }); } catch (removeErr) {}

    if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Recreating container as Native CasaOS app...', taskId });
    
    let syncSuccess = false;
    try {
      await syncWithCasaOS(composePath, io);
      syncSuccess = true;
    } catch (err) {
      console.warn('Sincronizzazione CasaOS fallita durante conversione Legacy->Native:', err.message);
    }

    if (!syncSuccess) {
      await new Promise((resolve, reject) => {
        exec('docker compose up -d --quiet-pull', { cwd: appDir, maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
          if (error) return reject(error);
          resolve(stdout);
        });
      });
    }
    
    // Find the new container ID to return it
    const containers = await docker.listContainers();
    const newContainerInfo = containers.find(c => 
      c.Names.includes(`/${containerName}`) || 
      (c.Labels && c.Labels['com.docker.compose.project'] === containerName)
    );
    const newContainerId = newContainerInfo ? newContainerInfo.Id : id;

    // Remove from available updates cache
    if (global.availableUpdates && global.availableUpdates[id]) {
      delete global.availableUpdates[id];
      if (io) io.emit('updater.results', Object.values(global.availableUpdates));
    }

    if (global.activeTasks[taskId]) {
      delete global.activeTasks[taskId];
      saveState();
    }
    if (io) io.emit('container.recreate.success', { id: newContainerId, oldId: id, name: containerName, taskId });
    }).catch(error => {
      console.error('Error updating container (background):', error);
      const taskId = `recreate_${id}`;
      if (global.activeTasks[taskId]) {
        delete global.activeTasks[taskId];
        saveState();
      }
      if (io) io.emit('container.recreate.error', { id, error: error.message, taskId });
    });
  } catch (error) {
    console.error('Error in update route (sync):', error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

router.post('/containers/:id/:action', async (req, res) => {
  const { id, action } = req.params;
  try {
    const container = docker.getContainer(id);
    let inspectData;
    try {
      inspectData = await container.inspect();
    } catch (e) {
      if (action === 'delete') {
         // Already doesn't exist, just return success
         return res.json({ success: true, action, id });
      }
      throw e;
    }
    
    const containerName = inspectData.Name.replace(/^\//, '');
    
    // Blocco di sicurezza per i container di sistema
    if ((containerName === 'casaos-reborn' || containerName === 'casaos-updater') && (action === 'stop' || action === 'delete')) {
      return res.status(403).json({ error: "Azione negata: Non puoi arrestare o eliminare i container di sistema di CasaOS Reborn per evitare danni irreparabili." });
    }
    
    if (isLocked(containerName)) {
      return res.status(409).json({ error: `An operation is already in progress for container: ${containerName}` });
    }
    
    await withContainerLock(containerName, async () => {
    
    if (action === 'start') await container.start();
    else if (action === 'stop') await container.stop();
    else if (action === 'restart') await container.restart();
    else if (action === 'delete') {
      const composeProject = inspectData.Config?.Labels?.['com.docker.compose.project'];
      
      if (composeProject) {
         // It's a compose app, we should docker compose down and remove directory
         const appDir = path.join(CASAOS_APPS_DIR, composeProject);
         if (fs.existsSync(appDir)) {
           
           // Rimuoviamo dal DB di CasaOS Originale in background
           unsyncFromCasaOS(composeProject);
           
           await new Promise((resolve, reject) => {
             exec('docker compose down', { cwd: appDir }, (error) => {
               if (error) console.warn('docker compose down error:', error.message);
               resolve();
             });
           });
           
           // Remove the folder
           fs.rmSync(appDir, { recursive: true, force: true });
         } else {
           // Fallback to normal remove
           await container.remove({ force: true });
         }
      } else {
         // Regular container
         await container.remove({ force: true });
      }
    }
    else throw new Error('Invalid action');
    
    res.json({ success: true, action, id });
    }); // end withContainerLock
  } catch (error) {
    let errorMsg = error.message;
    // Se l'engine Docker restituisce un 404 durante l'avvio, spesso è dovuto a una rete o un volume eliminato.
    if (error.statusCode === 404 && action === 'start') {
      errorMsg = "Il container non può essere avviato perché una risorsa da cui dipende (es. una Rete o un Volume) è stata eliminata. Prova a ricreare o aggiornare il container dalle impostazioni.";
    }
    res.status(500).json({ error: errorMsg });
  }
});

// Create a new container
router.post('/containers/create', async (req, res) => {
  const { image, tag, name, displayName, ports, env, volumes, restartPolicy, privileged, memory, webUI, icon, networkMode, hostname, cpuQuota, devices, cmd, capAdd, pidMode } = req.body;
  const fullImage = tag ? `${image}:${tag}` : image;
  const io = req.io;
  
  let containerName = (name || '').replace('/', '').replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9_-]/g, '');

  try {
    // Port Validation
    const requestedPorts = [];
    if (webUI && webUI.port && webUI.port !== '0') {
        requestedPorts.push(String(webUI.port));
    }
    if (ports) {
        Object.values(ports).forEach(bindings => {
            bindings.forEach(b => {
                if (b.HostPort) requestedPorts.push(String(b.HostPort));
            });
        });
    }

    if (requestedPorts.length > 0) {
        const allContainers = await docker.listContainers({ all: true });
        const conflict = requestedPorts.find(port => {
            return allContainers.some(c => {
                if (containerName && c.Names && c.Names.includes(`/${containerName}`)) return false;
                return c.Ports && c.Ports.some(cp => String(cp.PublicPort) === port);
            });
        });
        if (conflict) {
            return res.status(409).json({ error: `Port ${conflict} is already in use by another container.` });
        }
    }

    res.status(202).json({ success: true, message: 'Creation started' });
    req.body.name = containerName;
    
    withContainerLock(containerName, async () => {
    const taskId = `create_${containerName}`;
    
    global.activeTasks[taskId] = {
      id: taskId,
      type: 'create',
      name: containerName,
      image: fullImage,
      status: 'Pulling image...',
      progressDetail: null
    };
    saveState();

    // Always pull the image
    if (io) io.emit('container.create.progress', global.activeTasks[taskId]);
    let pullFailed = false;
    let pullLayers = {}; // Track progress per layer
    try {
      await new Promise((resolve, reject) => {
        docker.pull(fullImage, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err, output) => {
            if (err) return reject(err);
            resolve(output);
          }, (event) => {
            let unifiedProgress = event.progressDetail;
            if (event.id && event.progressDetail && event.progressDetail.total) {
              pullLayers[event.id] = { current: event.progressDetail.current || 0, total: event.progressDetail.total || 0 };
              let overallCurrent = 0, overallTotal = 0;
              for (let layerId in pullLayers) {
                overallCurrent += pullLayers[layerId].current;
                overallTotal += pullLayers[layerId].total;
              }
              unifiedProgress = { current: overallCurrent, total: overallTotal };
            }
            if (global.activeTasks[taskId]) {
              global.activeTasks[taskId].status = event.status;
              global.activeTasks[taskId].progressDetail = unifiedProgress;
            }
            if (io) {
              io.emit('container.create.progress', {
                name: containerName,
                image: fullImage,
                status: event.status,
                progressDetail: unifiedProgress,
                taskId
              });
            }
          });
        });
      });
    } catch (pullError) {
      console.warn('Failed to pull image during create:', pullError.message);
      pullFailed = true;
    }

    // Check if image exists locally if pull failed
    try {
      await docker.getImage(fullImage).inspect();
    } catch (e) {
      if (pullFailed) {
        throw new Error(`Failed to pull image and it is not available locally: ${fullImage}`);
      }
    }

    if (io) io.emit('container.create.progress', { name: containerName, image: fullImage, status: 'Applying settings...', taskId });

    // 2. Build Compose File
    if (io) io.emit('container.create.progress', { name: containerName, image: fullImage, status: 'Applying settings (Compose)...', taskId });
    
    const composeYaml = buildCasaOSCompose(req.body);
    const appDir = path.join(CASAOS_APPS_DIR, containerName);
    
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true });
    }
    
    const composePath = path.join(appDir, 'docker-compose.yml');
    fs.writeFileSync(composePath, composeYaml, 'utf8');

    // 3. Eseguiamo la sincronizzazione con CasaOS Originale.
    let syncSuccess = false;
    try {
      await syncWithCasaOS(composePath, io);
      syncSuccess = true;
    } catch (err) {
      console.warn('Sincronizzazione CasaOS fallita, fallback su docker compose locale:', err.message);
    }

    // Se la sincronizzazione nativa ha fallito (es. CasaOS non installato), eseguiamo in locale.
    if (!syncSuccess) {
      await new Promise((resolve, reject) => {
        exec('docker compose up -d --quiet-pull', { cwd: appDir, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
          if (error) {
            console.error(`docker compose up error: ${error.message}`);
            return reject(error);
          }
          resolve(stdout);
        });
      });
    }
    
    // Find the new container ID to return it
    const containers = await docker.listContainers();
    const newContainerInfo = containers.find(c => 
      c.Names.includes(`/${containerName}`) || 
      (c.Labels && c.Labels['com.docker.compose.project'] === containerName)
    );
    
    if (global.activeTasks[taskId]) {
      delete global.activeTasks[taskId];
      saveState();
    }
    if (io) io.emit('container.create.success', { 
      id: newContainerInfo ? newContainerInfo.Id : containerName, 
      name: containerName, 
      taskId 
    });
    }).catch(error => {
      console.error('Error creating container (background):', error);
      const taskId = `create_${containerName}`;
      if (global.activeTasks[taskId]) {
        delete global.activeTasks[taskId];
        saveState();
      }
      if (io) io.emit('container.create.error', { name, error: error.message, taskId });
    });
  } catch (error) {
    console.error('Error in create route (sync):', error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});



// Get container logs
router.get('/containers/:id/logs', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const inspectData = await container.inspect();
    const startedAt = Math.floor(new Date(inspectData.State.StartedAt).getTime() / 1000);

    const logs = await container.logs({
      stdout: true,
      stderr: true,
      since: startedAt
    });
    let cleanLogs = '';
    if (inspectData.Config.Tty) {
      // Se Tty è abilitato, il log è già testo puro
      cleanLogs = logs.toString('utf8');
    } else {
      // Se Tty è disabilitato, il log è multiplexato con un header di 8 byte per ogni riga
      let offset = 0;
      while (offset < logs.length) {
        if (logs.length - offset < 8) break;
        const payloadSize = logs.readUInt32BE(offset + 4);
        offset += 8;
        if (offset + payloadSize > logs.length) break;
        cleanLogs += logs.toString('utf8', offset, offset + payloadSize);
        offset += payloadSize;
      }
    }
    
    res.send(cleanLogs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
