const Docker = require('dockerode');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// In-memory cache for available updates
// Format: { containerId: { name, currentImage, newImage, timestamp } }
global.availableUpdates = {};

let isChecking = false;

const checkUpdates = async (io) => {
  if (isChecking) return;
  isChecking = true;

  try {
    if (io) io.emit('updater.status', { status: 'checking' });
    console.log('[Updater] Checking for Docker image updates...');

    const containers = await docker.listContainers({ all: true });
    
    for (const container of containers) {
      const containerInfo = await docker.getContainer(container.Id).inspect();
      let fullImage = containerInfo.Config.Image;
      
      // se l'immagine non ha un tag esplicito, docker usa 'latest'
      if (!fullImage.includes(':')) {
        fullImage += ':latest';
      }

      console.log(`[Updater] Checking ${containerInfo.Name.replace('/', '')} (${fullImage})`);
      
      try {
        // 1. Pull the image silently
        await new Promise((resolve, reject) => {
          docker.pull(fullImage, (err, stream) => {
            if (err) return reject(err);
            docker.modem.followProgress(stream, (err) => {
              if (err) return reject(err);
              resolve();
            });
          });
        });

        // 2. Confronto ID immagine locale (nuova) vs ID immagine nel container (vecchia)
        const newImageInspect = await docker.getImage(fullImage).inspect();
        const oldImageHash = containerInfo.Image; // The sha256 of the current container's image
        const newImageHash = newImageInspect.Id;

        if (newImageHash !== oldImageHash) {
          console.log(`[Updater] Update found for ${containerInfo.Name}!`);
          global.availableUpdates[container.Id] = {
            id: container.Id,
            name: containerInfo.Name.replace('/', ''),
            image: fullImage,
            oldHash: oldImageHash,
            newHash: newImageHash,
            timestamp: new Date().toISOString()
          };
        } else {
          // If it was previously marked as having an update but now matches, remove it
          if (global.availableUpdates[container.Id]) {
            delete global.availableUpdates[container.Id];
          }
        }
      } catch (err) {
        console.warn(`[Updater] Failed to check update for ${fullImage}:`, err.message);
      }
    }

    // Pulisce le immagini dangling (inutilizzate) per non accumulare spazzatura
    console.log('[Updater] Pruning unused dangling images...');
    await docker.pruneImages({ filters: { dangling: ["true"] } });

    console.log('[Updater] Check completed. Found:', Object.keys(global.availableUpdates).length);
    
    if (io) {
      io.emit('updater.status', { status: 'idle', count: Object.keys(global.availableUpdates).length });
      io.emit('updater.results', Object.values(global.availableUpdates));
    }

  } catch (error) {
    console.error('[Updater] Global error during check:', error);
    if (io) io.emit('updater.status', { status: 'error', message: error.message });
  } finally {
    isChecking = false;
  }
};

const initUpdater = (io) => {
  // Start the background job every 30 minutes (1800000 ms)
  setInterval(() => {
    checkUpdates(io);
  }, 30 * 60 * 1000);

  // Run first check 10 seconds after boot
  setTimeout(() => {
    checkUpdates(io);
  }, 10000);
};

module.exports = {
  initUpdater,
  checkUpdates
};
