const express = require('express');
const { isDeepStrictEqual } = require('util');
const fs = require('fs');
const router = express.Router();
const Docker = require('dockerode');
// Connect to local docker socket
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

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
  const { image, tag, name, displayName, ports, env, volumes, restartPolicy, privileged, memory, webUI, icon } = req.body;
  const fullImage = tag ? `${image}:${tag}` : image;
  const io = req.io;
  
  // Return early, continue processing in background
  res.status(202).json({ success: true, message: 'Recreation started', id });

  try {
    const oldContainer = docker.getContainer(id);
    const oldInspect = await oldContainer.inspect().catch(() => ({}));
    const containerName = name ? name.replace('/', '') : (oldInspect.Name || '').replace('/', '');
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

    // A full recreate is required if image string changed, image digest changed, or config changed
    const needsFullRecreate = 
      nameChanged ||
      imageStringChanged ||
      imageDigestChanged ||
      privileged !== !!oldInspect.HostConfig?.Privileged ||
      (displayName != null && displayName !== oldDisplayName) ||
      (icon != null && icon !== oldIcon) ||
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
            await dockerRequest('POST', '/containers/' + oldId + '/stop?t=5');
            
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

      const updaterContainer = await docker.createContainer({
        Image: image, 
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

    // 2. Force-remove the old container (sends SIGKILL immediately, no 10s SIGTERM wait)
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Removing old container...' });
    await oldContainer.remove({ force: true }).catch(e => console.warn('Remove old container error:', e.message));

    // Wait for the container to be fully removed to prevent Name or Port conflicts (up to 30 seconds)
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Waiting for Docker to release name/ports...' });
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
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Creating new container...' });
    
    let newContainer;
    let createError;
    for (let i = 0; i < 5; i++) {
      try {
        newContainer = await docker.createContainer(createOptions);
        break;
      } catch (err) {
        createError = err;
        if (err.statusCode === 409) {
          console.warn(`Creation conflict (attempt ${i+1}), waiting 2 seconds...`);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          throw err; // Not a conflict error, abort
        }
      }
    }
    
    if (!newContainer) {
      throw createError || new Error('Failed to create container after multiple attempts due to naming conflict.');
    }

    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Starting new container...' });
    await newContainer.start();
    
    if (io) io.emit('container.recreate.success', { id: newContainer.id, oldId: id, name: containerName });
  } catch (error) {
    console.error('Error recreating container:', error);
    if (io) io.emit('container.recreate.error', { id, name: containerName, error: error.message });
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
  const { image, tag, name, displayName, ports, env, volumes, restartPolicy, privileged, memory, webUI, icon } = req.body;
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
      }
    };
    
    if (name) {
      createOptions.name = name;
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

    const newContainer = await docker.createContainer(createOptions);
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
