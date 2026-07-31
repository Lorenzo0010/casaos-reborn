const { exec } = require('child_process');
const fs = require('fs');

/**
 * Tenta di registrare silenziosamente l'app nel database di CasaOS originale.
 * Se fallisce (es. CasaOS non è installato), l'errore viene soppresso per non bloccare Reborn.
 */
function syncWithCasaOS(composePath, io) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(composePath)) {
      return reject(new Error('Compose file not found'));
    }
    console.log(`[CasaOS Sync] Tentativo di registrazione per: ${composePath}`);
    
    const appName = path.basename(path.dirname(composePath));
    const hostAppDir = `/var/lib/casaos/apps/${appName}`;
    const hostComposePath = `${hostAppDir}/docker-compose.yml`;
    const yamlContent = fs.readFileSync(composePath, 'utf8');
    const yamlBase64 = Buffer.from(yamlContent).toString('base64');

    // Creiamo la cartella sull'host, decodifichiamo lo YAML in base64 nel file e lanciamo casaos-cli
    const cmd = `docker run --rm --privileged --pid=host alpine nsenter -t 1 -m -u -n sh -c "mkdir -p '${hostAppDir}' && echo '${yamlBase64}' | base64 -d > '${hostComposePath}' && casaos-cli app-management install -f '${hostComposePath}'"`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.warn(`[CasaOS Sync] Errore durante la registrazione silenziosa:`, error.message);
        if (io) io.emit('casaos.sync.error', { message: error.message, stderr: stderr });
        reject(error);
      } else {
        console.log(`[CasaOS Sync] Registrazione completata con successo:`, stdout);
        if (io) io.emit('casaos.sync.success', { message: 'App registrata nativamente su CasaOS Originale con successo!' });
        resolve(stdout);
      }
    });
  });
}

/**
 * Tenta di rimuovere silenziosamente l'app dal database di CasaOS originale.
 */
function unsyncFromCasaOS(appName) {
  if (appName) {
    const cmd = `docker run --rm --privileged --pid=host alpine nsenter -t 1 -m -u -n -i casaos-cli app-management uninstall "${appName}"`;
    exec(cmd, (error) => {
      // Ignoriamo l'errore se CasaOS non è presente.
    });
  }
}

module.exports = {
  syncWithCasaOS,
  unsyncFromCasaOS
};
