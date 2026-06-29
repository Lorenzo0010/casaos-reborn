const express = require('express');
const { isDeepStrictEqual } = require('util');
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

// Recreate container with new settings
router.post('/containers/:id/recreate', async (req, res) => {
  const { id } = req.params;
  const { image, name, ports, env, volumes, restartPolicy, privileged, memory, webUI } = req.body;
  const io = req.io;
  
  // Return early, continue processing in background
  res.status(202).json({ success: true, message: 'Recreation started', id });

  try {
    const oldContainer = docker.getContainer(id);
    const oldInspect = await oldContainer.inspect().catch(() => ({}));
    const containerName = (oldInspect.Name || name || '').replace('/', '');
    const oldImage = oldInspect.Config?.Image || '';
    const imageChanged = image !== oldImage;
    
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

    // Determine if we really need to pull the image
    const imageExistsLocally = await docker.getImage(image).inspect().then(() => true).catch(() => false);
    const needPull = imageChanged || !imageExistsLocally;
    if (needPull) {
      if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Pulling image...' });
      await new Promise((resolve, reject) => {
        docker.pull(image, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err, output) => {
            if (err) return reject(err);
            resolve(output);
          }, (event) => {
            if (io) {
              io.emit('container.recreate.progress', {
                id,
                name: containerName,
                image: image,
                status: event.status,
                progressDetail: event.progressDetail
              });
            }
          });
        });
      });
    } else {
      if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Applying settings...' });
    }

    // 2. Force-remove the old container (sends SIGKILL immediately, no 10s SIGTERM wait)
    await oldContainer.remove({ force: true });

    // 3. Create the new container
    const portBindings = ports || {};
    const exposedPorts = {};
    for (const key of Object.keys(portBindings)) {
      exposedPorts[key] = {};
    }

    const createOptions = {
      Image: image,
      name: name,
      Env: env || [],
      Labels: oldInspect.Config?.Labels || {},
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        Binds: volumes || [],
        RestartPolicy: { Name: restartPolicy || 'unless-stopped' },
        Privileged: !!privileged,
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

    if (memory) {
      createOptions.HostConfig.Memory = memory;
    }

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

// For App Store: Simple API to deploy a container
router.post('/deploy', async (req, res) => {
  const { image, name, ports, env, volumes } = req.body;
  try {
    // Pull image first
    await new Promise((resolve, reject) => {
      docker.pull(image, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err, output) => {
          if (err) return reject(err);
          resolve(output);
        });
      });
    });

    const createOptions = {
      Image: image,
      name: name,
      Env: env || [],
      HostConfig: {
        PortBindings: ports || {},
        Binds: volumes || [],
        RestartPolicy: { Name: 'unless-stopped' }
      }
    };

    const container = await docker.createContainer(createOptions);
    await container.start();
    res.json({ success: true, id: container.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



module.exports = router;
