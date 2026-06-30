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
  return null;
}

// Recreate container with new settings
router.post('/containers/:id/recreate', async (req, res) => {
  const { id } = req.params;
  const { image, tag, name, ports, env, volumes, restartPolicy, privileged, memory, webUI, icon } = req.body;
  const fullImage = tag ? `${image}:${tag}` : image;
  const io = req.io;
  
  // Return early, continue processing in background
  res.status(202).json({ success: true, message: 'Recreation started', id });

  try {
    const oldContainer = docker.getContainer(id);
    const oldInspect = await oldContainer.inspect().catch(() => ({}));
    const containerName = (oldInspect.Name || name || '').replace('/', '');
    const oldImage = oldInspect.Config?.Image || '';
    const imageChanged = fullImage !== oldImage;
    
    // Check if we can do an in-place update (fast path)
    const oldPortBindings = oldInspect.HostConfig?.PortBindings || {};
    const oldBinds = oldInspect.HostConfig?.Binds || [];
    const oldEnv = oldInspect.Config?.Env || [];
    
    // To compare env properly, the UI only sends the vars it knows, but we replace all Env in a recreate.
    // However, if the user didn't change what they see, they send back what they received.
    // We can just rely on basic equality or full recreate.
    const newPortBindings = ports || {};
    
    // Normalize volumes
    const newBinds = volumes || [];

    const oldWebUI = {
      scheme: oldInspect.Config?.Labels?.['casaos.reborn.web.scheme'] || 'http://',
      port: oldInspect.Config?.Labels?.['casaos.reborn.web.port'] || '',
      path: oldInspect.Config?.Labels?.['casaos.reborn.web.path'] || '/'
    };
    const newWebUI = webUI || oldWebUI;

    // A full recreate is required if image, ports, volumes, env, webUI or privileged flag changed
    const needsFullRecreate = 
      imageChanged ||
      privileged !== !!oldInspect.HostConfig?.Privileged ||
      !isDeepStrictEqual(newPortBindings, oldPortBindings) ||
      !isDeepStrictEqual(newBinds.sort(), oldBinds.sort()) ||
      !isDeepStrictEqual(env?.sort(), oldEnv.sort()) ||
      !isDeepStrictEqual(newWebUI, oldWebUI);

    if (!needsFullRecreate) {
      if (io) io.emit('container.update.progress', { id, name: containerName, status: 'Updating settings...' });
      
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

    if (memory) {
      createOptions.HostConfig.Memory = memory;
    }

    // Always pull the image to ensure we get the latest version.
    // Docker compares digests: if the remote image hasn't changed,
    // this is a fast no-op (manifest check only, no re-download).
    if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Pulling image...' });
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

    // --- DETACHED UPDATER FOR SELF-UPDATE ---
    const ownId = getOwnContainerId();
    // Use startsWith just in case the ID in request is short or long
    const isSelfUpdate = ownId && (id.startsWith(ownId) || ownId.startsWith(id));

    if (isSelfUpdate) {
      console.log('Initiating detached self-update for container', id);
      if (io) io.emit('container.recreate.progress', { id, name: containerName, image: fullImage, status: 'Rebooting system...' });
      
      const updaterScript = `
        const http = require('http');
        const fs = require('fs');
        const createOptions = JSON.parse(process.env.CREATE_OPTIONS);
        const containerId = process.env.OLD_CONTAINER_ID;
        const containerName = process.env.CONTAINER_NAME;

        let logOutput = '';
        function log(msg) {
          console.log(msg);
          logOutput += new Date().toISOString() + ' - ' + msg + '\\n';
          try { fs.writeFileSync('/host-root/tmp/casaos-updater.log', logOutput); } catch(e) {}
        }

        function request(method, path, body) {
          return new Promise((resolve, reject) => {
            const bodyStr = body ? JSON.stringify(body) : '';
            const headers = { 'Content-Type': 'application/json' };
            if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

            const req = http.request({
              socketPath: '/var/run/docker.sock',
              method,
              path,
              headers
            }, res => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => resolve({ status: res.statusCode, body: data }));
            });
            req.on('error', reject);
            if (bodyStr) req.write(bodyStr);
            req.end();
          });
        }

        (async () => {
          try {
            log('Starting updater for ' + containerName + ' (Old ID: ' + containerId + ')');
            log('Waiting for main process to close connections...');
            await new Promise(r => setTimeout(r, 2000));

            log('Stopping old container...');
            await request('POST', '/containers/' + containerId + '/stop?t=5').catch(() => {});

            log('Removing old container...');
            await request('DELETE', '/containers/' + containerId + '?force=true');
            
            let newId;
            for (let i = 0; i < 5; i++) {
              log('Waiting for Docker to release the container name (attempt ' + (i+1) + ')...');
              await new Promise(r => setTimeout(r, 1500));
              log('Creating new container with name ' + containerName + '...');
              const createRes = await request('POST', '/containers/create?name=' + encodeURIComponent(containerName), createOptions);
              log('Create response status: ' + createRes.status);
              try {
                const parsed = JSON.parse(createRes.body);
                newId = parsed.Id;
                if (newId) {
                  log('Successfully created container with ID: ' + newId);
                  break;
                }
                log('Create returned body: ' + createRes.body);
              } catch (parseErr) {
                log('Failed to parse create response: ' + createRes.body);
              }
            }
            
            if (newId) {
              log('Starting new container: ' + newId);
              const startRes = await request('POST', '/containers/' + newId + '/start');
              log('Start result: ' + startRes.status);
            } else {
              log('Failed to create container after 5 retries. CreateOptions was: ' + JSON.stringify(createOptions));
            }
          } catch(e) {
            log('Exception in updater script: ' + e.message + '\\n' + e.stack);
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
          Binds: ['/var/run/docker.sock:/var/run/docker.sock', '/:/host-root'],
          AutoRemove: true
        }
      });

      await updaterContainer.start();
      
      // Do NOT proceed with normal remove/create since the updater will do it and kill us.
      // We just return and let ourselves be killed in a few seconds.
      return;
    }

    // 2. Force-remove the old container (sends SIGKILL immediately, no 10s SIGTERM wait)
    await oldContainer.remove({ force: true });

    // 3. Create the new container

    const newContainer = await docker.createContainer(createOptions);
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
  const { image, tag, name, ports, env, volumes, restartPolicy, privileged, memory, webUI, icon } = req.body;
  const fullImage = tag ? `${image}:${tag}` : image;
  const io = req.io;
  
  res.status(202).json({ success: true, message: 'Creation started' });

  try {
    const containerName = (name || '').replace('/', '');
    
    // Always pull the image
    if (io) io.emit('container.create.progress', { name: containerName, image: fullImage, status: 'Pulling image...' });
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



module.exports = router;
