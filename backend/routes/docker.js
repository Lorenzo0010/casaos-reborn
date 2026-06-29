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
