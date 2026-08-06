const express = require('express');
const Docker = require('dockerode');
const path = require('path');

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/config', async (req, res) => {
  try {
    const container = docker.getContainer('casaos-reborn');
    const info = await container.inspect();
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/update', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const send = (msg) => {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  };

  try {
    send({ status: 'info', message: 'Starting update procedure for casaos-reborn...' });
    
    let containerInfo = null;
    try {
      const oldContainer = docker.getContainer('casaos-reborn');
      containerInfo = await oldContainer.inspect();
    } catch (e) {
      send({ status: 'error', message: 'Container casaos-reborn not found!' });
      return res.end();
    }

    const overrides = req.body || {};
    let imageTag = overrides.imageTag;

    if (!imageTag) {
      if (containerInfo && containerInfo.Config.Image.includes(':')) {
        imageTag = containerInfo.Config.Image.split(':')[1];
      } else {
        imageTag = 'latest';
      }
    }

    const image = `ghcr.io/lorenzo0010/casaos-reborn:${imageTag}`;
    
    send({ status: 'info', message: `Pulling image ${image}...` });
    
    await new Promise((resolve, reject) => {
      docker.pull(image, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err, output) => {
          if (err) return reject(err);
          resolve(output);
        }, (event) => {
          if (event.status) {
            send({ status: 'progress', message: event.status });
          }
        });
      });
    });

    send({ status: 'info', message: 'Stopping casaos-reborn container...' });
    try {
      const oldContainer = docker.getContainer('casaos-reborn');
      await oldContainer.stop({ t: 10 });
    } catch (e) {}

    send({ status: 'info', message: 'Removing old container...' });
    try {
      const oldContainer = docker.getContainer('casaos-reborn');
      await oldContainer.remove({ force: true });
    } catch (e) {}

    send({ status: 'info', message: 'Creating new container...' });
    
    // overrides already defined above
    const createOptions = {
      name: 'casaos-reborn',
      Image: image,
      Env: overrides.Env || containerInfo.Config.Env,
      Labels: overrides.Labels ? { ...containerInfo.Config.Labels, ...overrides.Labels } : containerInfo.Config.Labels,
      ExposedPorts: overrides.ExposedPorts || containerInfo.Config.ExposedPorts,
      Hostname: overrides.Hostname !== undefined ? overrides.Hostname : containerInfo.Config.Hostname,
      Cmd: overrides.Cmd !== undefined ? overrides.Cmd : containerInfo.Config.Cmd,
      HostConfig: {
        ...containerInfo.HostConfig,
        ...(overrides.HostConfig || {})
      },
      NetworkingConfig: {
        EndpointsConfig: containerInfo.NetworkSettings.Networks
      }
    };

    if (createOptions.NetworkingConfig?.EndpointsConfig) {
      for (const net of Object.values(createOptions.NetworkingConfig.EndpointsConfig)) {
        delete net.MacAddress;
      }
    }

    const newContainer = await docker.createContainer(createOptions);
    
    send({ status: 'info', message: 'Starting new container...' });
    await newContainer.start();

    try {
      const channel = imageTag === 'dev' ? 'dev' : 'stable';
      const exec = await newContainer.exec({
        Cmd: ['node', '-e', `
          const fs = require('fs');
          const path = '/app/backend/data/preferences.json';
          let prefs = {};
          try { if (fs.existsSync(path)) prefs = JSON.parse(fs.readFileSync(path, 'utf8')); } catch(e) {}
          prefs.updateChannel = '${channel}';
          if (fs.existsSync('/app/backend/data')) fs.writeFileSync(path, JSON.stringify(prefs, null, 2));
        `],
        AttachStdout: false,
        AttachStderr: false
      });
      await exec.start({ detach: true });
    } catch (e) {
      console.error('Failed to persist update channel preference:', e);
    }

    // Pulizia immagini orfane opzionale
    try {
      await docker.pruneImages({ filters: { dangling: ["true"] } });
    } catch(e) {}

    send({ status: 'success', message: 'Update completed successfully! CasaOS Reborn is back online.' });
    res.end();

  } catch (error) {
    console.error(error);
    send({ status: 'error', message: `Error during update: ${error.message}` });
    res.end();
  }
});

const PORT = 1112;
app.listen(PORT, () => {
  console.log(`Updater service running on port ${PORT}`);
});
