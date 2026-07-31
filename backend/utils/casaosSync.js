const { exec } = require('child_process');
const fs = require('fs');

/**
 * Tenta di registrare silenziosamente l'app nel database di CasaOS originale.
 * Se fallisce (es. CasaOS non è installato), l'errore viene soppresso per non bloccare Reborn.
 */
function syncWithCasaOS(composePath, io) {
  if (fs.existsSync(composePath)) {
    console.log(`[CasaOS Sync] Tentativo di registrazione per: ${composePath}`);
    
    const appName = path.basename(path.dirname(composePath));
    const hostAppDir = `/var/lib/casaos/apps/${appName}`;
    const hostComposePath = `${hostAppDir}/docker-compose.yml`;
    const yamlContent = fs.readFileSync(composePath, 'utf8');

    // Creiamo la cartella sull'host, scriviamo il file e lanciamo casaos-cli passando lo YAML tramite stdin
    const cmd = `docker run --rm -i --privileged --pid=host alpine nsenter -t 1 -m -u -n -i sh -c "mkdir -p '${hostAppDir}' && cat > '${hostComposePath}' && casaos-cli app-management install -f '${hostComposePath}'"`;
    
    const child = exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.warn(`[CasaOS Sync] Errore durante la registrazione silenziosa:`, error.message);
        console.warn(`[CasaOS Sync] Dettagli stderr:`, stderr);
        if (io) io.emit('casaos.sync.error', { message: error.message, stderr: stderr });
      } else {
        console.log(`[CasaOS Sync] Registrazione completata con successo:`, stdout);
        if (io) io.emit('casaos.sync.success', { message: 'App registrata nativamente su CasaOS Originale con successo!' });
      }
    });

    child.stdin.write(yamlContent);
    child.stdin.end();
  }
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
