const { exec } = require('child_process');
const fs = require('fs');

/**
 * Tenta di registrare silenziosamente l'app nel database di CasaOS originale.
 * Se fallisce (es. CasaOS non è installato), l'errore viene soppresso per non bloccare Reborn.
 */
function syncWithCasaOS(composePath) {
  if (fs.existsSync(composePath)) {
    exec(`casaos-cli app-management install -f "${composePath}"`, (error) => {
      if (error) {
        // Ignoriamo silenziosamente l'errore. Reborn continuerà a funzionare
        // come gestore Docker indipendente.
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
