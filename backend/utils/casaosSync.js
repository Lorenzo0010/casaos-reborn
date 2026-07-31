const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

function callCasaOSApi(endpoint, method, payload, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const socketPath = '/var/run/casaos/app-management.sock';
    if (!fs.existsSync(socketPath)) {
      return reject(new Error('CasaOS Unix socket not found'));
    }

    const options = {
      socketPath,
      path: endpoint,
      method: method,
      headers: {}
    };

    if (payload) {
      options.headers['Content-Type'] = contentType;
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`API Error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (e) => reject(e));

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * Tenta di registrare e avviare l'app nel database di CasaOS originale tramite API nativa.
 * Fallback al vecchio metodo nsenter se l'API non è disponibile.
 */
async function syncWithCasaOS(composePath, io) {
  if (!fs.existsSync(composePath)) {
    throw new Error('Compose file not found');
  }
  console.log(`[CasaOS Sync] Avvio sincronizzazione Nativa per: ${composePath}`);
  
  const yamlContent = fs.readFileSync(composePath, 'utf8');

  try {
    // 1. Prova API Nativa CasaOS
    // L'endpoint per installare/aggiornare un compose app in CasaOS è POST /v2/app_management/compose
    // Accetta raw YAML con content-type application/yaml
    await callCasaOSApi('/v2/app_management/compose', 'POST', yamlContent, 'application/yaml');
    console.log(`[CasaOS Sync] Sincronizzato con successo tramite API REST nativa.`);
    return "API success";
  } catch (apiError) {
    console.warn(`[CasaOS Sync] API fallita (${apiError.message}), fallback a nsenter...`);
    
    // 2. Fallback nsenter (Sviluppo Windows)
    return new Promise((resolve, reject) => {
      const appName = path.basename(path.dirname(composePath));
      const hostAppDir = `/var/lib/casaos/apps/${appName}`;
      const hostComposePath = `${hostAppDir}/docker-compose.yml`;
      const yamlBase64 = Buffer.from(yamlContent).toString('base64');
  
      const cmd = `docker run --rm --privileged --pid=host alpine nsenter -t 1 -m -u -n -i sh -c "mkdir -p '${hostAppDir}' && echo '${yamlBase64}' | base64 -d > '${hostComposePath}' && cd '${hostAppDir}' && docker compose up -d --quiet-pull"`;
      
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.warn(`[CasaOS Sync] Sincronizzazione CasaOS fallita:`, error.message);
          if (io) io.emit('casaos.sync.error', { message: error.message, stderr: stderr });
          reject(error);
        } else {
          console.log(`[CasaOS Sync] Avviato con successo via nsenter:`, stdout);
          resolve(stdout);
        }
      });
    });
  }
}

/**
 * Rimuove l'app da CasaOS Originale.
 */
function unsyncFromCasaOS(appName) {
  if (!appName) return;
  
  callCasaOSApi(`/v2/app_management/apps/${appName}`, 'DELETE', null)
    .then(() => console.log(`[CasaOS Sync] Rimossa via API: ${appName}`))
    .catch((err) => {
      console.warn(`[CasaOS Sync] API Delete fallita, fallback a nsenter...`);
      const hostAppDir = `/var/lib/casaos/apps/${appName}`;
      const cmd = `docker run --rm --privileged --pid=host alpine nsenter -t 1 -m -u -n -i sh -c "if [ -d '${hostAppDir}' ]; then cd '${hostAppDir}' && docker compose down && rm -rf '${hostAppDir}'; fi"`;
      exec(cmd, () => {});
    });
}

module.exports = {
  syncWithCasaOS,
  unsyncFromCasaOS
};
