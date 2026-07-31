const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Tenta di registrare e avviare l'app nel database di CasaOS originale.
 * Copia il docker-compose.yml nella directory corretta dell'host e avvia docker compose
 * da lì tramite nsenter. Questo inietta i label corretti per far riconoscere l'app come Nativa.
 */
function syncWithCasaOS(composePath, io) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(composePath)) {
      return reject(new Error('Compose file not found'));
    }
    console.log(`[CasaOS Sync] Avvio sincronizzazione Nativa per: ${composePath}`);
    
    const appName = path.basename(path.dirname(composePath));
    const hostAppDir = `/var/lib/casaos/apps/${appName}`;
    const hostComposePath = `${hostAppDir}/docker-compose.yml`;
    const yamlContent = fs.readFileSync(composePath, 'utf8');
    const yamlBase64 = Buffer.from(yamlContent).toString('base64');

    // Creiamo la cartella sull'host, decodifichiamo lo YAML, ed eseguiamo docker compose up 
    // DIRETTAMENTE dall'host in modo che i label "working_dir" siano corretti.
    const cmd = `docker run --rm --privileged --pid=host alpine nsenter -t 1 -m -u -n -i sh -c "mkdir -p '${hostAppDir}' && echo '${yamlBase64}' | base64 -d > '${hostComposePath}' && cd '${hostAppDir}' && docker compose up -d --quiet-pull"`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.warn(`[CasaOS Sync] Sincronizzazione CasaOS fallita (CasaOS potrebbe non essere installato):`, error.message);
        if (io) io.emit('casaos.sync.error', { message: error.message, stderr: stderr });
        reject(error);
      } else {
        console.log(`[CasaOS Sync] Avviato con successo come app Nativa CasaOS:`, stdout);
        resolve(stdout);
      }
    });
  });
}

/**
 * Rimuove l'app da CasaOS Originale cancellando la directory e fermando il compose.
 */
function unsyncFromCasaOS(appName) {
  if (appName) {
    const hostAppDir = `/var/lib/casaos/apps/${appName}`;
    const cmd = `docker run --rm --privileged --pid=host alpine nsenter -t 1 -m -u -n -i sh -c "if [ -d '${hostAppDir}' ]; then cd '${hostAppDir}' && docker compose down && rm -rf '${hostAppDir}'; fi"`;
    exec(cmd, (error) => {
      // Ignoriamo l'errore se la directory non esiste.
    });
  }
}

module.exports = {
  syncWithCasaOS,
  unsyncFromCasaOS
};
