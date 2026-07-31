const { exec } = require('child_process');
const fs = require('fs');

/**
 * Tenta di registrare silenziosamente l'app nel database di CasaOS originale.
 * Se fallisce (es. CasaOS non è installato), l'errore viene soppresso per non bloccare Reborn.
 */
function syncWithCasaOS(composePath, io) {
  if (fs.existsSync(composePath)) {
    console.log(`[CasaOS Sync] Tentativo di registrazione per: ${composePath}`);
    exec(`casaos-cli app-management install -f "${composePath}"`, (error, stdout, stderr) => {
      if (error) {
        console.warn(`[CasaOS Sync] Errore durante la registrazione silenziosa:`, error.message);
        console.warn(`[CasaOS Sync] Dettagli stderr:`, stderr);
        if (io) io.emit('casaos.sync.error', { message: error.message, stderr: stderr });
      } else {
        console.log(`[CasaOS Sync] Registrazione completata con successo:`, stdout);
        if (io) io.emit('casaos.sync.success', { message: 'App registrata nativamente su CasaOS Originale con successo!' });
      }
    });
  }
}

/**
 * Tenta di rimuovere silenziosamente l'app dal database di CasaOS originale.
 */
function unsyncFromCasaOS(appName) {
  if (appName) {
    exec(`casaos-cli app-management uninstall "${appName}"`, (error) => {
      // Ignoriamo l'errore se CasaOS non è presente.
    });
  }
}

module.exports = {
  syncWithCasaOS,
  unsyncFromCasaOS
};
