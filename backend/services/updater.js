const Docker = require('dockerode');
const docker = new Docker();
const fs = require('fs');
const path = require('path');
const { saveState } = require('../utils/stateManager');

global.availableUpdates = {};

let isChecking = false;
let currentTask = null;

const getUpdaterStatus = () => ({
  isChecking,
  currentTask
});

const getUpdateChannel = () => {
  try {
    const prefsPath = path.join(__dirname, '..', 'data', 'preferences.json');
    if (fs.existsSync(prefsPath)) {
      const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      return prefs.updateChannel || 'stable';
    }
  } catch (e) {}
  return 'stable';
};

const getTargetTagAndId = async (baseImage, updateChannel) => {
  const pullImage = async (tag) => {
    return new Promise((resolve, reject) => {
      docker.pull(`${baseImage}:${tag}`, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err, output) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  };

  try {
    await Promise.race([
      pullImage('latest'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Pull timeout')), 5 * 60 * 1000))
    ]);
  } catch (e) {
    console.warn(`[Updater] Pull latest failed for ${baseImage}:`, e.message);
  }

  let targetTag = 'latest';
  let targetId = null;

  if (updateChannel === 'dev') {
    try {
      await Promise.race([
        pullImage('dev'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Pull timeout')), 5 * 60 * 1000))
      ]);
    } catch (e) {
      console.warn(`[Updater] Pull dev failed for ${baseImage}:`, e.message);
    }

    let latestDate = 0;
    let devDate = 0;

    try {
      const latestInspect = await docker.getImage(`${baseImage}:latest`).inspect();
      latestDate = new Date(latestInspect.Created).getTime();
    } catch (e) {}

    try {
      const devInspect = await docker.getImage(`${baseImage}:dev`).inspect();
      devDate = new Date(devInspect.Created).getTime();
    } catch (e) {}

    targetTag = devDate > latestDate ? 'dev' : 'latest';
  }

  try {
    const targetInspect = await docker.getImage(`${baseImage}:${targetTag}`).inspect();
    targetId = targetInspect.Id;
    return { targetTag, targetId, created: targetInspect.Created };
  } catch (e) {
    return null;
  }
};

const checkUpdates = async (io) => {
  if (isChecking) return;
  isChecking = true;

  try {
    if (io) io.emit('updater.status', { status: 'checking' });
    console.log('[Updater] Checking for Docker image updates...');

    const containers = await docker.listContainers({ all: true });
    const currentContainerIds = containers.map(c => c.Id);

    for (const cachedId of Object.keys(global.availableUpdates)) {
      if (!currentContainerIds.includes(cachedId)) {
        delete global.availableUpdates[cachedId];
      }
    }
    
    for (const container of containers) {
      const containerInfo = await docker.getContainer(container.Id).inspect();
      let fullImage = containerInfo.Config.Image;
      
      if (!fullImage.includes(':')) {
        fullImage += ':latest';
      }

      console.log(`[Updater] Checking ${containerInfo.Name.replace('/', '')} (${fullImage})`);
      
      try {
        currentTask = {
          container: containerInfo.Name.replace('/', ''),
          action: 'Checking image...',
          percentage: 0
        };

        if (io) {
          io.emit('updater.status', { 
            status: 'checking', 
            ...currentTask
          });
        }

        const oldImageId = containerInfo.Image;

        if (containerInfo.Name === '/casaos-reborn' || containerInfo.Name === '/casaos-updater') {
          const updateChannel = getUpdateChannel();
          const baseImage = fullImage.split(':')[0];

          const targetInfo = await getTargetTagAndId(baseImage, updateChannel);
          if (targetInfo && oldImageId !== targetInfo.targetId) {
            console.log(`[Updater] Update found for ${containerInfo.Name}! Target tag: ${targetInfo.targetTag}`);
            let oldDate = null;
            try {
              const oldImageInspect = await docker.getImage(oldImageId).inspect();
              oldDate = oldImageInspect.Created;
            } catch (e) {}

            global.availableUpdates[container.Id] = {
              id: container.Id,
              name: containerInfo.Name.replace('/', ''),
              image: `${baseImage}:${targetInfo.targetTag}`,
              oldHash: oldImageId,
              newHash: targetInfo.targetId,
              oldDate: oldDate,
              newDate: targetInfo.created,
              timestamp: new Date().toISOString()
            };
          } else {
            if (global.availableUpdates[container.Id]) {
              delete global.availableUpdates[container.Id];
            }
          }
          continue;
        }

        await Promise.race([
          new Promise((resolve, reject) => {
            docker.pull(fullImage, (err, stream) => {
              if (err) return reject(err);
              docker.modem.followProgress(stream, (err, output) => {
                if (err) return reject(err);
                resolve(output);
              });
            });
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Pull timeout')), 5 * 60 * 1000))
        ]);

        const newImageInspect = await docker.getImage(fullImage).inspect();
        const newImageId = newImageInspect.Id;

        if (oldImageId !== newImageId) {
          console.log(`[Updater] Update found for ${containerInfo.Name}! New ID: ${newImageId}`);
          
          let oldDate = null;
          try {
            const oldImageInspect = await docker.getImage(oldImageId).inspect();
            oldDate = oldImageInspect.Created;
          } catch (e) {}

          global.availableUpdates[container.Id] = {
            id: container.Id,
            name: containerInfo.Name.replace('/', ''),
            image: fullImage,
            oldHash: oldImageId,
            newHash: newImageId,
            oldDate: oldDate,
            newDate: newImageInspect.Created,
            timestamp: new Date().toISOString()
          };
        } else {
          if (global.availableUpdates[container.Id]) {
            delete global.availableUpdates[container.Id];
          }
        }

      } catch (err) {
        console.warn(`[Updater] Failed to check update for ${fullImage}:`, err.message);
      }
    }

    if (Object.keys(global.availableUpdates).length > 0) {
      console.log('[Updater] Pruning unused dangling images...');
      try {
        await docker.pruneImages({ filters: { dangling: ["true"] } });
      } catch (err) {
        console.warn('[Updater] Prune images failed:', err.message);
      }
    }

    console.log('[Updater] Check completed. Found:', Object.keys(global.availableUpdates).length);
    saveState();

    currentTask = null;
    if (io) {
      io.emit('updater.status', { status: 'idle', count: Object.keys(global.availableUpdates).length });
      io.emit('updater.results', Object.values(global.availableUpdates));
    }

  } catch (error) {
    console.error('[Updater] Global error during check:', error);
    currentTask = null;
    if (io) io.emit('updater.status', { status: 'error', message: error.message });
  } finally {
    isChecking = false;
  }
};

const initUpdater = (io) => {
  setInterval(() => {
    checkUpdates(io);
  }, 6 * 60 * 60 * 1000);

  setTimeout(() => {
    checkUpdates(io);
  }, 10000);
};

const updateCompanionUpdater = async () => {
  try {
    const containerName = 'casaos-updater';
    const baseImage = 'ghcr.io/lorenzo0010/casaos-updater';
    
    const containers = await docker.listContainers({ all: true });
    const updaterContainer = containers.find(c => c.Names.includes(`/${containerName}`));
    
    if (!updaterContainer) {
      console.log(`[Updater] ${containerName} container not found, skipping update check.`);
      return;
    }

    const containerInfo = await docker.getContainer(updaterContainer.Id).inspect();
    const oldImageId = containerInfo.Image;

    console.log(`[Updater] Checking for updates for ${containerName}...`);
    
    const updateChannel = getUpdateChannel();
    const targetInfo = await getTargetTagAndId(baseImage, updateChannel);

    if (targetInfo && oldImageId !== targetInfo.targetId) {
      console.log(`[Updater] New version found for ${containerName}. Updating to tag: ${targetInfo.targetTag}`);
      const image = `${baseImage}:${targetInfo.targetTag}`;
      
      const oldContainer = docker.getContainer(updaterContainer.Id);
      try { await oldContainer.stop({ t: 10 }); } catch (e) {}
      try { await oldContainer.remove({ force: true }); } catch (e) {}

      const createOptions = {
        name: containerName,
        Image: image,
        Env: containerInfo.Config.Env,
        Labels: containerInfo.Config.Labels,
        ExposedPorts: containerInfo.Config.ExposedPorts,
        Hostname: containerInfo.Config.Hostname,
        Cmd: containerInfo.Config.Cmd,
        HostConfig: containerInfo.HostConfig,
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
      await newContainer.start();
      console.log(`[Updater] ${containerName} successfully updated and started.`);
      
      try {
        await docker.pruneImages({ filters: { dangling: ["true"] } });
      } catch(e) {}
    } else {
      console.log(`[Updater] ${containerName} is already up to date.`);
    }
  } catch (error) {
    console.error(`[Updater] Error updating ${containerName}:`, error.message);
  }
};

module.exports = {
  initUpdater,
  checkUpdates,
  getUpdaterStatus,
  updateCompanionUpdater
};

