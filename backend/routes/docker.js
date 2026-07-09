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

// Base directory for CasaOS compose apps
const CASAOS_APPS_DIR = process.env.CASAOS_APPS_DIR || (process.platform === 'win32' ? path.join(os.homedir(), 'casaos-apps') : '/var/lib/casaos/apps');
if (!fs.existsSync(CASAOS_APPS_DIR)) {
  fs.mkdirSync(CASAOS_APPS_DIR, { recursive: true });
}

// Connect to local docker socket
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

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
    
    // Inject x-casaos metadata from docker-compose.yml if available
    for (const c of containers) {
      const projectName = c.Labels?.['com.docker.compose.project'];
      if (projectName) {
        const appDir = path.join(CASAOS_APPS_DIR, projectName);
        const composePath = path.join(appDir, 'docker-compose.yml');
        if (fs.existsSync(composePath)) {
          const yamlStr = fs.readFileSync(composePath, 'utf8');
          const { parseCasaOSMetadata } = require('../utils/yamlBuilder');
          const metadata = parseCasaOSMetadata(yamlStr);
          
          if (!c.Labels) c.Labels = {};
          if (metadata.name) c.Labels['casaos.reborn.name'] = metadata.name;
          if (metadata.icon) c.Labels['casaos.reborn.icon'] = metadata.icon;
          if (metadata.scheme) c.Labels['casaos.reborn.web.scheme'] = metadata.scheme;
          if (metadata.path) c.Labels['casaos.reborn.web.path'] = metadata.path;
          if (metadata.port) c.Labels['casaos.reborn.web.port'] = metadata.port;
        }
      }
    }
    
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
    
    const projectName = data.Config?.Labels?.['com.docker.compose.project'];
    if (projectName) {
      const appDir = path.join(CASAOS_APPS_DIR, projectName);
      const composePath = path.join(appDir, 'docker-compose.yml');
      if (fs.existsSync(composePath)) {
        const yamlStr = fs.readFileSync(composePath, 'utf8');
        const { parseCasaOSMetadata } = require('../utils/yamlBuilder');
        const metadata = parseCasaOSMetadata(yamlStr);
        
        if (!data.Config.Labels) data.Config.Labels = {};
        if (metadata.name) data.Config.Labels['casaos.reborn.name'] = metadata.name;
        if (metadata.icon) data.Config.Labels['casaos.reborn.icon'] = metadata.icon;
        if (metadata.scheme) data.Config.Labels['casaos.reborn.web.scheme'] = metadata.scheme;
        if (metadata.path) data.Config.Labels['casaos.reborn.web.path'] = metadata.path;
        if (metadata.port) data.Config.Labels['casaos.reborn.web.port'] = metadata.port;
      }
    }
    
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
  
  let containerName = (name || '').replace('/', '');

  res.status(202).json({ success: true, message: 'Recreate started', id });

  try {
    const oldContainer = docker.getContainer(id);
    const oldInspect = await oldContainer.inspect();
    if (!containerName) {
      containerName = oldInspect.Name.replace('/', '');
      req.body.name = containerName;
    }
    const oldImage = oldInspect.Config.Image;
    
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
        exec('docker compose pull', { cwd: appDir }, (error, stdout, stderr) => {
          if (error) {
             console.warn(`docker compose pull error: ${error.message}`);
             // We don't reject here, we allow up -d to try
          }
          resolve();
        });
      });
    } catch(e) {}

    // --- DETACHED UPDATER FOR SELF-UPDATE ---
    const ownId = getOwnContainerId();
    let isSelfUpdate = false;
    if (ownId && (id.startsWith(ownId) || ownId.startsWith(id))) {
      isSelfUpdate = true;
    } else if (containerName === 'casaos-reborn' || (oldInspect.Name && oldInspect.Name.replace('/', '') === 'casaos-reborn')) {
      isSelfUpdate = true;
    }

    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Recreating container via Compose...', taskId });

    if (isSelfUpdate) {
      console.log('Initiating detached self-update via compose for container', id);
      if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Rebooting system...', taskId });
      // Spawn docker compose detached so it kills us and restarts us
      const { spawn } = require('child_process');
      const child = spawn('docker', ['compose', 'up', '-d'], {
        detached: true,
        stdio: 'ignore',
        cwd: appDir
      });
      child.unref();
      return; // We will be killed shortly
    }

    // Execute Docker Compose
    await new Promise((resolve, reject) => {
      exec('docker compose up -d', { cwd: appDir }, (error, stdout, stderr) => {
        if (error) {
          console.error(`docker compose up error: ${error.message}`);
          return reject(error);
        }
        resolve(stdout);
      });
    });

    // Find the new container ID to return it
    const containers = await docker.listContainers();
    const newContainerInfo = containers.find(c => 
      c.Names.includes(`/${containerName}`) || 
      (c.Labels && c.Labels['com.docker.compose.project'] === containerName)
    );

    if (global.activeTasks[taskId]) delete global.activeTasks[taskId];
    if (io) io.emit('container.recreate.success', { 
      id: newContainerInfo ? newContainerInfo.Id : id, 
      oldId: id, 
      name: containerName, 
      taskId 
    });
  } catch (error) {
    console.error('Error recreating container:', error);
    const taskId = `recreate_${id}`;
    if (global.activeTasks[taskId]) delete global.activeTasks[taskId];
    if (io) io.emit('container.recreate.error', { id, name: req.body.name || id, error: error.message, taskId });
  }
});

