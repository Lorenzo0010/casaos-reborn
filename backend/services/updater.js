const Docker = require('dockerode');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

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
    
    await Promise.all(containers.map(async (container) => {
      const containerInfo = await docker.getContainer(container.Id).inspect();
      let fullImage = containerInfo.Config.Image;
      
      // se l'immagine non ha un tag esplicito, docker usa 'latest'
      if (!fullImage.includes(':')) {
        fullImage += ':latest';
      }

      console.log(`[Updater] Checking ${containerInfo.Name.replace('/', '')} (${fullImage})`);
      
      try {
        // Notifica l'inizio del controllo
        currentTask = {
          container: containerInfo.Name.replace('/', ''),
          action: 'Checking registry...',
          percentage: 0
        };

        if (io) {
          io.emit('updater.status', { 
            status: 'checking', 
            ...currentTask
          });
        }

        // 1. Ottieni il digest remoto tramite API distribution
        const remoteInfo = await new Promise((resolve, reject) => {
          docker.modem.dial({
            path: `/distribution/${fullImage}/json`,
            method: 'GET',
            statusCodes: {
              200: true,
              401: 'unauthorized',
              404: 'not found',
              500: 'server error'
            }
          }, (err, data) => {
            if (err) return reject(err);
            resolve(data);
          });
        });

        const remoteDigest = remoteInfo?.Descriptor?.digest;
        if (!remoteDigest) {
          throw new Error('No remote digest found for ' + fullImage);
        }

        // 2. Confronta con i RepoDigests locali
        const oldImageInspect = await docker.getImage(containerInfo.Image).inspect();
        const repoDigests = oldImageInspect.RepoDigests || [];
        
        // Verifica se il remoteDigest è presente nei repoDigests locali
        const isUpToDate = repoDigests.some(digestStr => digestStr.includes(remoteDigest));

        if (!isUpToDate) {
          console.log(`[Updater] Update found for ${containerInfo.Name}! Remote: ${remoteDigest}`);
          global.availableUpdates[container.Id] = {
            id: container.Id,
            name: containerInfo.Name.replace('/', ''),
            image: fullImage,
            oldHash: repoDigests[0] || 'unknown',
            newHash: remoteDigest,
            timestamp: new Date().toISOString()
          };
        } else {
          // Se era precedentemente marcato come da aggiornare ma ora corrisponde, rimuovilo
          if (global.availableUpdates[container.Id]) {
            delete global.availableUpdates[container.Id];
          }
        }

      } catch (err) {
        console.warn(`[Updater] Failed to check update for ${fullImage}:`, err.message);
      }
    }));

    // Pulisce le immagini dangling (inutilizzate) per non accumulare spazzatura
    console.log('[Updater] Pruning unused dangling images...');
    await docker.pruneImages({ filters: { dangling: ["true"] } });

    console.log('[Updater] Check completed. Found:', Object.keys(global.availableUpdates).length);
    
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
  checkUpdates,
  getUpdaterStatus
};
