const express = require('express');
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
    
    // 1. Pull the image ONLY if it changed (skip slow network check for settings-only changes)
    if (imageChanged) {
      if (io) io.emit('container.recreate.progress', { id, name: containerName, image, status: 'Pulling new image...' });
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