// Update a container preserving ALL its existing settings
router.post('/containers/:id/update', async (req, res) => {
  const { id } = req.params;
  const { image } = req.body;
  const io = req.io;

  res.status(202).json({ success: true, message: 'Update started', id });

  try {
    const oldContainer = docker.getContainer(id);
    const oldInspect = await oldContainer.inspect();
    const containerName = oldInspect.Name.replace('/', '');
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

    const projectName = oldInspect.Config.Labels?.['com.docker.compose.project'];
    
    if (projectName) {
      // Compose Engine
      const appDir = path.join(CASAOS_APPS_DIR, projectName);
      if (fs.existsSync(appDir)) {
        if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Pulling latest image via Compose...', taskId });
        
        await new Promise((resolve, reject) => {
          exec('docker compose pull', { cwd: appDir }, (error) => {
            if (error) console.warn(`docker compose pull error: ${error.message}`);
            resolve();
          });
        });

        if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Recreating container via Compose...', taskId });
        
        await new Promise((resolve, reject) => {
          exec('docker compose up -d', { cwd: appDir }, (error, stdout) => {
            if (error) return reject(error);
            resolve(stdout);
          });
        });
        
        if (global.activeTasks[taskId]) delete global.activeTasks[taskId];
        if (io) io.emit('container.recreate.success', { id, name: containerName, taskId });
        return;
      }
    }

    // Fallback: Legacy / Standalone Container Update
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Stopping old container...', taskId });
    try { await oldContainer.stop({ t: 10 }); } catch (e) {}

    if (global.activeTasks[taskId]) global.activeTasks[taskId].status = 'Removing old container...';
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Removing old container...', taskId });
    try { await oldContainer.remove({ v: false }); } catch (e) {
      await oldContainer.remove({ force: true, v: false }).catch(() => {});
    }

    if (global.activeTasks[taskId]) global.activeTasks[taskId].status = 'Creating updated container...';
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Creating updated container...', taskId });
    
    const createOptions = {
      name: containerName,
      Image: image,
      Env: oldInspect.Config.Env,
      Labels: oldInspect.Config.Labels,
      ExposedPorts: oldInspect.Config.ExposedPorts,
      HostConfig: oldInspect.HostConfig,
      NetworkingConfig: {
        EndpointsConfig: oldInspect.NetworkSettings.Networks
      }
    };

    if (createOptions.NetworkingConfig?.EndpointsConfig) {
      for (const net of Object.values(createOptions.NetworkingConfig.EndpointsConfig)) {
        delete net.MacAddress;
      }
    }

    const newContainer = await docker.createContainer(createOptions);
    await newContainer.start();

    // Remove from available updates cache
    if (global.availableUpdates && global.availableUpdates[id]) {
      delete global.availableUpdates[id];
      if (io) io.emit('updater.results', Object.values(global.availableUpdates));
    }

    if (global.activeTasks[taskId]) delete global.activeTasks[taskId];
    if (io) io.emit('container.recreate.success', { id: newContainer.id, oldId: id, name: containerName, taskId });
  } catch (error) {
    console.error('Error updating container:', error);
    const taskId = `recreate_${id}`;
    if (global.activeTasks[taskId]) delete global.activeTasks[taskId];
    if (io) io.emit('container.recreate.error', { id, error: error.message, taskId });
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
    
    if (action === 'start') await container.start();
    else if (action === 'stop') await container.stop();
    else if (action === 'restart') await container.restart();
    else if (action === 'delete') {
      const composeProject = inspectData.Config?.Labels?.['com.docker.compose.project'];
      
      if (composeProject) {
         // It's a compose app, we should docker compose down and remove directory
         const appDir = path.join(CASAOS_APPS_DIR, composeProject);
         if (fs.existsSync(appDir)) {
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
    else return res.status(400).json({ error: 'Invalid action' });
    
    res.json({ success: true, action, id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new container
router.post('/containers/create', async (req, res) => {
  const { image, tag, name, displayName, ports, env, volumes, restartPolicy, privileged, memory, webUI, icon, networkMode, hostname, cpuQuota, devices, cmd, capAdd, pidMode } = req.body;
  const fullImage = tag ? `${image}:${tag}` : image;
  const io = req.io;
  
  res.status(202).json({ success: true, message: 'Creation started' });

  try {
    const containerName = (name || '').replace('/', '');
    const taskId = `create_${containerName}`;
    
    global.activeTasks[taskId] = {
      id: taskId,
      type: 'create',
      name: containerName,
      image: fullImage,
      status: 'Pulling image...',
      progressDetail: null
    };

    // Always pull the image
    if (io) io.emit('container.create.progress', global.activeTasks[taskId]);
    let pullFailed = false;
    try {
      await new Promise((resolve, reject) => {
        docker.pull(fullImage, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err, output) => {
            if (err) return reject(err);
            resolve(output);
          }, (event) => {
            if (global.activeTasks[taskId]) {
              global.activeTasks[taskId].status = event.status;
              global.activeTasks[taskId].progressDetail = event.progressDetail;
            }
            if (io) {
              io.emit('container.create.progress', {
                name: containerName,
                image: fullImage,
                status: event.status,
                progressDetail: event.progressDetail,
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

    // 3. Execute Docker Compose
    await new Promise((resolve, reject) => {
      exec('docker compose up -d', { cwd: appDir }, (error, stdout, stderr) => {
        if (error) {
          console.error(`docker compose error: ${error.message}`);
          return reject(error);
        }
        resolve(stdout);
      });
    });
    
    // Find the new container ID to return it
    const containers = await docker.listContainers();
    const newContainerInfo = containers.find(c => 
      c.Names.includes(`/${containerName}`) || 
      (c.Labels && c.Labels['com.docker.compose.project'] === containerName)
    );
    
    if (global.activeTasks[taskId]) delete global.activeTasks[taskId];
    if (io) io.emit('container.create.success', { 
      id: newContainerInfo ? newContainerInfo.Id : containerName, 
      name: containerName, 
      taskId 
    });
  } catch (error) {
    console.error('Error creating container:', error);
    const taskId = `create_${(name || '').replace('/', '')}`;
    if (global.activeTasks[taskId]) delete global.activeTasks[taskId];
    if (io) io.emit('container.create.error', { name, error: error.message, taskId });
  }
});


// Prune unused images
router.post('/images/prune', async (req, res) => {
  try {
    const result = await docker.pruneImages({ filters: { dangling: ["false"] } });
    res.json({ message: 'Immagini rimosse con successo', result });
  } catch (error) {
    console.error('Error pruning images:', error);
    res.status(500).json({ error: error.message });
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
