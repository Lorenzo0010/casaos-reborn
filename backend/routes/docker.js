const express = require('express');
const { isDeepStrictEqual } = require('util');
const fs = require('fs');
const router = express.Router();
const Docker = require('dockerode');
const { checkUpdates } = require('../services/updater');

// Connect to local docker socket
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Get available updates from cache
router.get('/updates', (req, res) => {
  res.json(Object.values(global.availableUpdates || {}));
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

// Recreate container with new settings
router.post('/containers/:id/recreate', async (req, res) => {
  const { id } = req.params;
  const { image, tag, name, displayName, ports, env, volumes, restartPolicy, privileged, memory, webUI, icon, pidMode } = req.body;
  const fullImage = tag ? `${image}:${tag}` : image;
  const io = req.io;
  
  // Return early, continue processing in background
  res.status(202).json({ success: true, message: 'Recreation started', id });

  // Fix Bug 3: Declare containerName outside try-catch
  let containerName = name ? name.replace('/', '') : '';

  try {
    const oldContainer = docker.getContainer(id);
    const oldInspect = await oldContainer.inspect().catch(() => ({}));
    
    containerName = containerName || (oldInspect.Name || '').replace('/', '');
    const nameChanged = containerName !== (oldInspect.Name || '').replace('/', '');
    const oldImage = oldInspect.Config?.Image || '';
    const imageChanged = fullImage !== oldImage;
    
    // 1. Pull the image to check for updates
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Pulling image...' });
    let pullFailed = false;
    try {
      await new Promise((resolve, reject) => {
        docker.pull(fullImage, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err, output) => {
            if (err) return reject(err);
            resolve(output);
          }, (event) => {
            if (io) {
              io.emit('container.recreate.progress', {
                id,
                name: containerName,
                image: fullImage,
                status: event.status,
                progressDetail: event.progressDetail
              });
            }
          });
        });
      });
    } catch (pullError) {
      console.warn('Failed to pull image, continuing with local image if available:', pullError.message);
      pullFailed = true;
    }

    // 2. Check if the pulled image has a different hash than the one currently used
    let newImageInspect;
    try {
      newImageInspect = await docker.getImage(fullImage).inspect();
    } catch (e) {
      console.error('Failed to inspect new image:', e);
      if (pullFailed) {
        throw new Error(`Failed to pull image and it is not available locally: ${fullImage}`);
      }
    }
    const oldImageHash = oldInspect.Image; // The sha256 of the current container's image
    const newImageHash = newImageInspect ? newImageInspect.Id : null;
    const imageDigestChanged = newImageHash && oldImageHash && newImageHash !== oldImageHash;

    const imageStringChanged = fullImage !== oldImage;
    
    // Check if we can do an in-place update (fast path)
    const oldPortBindings = oldInspect.HostConfig?.PortBindings || {};
    const oldBinds = oldInspect.HostConfig?.Binds || [];
    const oldEnv = oldInspect.Config?.Env || [];
    
    const newPortBindings = ports || {};
    const newBinds = volumes || [];

    const oldWebUI = {
      scheme: oldInspect.Config?.Labels?.['casaos.reborn.web.scheme'] || 'http://',
      port: oldInspect.Config?.Labels?.['casaos.reborn.web.port'] || '',
      path: oldInspect.Config?.Labels?.['casaos.reborn.web.path'] || '/'
    };
    const newWebUI = webUI || oldWebUI;
    const oldDisplayName = oldInspect.Config?.Labels?.['casaos.reborn.name'] || '';
    const oldIcon = oldInspect.Config?.Labels?.['casaos.reborn.icon'] || '';
    const oldPidMode = oldInspect.HostConfig?.PidMode || '';
    const newPidMode = pidMode !== undefined ? pidMode : oldPidMode;

    // A full recreate is required if image string changed, image digest changed, or config changed
    const needsFullRecreate = 
      nameChanged ||
      imageStringChanged ||
      imageDigestChanged ||
      privileged !== !!oldInspect.HostConfig?.Privileged ||
      (displayName != null && displayName !== oldDisplayName) ||
      (icon != null && icon !== oldIcon) ||
      newPidMode !== oldPidMode ||
      !isDeepStrictEqual(newPortBindings, oldPortBindings) ||
      !isDeepStrictEqual(newBinds.sort(), oldBinds.sort()) ||
      !isDeepStrictEqual(env?.sort(), oldEnv.sort()) ||
      !isDeepStrictEqual(newWebUI, oldWebUI);

    if (!needsFullRecreate) {
      if (io) io.emit('container.update.progress', { id, name: containerName, status: 'Image up to date. Applying hot settings...' });
      
      await oldContainer.update({
        RestartPolicy: { Name: restartPolicy || 'unless-stopped' },
        Memory: memory || 0
      });
      
      if (io) io.emit('container.update.success', { id, oldId: id, name: containerName });
      return; // done!
    }

    // Build createOptions
    const portBindings = ports || {};
    const exposedPorts = {};
    for (const key of Object.keys(portBindings)) {
      exposedPorts[key] = {};
    }

    // Fix Bug 6: Save endpoints config for custom networks
    const endpointsConfig = oldInspect.NetworkSettings?.Networks || {};

    const createOptions = {
      name: containerName,
      Image: fullImage,
      Env: env || [],
      Labels: oldInspect.Config?.Labels || {},
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        Binds: volumes || [],
        RestartPolicy: { Name: restartPolicy || 'unless-stopped' },
        Privileged: !!privileged,
        NetworkMode: oldInspect.HostConfig?.NetworkMode || 'default',
        PidMode: newPidMode,
      },
      NetworkingConfig: {
        EndpointsConfig: endpointsConfig
      }
    };

    if (webUI) {
      createOptions.Labels = {
        ...createOptions.Labels,
        'casaos.reborn.web.scheme': webUI.scheme || 'http://',
        'casaos.reborn.web.port': webUI.port || '',
        'casaos.reborn.web.path': webUI.path || '/'
      };
    }

    // Icon label
    if (icon != null) {
      createOptions.Labels['casaos.reborn.icon'] = icon;
    }

    // Display Name label
    if (displayName != null) {
      createOptions.Labels['casaos.reborn.name'] = displayName;
    }

    if (memory) {
      createOptions.HostConfig.Memory = memory;
    }

    // --- DETACHED UPDATER FOR SELF-UPDATE ---
    const ownId = getOwnContainerId();
    // Use startsWith just in case the ID in request is short or long
    let isSelfUpdate = false;
    if (ownId && (id.startsWith(ownId) || ownId.startsWith(id))) {
      isSelfUpdate = true;
    } else if (containerName === 'casaos-reborn' || (oldInspect.Name && oldInspect.Name.replace('/', '') === 'casaos-reborn')) {
      isSelfUpdate = true;
    }

    if (isSelfUpdate) {
      console.log('Initiating detached self-update for container', id);
      if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Rebooting system...' });
      
      const updaterScript = `
        const http = require('http');
        const createOptions = JSON.parse(process.env.CREATE_OPTIONS);
        const oldId = process.env.OLD_CONTAINER_ID;
        const containerName = process.env.CONTAINER_NAME;

        function log(msg) { console.log(new Date().toISOString() + ' - ' + msg); }
        
        function dockerRequest(method, path, data = null) {
          return new Promise((resolve, reject) => {
            const payload = data ? JSON.stringify(data) : '';
            const headers = data ? { 
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            } : {};
            const req = http.request({
              socketPath: '/var/run/docker.sock',
              path: '/v1.41' + path,
              method: method,
              headers: headers
            }, res => {
              let body = '';
              res.on('data', chunk => body += chunk);
              res.on('end', () => resolve({ statusCode: res.statusCode, body }));
            });
            req.on('error', reject);
            if (data) req.write(payload);
            req.end();
          });
        }

        (async () => {
          try {
            log('Starting detached updater for ' + containerName);
            await new Promise(r => setTimeout(r, 2000));
            
            log('Stopping old container...');
            await dockerRequest('POST', '/containers/' + oldId + '/stop?t=10');
            
            log('Removing old container...');
            await dockerRequest('DELETE', '/containers/' + oldId + '?force=true');
            
            log('Waiting for old container to be fully removed...');
            for (let i = 0; i < 20; i++) {
               const checkRes = await dockerRequest('GET', '/containers/' + oldId + '/json');
               if (checkRes.statusCode === 404) break;
               await new Promise(r => setTimeout(r, 500));
            }
            
            let created = false;
            for (let i = 0; i < 5; i++) {
              log('Creating new container... (attempt ' + (i+1) + ')');
              const createRes = await dockerRequest('POST', '/containers/create?name=' + containerName, createOptions);
              log('Create response: ' + createRes.statusCode + ' ' + createRes.body);
              if (createRes.statusCode === 201) {
                const resObj = JSON.parse(createRes.body);
                log('Starting new container: ' + resObj.Id);
                const startRes = await dockerRequest('POST', '/containers/' + resObj.Id + '/start');
                log('Start response: ' + startRes.statusCode);
                created = true;
                break;
              }
              await new Promise(r => setTimeout(r, 1500));
            }
            if (!created) log('Failed to create container after 5 retries.');
          } catch(e) {
            log('Updater error: ' + e.message + '\\n' + e.stack);
          }
        })();
      `;

      const updaterCreateOptions = { ...createOptions };
      delete updaterCreateOptions.name;

      try {
        const oldUpdater = docker.getContainer('casaos-reborn-updater');
        await oldUpdater.remove({ force: true });
      } catch (e) {}

      // Fix Bug 7: Use fullImage instead of image
      const updaterContainer = await docker.createContainer({
        Image: fullImage, 
        name: 'casaos-reborn-updater',
        Cmd: ['node', '-e', updaterScript],
        Env: [
          'CREATE_OPTIONS=' + JSON.stringify(updaterCreateOptions),
          'OLD_CONTAINER_ID=' + id,
          'CONTAINER_NAME=' + containerName
        ],
        HostConfig: {
          Binds: ['/var/run/docker.sock:/var/run/docker.sock']
        }
      });

      await updaterContainer.start();
      
      // Do NOT proceed with normal remove/create since the updater will do it and kill us.
      // We just return and let ourselves be killed in a few seconds.
      return;
    }

    // Fix Bug 2: Save old container configuration for rollback
    const rollbackOptions = {
        name: (oldInspect.Name || '').replace('/', ''),
        Image: oldInspect.Image,
        Env: oldInspect.Config?.Env || [],
        Labels: oldInspect.Config?.Labels || {},
        ExposedPorts: oldInspect.Config?.ExposedPorts || {},
        HostConfig: oldInspect.HostConfig || {},
        NetworkingConfig: {
            EndpointsConfig: oldInspect.NetworkSettings?.Networks || {}
        }
    };
    
    // Fix Bug 1: Graceful stop and remove without force
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Stopping old container...', percentage: 20 });
    try {
        // Try graceful stop with 10s timeout
        await oldContainer.stop({ t: 10 });
    } catch (e) {
        if (e.statusCode !== 304) { // 304 means already stopped
            console.warn(`Graceful stop failed for ${id}, will force remove:`, e.message);
        }
    }

    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Removing old container...', percentage: 40 });
    
    // Remove without force first. If it fails, fallback to force remove.
    try {
        await oldContainer.remove({ v: false }); // v: false to preserve volumes
    } catch (e) {
        console.warn(`Standard remove failed for ${id}, falling back to force remove:`, e.message);
        await oldContainer.remove({ force: true, v: false }).catch(err => console.warn('Force remove old container error:', err.message));
    }

    // Wait for the container to be fully removed to prevent Name or Port conflicts (up to 30 seconds)
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Waiting for Docker to release resources...', percentage: 60 });
    let isFullyRemoved = false;
    for (let i = 0; i < 60; i++) {
      try {
        await docker.getContainer(id).inspect();
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        if (e.statusCode === 404) {
          isFullyRemoved = true;
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    if (!isFullyRemoved) {
      console.warn(`Container ${id} might not be fully removed yet, creation might fail with 409 Conflict.`);
    }

    // 3. Create the new container
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Creating new container...', percentage: 80 });
    
    let newContainer;
    let createError;
    
    // Fix Bug 4 & 5: Increase timeout and use exponential backoff
    const delays = [1000, 2000, 4000, 8000, 16000, 30000, 30000]; // 7 attempts
    for (let i = 0; i < delays.length; i++) {
      try {
        // Wrap createContainer in a timeout to prevent indefinite hanging (30s)
        newContainer = await Promise.race([
          docker.createContainer(createOptions),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_CREATE')), 30000))
        ]);
        break;
      } catch (err) {
        createError = err;
        console.warn(`Creation attempt ${i+1} failed:`, err.message || err.statusCode);
        
        // Retry on 409 (Conflict), network errors, timeouts
        if (err.statusCode === 409 || err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.message === 'TIMEOUT_CREATE') {
          if (i < delays.length - 1) {
              console.log(`Waiting ${delays[i]}ms before next attempt...`);
              await new Promise(r => setTimeout(r, delays[i]));
          }
        } else {
          // If it's a specific configuration error (e.g., invalid port binding), stop retrying
          break;
        }
      }
    }
    
    if (!newContainer) {
      const errorMsg = createError ? (createError.message || JSON.stringify(createError)) : 'Unknown error';
      console.error(`Failed to create container: ${errorMsg}. Initiating rollback...`);
      
      // Fix Bug 2: ROLLBACK
      if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Creation failed, rolling back...' });
      
      try {
          // Verify if name conflict exists and remove if so
          try {
             const conflictCheck = docker.getContainer(containerName);
             await conflictCheck.inspect();
             await conflictCheck.remove({force: true});
          } catch(e) {}

          const rollbackContainer = await docker.createContainer(rollbackOptions);
          await rollbackContainer.start();
          
          if (io) io.emit('container.recreate.rollback', { id: rollbackContainer.id, oldId: id, name: containerName, error: errorMsg });
          return; // Stop processing further since rollback succeeded
      } catch (rollbackErr) {
          console.error('Fatal: Rollback failed!', rollbackErr);
          throw new Error(`Failed to create container: ${errorMsg}. Rollback also failed: ${rollbackErr.message}`);
      }
    }

    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Starting new container...', percentage: 95 });
    await newContainer.start();
    
    // Fix Bug 6: Ensure the container connects to all required custom networks
    try {
        const primaryNetwork = oldInspect.HostConfig?.NetworkMode || 'default';
        for (const [netName, netConfig] of Object.entries(endpointsConfig)) {
            // Skip the primary network as it's already connected during creation
            if (netName !== primaryNetwork && netName !== 'default' && netName !== 'bridge' && netName !== 'host' && netName !== 'none') {
                console.log(`Reconnecting ${containerName} to network ${netName}`);
                const network = docker.getNetwork(netName);
                await network.connect({
                    Container: newContainer.id,
                    EndpointConfig: netConfig
                }).catch(e => console.warn(`Failed to connect to network ${netName}:`, e.message));
            }
        }
    } catch (netErr) {
        console.warn("Error restoring extra networks:", netErr.message);
    }

    if (io) io.emit('container.recreate.success', { id: newContainer.id, oldId: id, name: containerName });
  } catch (error) {
    console.error('Error recreating container:', error);
    // Fix Bug 3: containerName is now in scope
    if (io) io.emit('container.recreate.error', { id, name: containerName, error: error.message });
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

    if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Stopping old container...' });
    try { await oldContainer.stop({ t: 10 }); } catch (e) {}

    if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Removing old container...' });
    try { await oldContainer.remove({ v: false }); } catch (e) {
      await oldContainer.remove({ force: true, v: false }).catch(() => {});
    }

    if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Creating updated container...' });
    
    // Pass exactly the same config, just override the image
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

    // Remove MacAddress to avoid conflicts
    if (createOptions.NetworkingConfig?.EndpointsConfig) {
      for (const net of Object.values(createOptions.NetworkingConfig.EndpointsConfig)) {
        delete net.MacAddress;
      }
    }

    const newContainer = await docker.createContainer(createOptions);
    
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Starting updated container...' });
    await newContainer.start();

    // Remove from available updates cache
    if (global.availableUpdates && global.availableUpdates[id]) {
      delete global.availableUpdates[id];
      if (io) io.emit('updater.results', Object.values(global.availableUpdates));
    }

    if (io) io.emit('container.recreate.success', { id: newContainer.id, oldId: id, name: containerName });
  } catch (error) {
    console.error('Error updating container:', error);
    if (io) io.emit('container.recreate.error', { id, error: error.message });
  }
});

router.post('/containers/:id/:action', async (req, res) => {
  const { id, action } = req.params;
  try {
    const container = docker.getContainer(id);
    if (action === 'start') await container.start();
    else if (action === 'stop') await container.stop();
    else if (action === 'restart') await container.restart();
    else if (action === 'delete') await container.remove({ force: true });
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
    
    // Always pull the image
    if (io) io.emit('container.create.progress', { name: containerName, image: fullImage, status: 'Pulling image...' });
    let pullFailed = false;
    try {
      await new Promise((resolve, reject) => {
        docker.pull(fullImage, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err, output) => {
            if (err) return reject(err);
            resolve(output);
          }, (event) => {
            if (io) {
              io.emit('container.create.progress', {
                name: containerName,
                image: fullImage,
                status: event.status,
                progressDetail: event.progressDetail
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

    if (io) io.emit('container.create.progress', { name: containerName, image: fullImage, status: 'Applying settings...' });

    // 2. Create the new container
    const portBindings = ports || {};
    const exposedPorts = {};
    for (const key of Object.keys(portBindings)) {
      exposedPorts[key] = {};
    }

    const createOptions = {
      Image: fullImage,
      Env: env || [],
      Labels: {},
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        Binds: volumes || [],
        RestartPolicy: { Name: restartPolicy || 'unless-stopped' },
        Privileged: !!privileged,
        NetworkMode: networkMode || 'bridge',
        PidMode: pidMode || ''
      }
    };
    
    if (name) createOptions.name = name;
    if (hostname) createOptions.Hostname = hostname;
    if (cmd && cmd.length > 0) createOptions.Cmd = cmd;
    
    if (devices && devices.length > 0) {
        createOptions.HostConfig.Devices = devices;
    }
    
    if (capAdd && capAdd.length > 0) {
        createOptions.HostConfig.CapAdd = capAdd;
    }

    if (webUI) {
      createOptions.Labels = {
        ...createOptions.Labels,
        'casaos.reborn.web.scheme': webUI.scheme || 'http://',
        'casaos.reborn.web.port': webUI.port || '',
        'casaos.reborn.web.path': webUI.path || '/'
      };
    }

    if (icon != null) {
      createOptions.Labels['casaos.reborn.icon'] = icon;
    }

    if (displayName != null) {
      createOptions.Labels['casaos.reborn.name'] = displayName;
    }

    if (memory) {
      createOptions.HostConfig.Memory = memory;
    }
    
    if (cpuQuota) {
        createOptions.HostConfig.CpuQuota = cpuQuota;
        createOptions.HostConfig.CpuPeriod = 100000;
    }

    const newContainer = await Promise.race([
      docker.createContainer(createOptions),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_CREATE')), 15000))
    ]);
    await newContainer.start();
    
    if (io) io.emit('container.create.success', { id: newContainer.id, name: containerName });
  } catch (error) {
    console.error('Error creating container:', error);
    if (io) io.emit('container.create.error', { name, error: error.message });
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
    // The logs stream returned by dockerode for non-TTY containers has a header for each line (8 bytes)
    // We can just strip non-printable characters for a quick and dirty plain text response,
    // or properly demux it. For simplicity, we'll convert to string and remove docker's 8-byte stream header.
    // However, if we just send it as binary buffer, we can do a simple replace or just send it as text.
    // A more robust way: 
    const logString = logs.toString('utf8');
    const cleanLogs = logString.replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, '');
    res.send(cleanLogs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
