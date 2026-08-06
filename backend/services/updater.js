const Docker = require('dockerode');
const docker = new Docker();
const { saveState } = require('../utils/stateManager');

// In-memory cache for available updates
// Format: { containerId: { name, currentImage, newImage, timestamp } }
global.availableUpdates = {};

let isChecking = false;
let currentTask = null;

const getUpdaterStatus = () => ({
  isChecking,
  currentTask
});

const checkUpdates = async (io) => {
  if (isChecking) return;
  isChecking = true;

  try {
    if (io) io.emit('updater.status', { status: 'checking' });
    console.log('[Updater] Checking for Docker image updates...');

    const containers = await docker.listContainers({ all: true });
    const currentContainerIds = containers.map(c => c.Id);

    // Pulisce le notifiche di container non più esistenti (es. dopo un update in cui l'ID cambia)
    for (const cachedId of Object.keys(global.availableUpdates)) {
      if (!currentContainerIds.includes(cachedId)) {
        delete global.availableUpdates[cachedId];
      }
    }
    
    for (const container of containers) {
      const containerInfo = await docker.getContainer(container.Id).inspect();
      let fullImage = containerInfo.Config.Image;
      
      // se l'immagine non ha un tag esplicito, docker usa 'latest'
      if (!fullImage.includes(':')) {
        fullImage += ':latest';
      }

      console.log(`[Updater] Checking ${containerInfo.Name.replace('/', '')} (${fullImage})`);
      
      try {
        currentTask = {
          container: containerInfo.Name.replace('/', ''),
          action: 'Pulling latest image...',
          percentage: 0
        };

        if (io) {
          io.emit('updater.status', { 
            status: 'checking', 
            ...currentTask
          });
        }

        const oldImageId = containerInfo.Image; // The sha256 of the image currently running

        // Eseguiamo il pull dell'immagine (se non ci sono update, finisce quasi istantaneamente) con timeout
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

        // Otteniamo le info dell'immagine appena scaricata o verificata
        const newImageInspect = await docker.getImage(fullImage).inspect();
        const newImageId = newImageInspect.Id;

        // Se l'ID dell'immagine del container è diverso dall'ID scaricato per quel tag, c'è un aggiornamento
        if (oldImageId !== newImageId) {
          console.log(`[Updater] Update found for ${containerInfo.Name}! New ID: ${newImageId}`);
          
          let oldDate = null;
          try {
            const oldImageInspect = await docker.getImage(oldImageId).inspect();
            oldDate = oldImageInspect.Created;
          } catch (e) {
            console.warn(`[Updater] Could not get old image date for ${oldImageId}`);
          }

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
          // Rimuove se era segnalato un aggiornamento ma ora coincidono
          if (global.availableUpdates[container.Id]) {
            delete global.availableUpdates[container.Id];
          }
        }

      } catch (err) {
        console.warn(`[Updater] Failed to check update for ${fullImage}:`, err.message);
      }
    }

    // Pulisce le immagini dangling (inutilizzate) per non accumulare spazzatura
    // Viene eseguito solo se abbiamo trovato degli aggiornamenti (altrimenti rischia di disturbare build locali)
    if (Object.keys(global.availableUpdates).length > 0) {
      console.log('[Updater] Pruning unused dangling images...');
      try {
        await docker.pruneImages({ filters: { dangling: ["true"] } });
      } catch (err) {
        console.warn('[Updater] Prune images failed:', err.message);
      }
    }

    console.log('[Updater] Check completed. Found:', Object.keys(global.availableUpdates).length);
    
    // Save state after checking updates
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
  // Start the background job every 6 hours
  setInterval(() => {
    checkUpdates(io);
  }, 6 * 60 * 60 * 1000);

  // Run first check 10 seconds after boot
  setTimeout(() => {
    checkUpdates(io);
  }, 10000);
};

const updateCompanionUpdater = async () => {
  try {
    const containerName = 'casaos-updater';
    const image = 'ghcr.io/lorenzo0010/casaos-updater:latest';
    
    const containers = await docker.listContainers({ all: true });
    const updaterContainer = containers.find(c => c.Names.includes(`/${containerName}`));
    
    if (!updaterContainer) {
      console.log(`[Updater] ${containerName} container not found, skipping update check.`);
      return;
    }

    const containerInfo = await docker.getContainer(updaterContainer.Id).inspect();
    const oldImageId = containerInfo.Image;

    console.log(`[Updater] Checking for updates for ${containerName}...`);

    await new Promise((resolve, reject) => {
      docker.pull(image, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err, output) => {
          if (err) return reject(err);
          resolve(output);
        });
      });
    });

    const newImageInspect = await docker.getImage(image).inspect();
    const newImageId = newImageInspect.Id;

    if (oldImageId !== newImageId) {
      console.log(`[Updater] New version found for ${containerName}. Updating...`);
      
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
