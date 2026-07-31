# CasaOS — Gestione Container e Sincronizzazione Bidirezionale

## Contesto

Questo documento descrive come CasaOS gestisce internamente i container Docker e come implementare un sistema di gestione parallelo con sincronizzazione bidirezionale di titolo e icona della dashboard.

---

## Architettura CasaOS

CasaOS è costruito su un'**architettura a microservizi** dove il repo principale (`IceWhaleTech/CasaOS`) funge da gateway per file system, sistema operativo e notifiche. La gestione effettiva dei container Docker è delegata al microservizio separato **CasaOS-AppManagement** (`IceWhaleTech/CasaOS-AppManagement`).

I servizi comunicano tra loro via **REST su socket Unix** o su porte locali. Il repo principale non contiene logica Docker diretta.

### Componenti principali

| Componente | Repository | Responsabilità |
|---|---|---|
| CasaOS (main) | `IceWhaleTech/CasaOS` | File system, sistema, notifiche, gateway |
| AppManagement | `IceWhaleTech/CasaOS-AppManagement` | Installazione e gestione container Docker |
| UI | `IceWhaleTech/CasaOS-UI` | Frontend Vue.js della dashboard |

---

## Come vengono memorizzati i metadati delle app

Ogni app installata in CasaOS viene salvata come file **Docker Compose** nella directory:

```
/var/lib/casaos/apps/{app_id}/docker-compose.yml
```

I metadati della dashboard (titolo, icona, URL, porta) non vengono salvati in un database relazionale separato, ma sono incorporati direttamente come **label Docker** nel file Compose:

```yaml
version: "3"
services:
  myapp:
    image: myimage:latest
    labels:
      net.casaos.title: "Il Mio Servizio"
      net.casaos.icon: "https://cdn.example.com/icon.png"
      net.casaos.web_ui_port: "8080"
      net.casaos.web_ui_path: "/"
      net.casaos.description: "Descrizione dell'app"
      net.casaos.category: "media"
    ports:
      - "8080:8080"
```

Quando CasaOS visualizza la dashboard, legge queste label direttamente dai container in esecuzione tramite l'API Docker Engine.

---

## API REST di CasaOS-AppManagement

Il servizio AppManagement espone un'API REST, di default raggiungibile su:
- **Socket Unix**: `/var/run/casaos/app-management.sock`
- **Porta locale**: `http://localhost:3000` (configurabile)

### Endpoint principali

| Endpoint | Metodo | Scopo |
|---|---|---|
| `/v2/app_management/apps` | GET | Lista tutte le app installate con metadati |
| `/v2/app_management/apps/{id}` | GET | Dettaglio singola app (label incluse) |
| `/v2/app_management/apps/{id}` | PUT | Aggiorna configurazione app (titolo, icona…) |
| `/v2/app_management/compose` | POST | Installa una nuova app da docker-compose |
| `/v2/app_management/apps/{id}` | DELETE | Rimuove un'app |
| `/v2/app_management/apps/{id}/state` | PUT | Cambia stato: start / stop / restart |

### Esempio risposta GET /apps

```json
{
  "data": [
    {
      "id": "myapp",
      "title": "Il Mio Servizio",
      "icon": "https://cdn.example.com/icon.png",
      "port": 8080,
      "status": "running",
      "labels": {
        "net.casaos.title": "Il Mio Servizio",
        "net.casaos.icon": "https://cdn.example.com/icon.png"
      }
    }
  ]
}
```

---

## Strategia di Sincronizzazione Bidirezionale

Per costruire un sistema di gestione parallelo a CasaOS con corrispondenza bidirezionale di titolo e icona, sono necessari due flussi di sincronizzazione.

### Flusso 1: Sistema esterno → CasaOS

Quando il sistema esterno crea o aggiorna un container, deve propagare i metadati (titolo, icona) su CasaOS tramite API:

```javascript
// Genera il docker-compose con le label CasaOS
function generateComposeWithLabels(containerInfo) {
  return {
    version: "3",
    services: {
      [containerInfo.id]: {
        image: containerInfo.image,
        labels: {
          "net.casaos.title": containerInfo.title,
          "net.casaos.icon": containerInfo.icon,
          "net.casaos.web_ui_port": String(containerInfo.port),
          "net.casaos.last_modified_by": "external_system"  // firma per evitare loop
        },
        ports: [`${containerInfo.port}:${containerInfo.port}`]
      }
    }
  };
}

// Installa/aggiorna su CasaOS
async function syncToCasaOS(containerInfo) {
  const compose = generateComposeWithLabels(containerInfo);
  const response = await fetch('http://localhost:3000/v2/app_management/compose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ compose: JSON.stringify(compose) })
  });
  return response.json();
}
```

### Flusso 2: CasaOS → Sistema esterno

CasaOS non dispone di un sistema di webhook nativo. Esistono due approcci per rilevare le modifiche effettuate tramite la UI di CasaOS:

#### Opzione A — File system watcher (consigliata, bassa latenza)

Si monitorano i file `docker-compose.yml` in `/var/lib/casaos/apps/` con un watcher inotify. Quando CasaOS modifica un file (es. cambio titolo/icona dall'UI), il watcher notifica immediatamente il sistema esterno:

```javascript
import chokidar from 'chokidar';
import yaml from 'js-yaml';
import fs from 'fs';

const watcher = chokidar.watch('/var/lib/casaos/apps/*/docker-compose.yml', {
  persistent: true,
  ignoreInitial: true
});

watcher.on('change', (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const compose = yaml.load(raw);
  const service = Object.values(compose.services)[0];
  const labels = service.labels || {};

  // Ignora modifiche fatte dal sistema esterno stesso (evita loop)
  if (labels['net.casaos.last_modified_by'] === 'external_system') return;

  const appId = filePath.split('/').slice(-2)[0];
  syncFromCasaOS({
    id: appId,
    title: labels['net.casaos.title'],
    icon: labels['net.casaos.icon']
  });
});

function syncFromCasaOS(appData) {
  // Aggiorna il DB/stato del sistema esterno
  console.log('CasaOS ha aggiornato:', appData);
  // externalDB.update(appData.id, { title: appData.title, icon: appData.icon });
}
```

#### Opzione B — Polling REST (più semplice, latenza variabile)

Si chiama periodicamente `GET /v2/app_management/apps` e si confronta il risultato con uno snapshot locale:

```javascript
let lastSnapshot = {};

async function pollCasaOS(intervalMs = 5000) {
  setInterval(async () => {
    const res = await fetch('http://localhost:3000/v2/app_management/apps');
    const { data: apps } = await res.json();

    for (const app of apps) {
      const prev = lastSnapshot[app.id];
      if (!prev || prev.title !== app.title || prev.icon !== app.icon) {
        if (app.labels?.['net.casaos.last_modified_by'] !== 'external_system') {
          syncFromCasaOS(app);
        }
        lastSnapshot[app.id] = { title: app.title, icon: app.icon };
      }
    }
  }, intervalMs);
}
```

---

## Prevenire i Loop di Sincronizzazione

Il problema principale della sincronizzazione bidirezionale è il **loop infinito**:  
Sistema esterno modifica → CasaOS cambia → file watcher triggera → sistema esterno modifica di nuovo → …

Sono disponibili due strategie complementari:

### Strategia 1 — Flag in memoria

```javascript
let syncInProgress = false;

async function syncToCasaOS(data) {
  if (syncInProgress) return;
  syncInProgress = true;
  try {
    await callCasaOSApi(data);
  } finally {
    syncInProgress = false;
  }
}
```

### Strategia 2 — Label di firma (più robusta, persiste anche dopo restart)

Si aggiunge una label al container che identifica chi ha fatto l'ultima modifica. Il watcher/poller la controlla prima di propagare:

```yaml
labels:
  net.casaos.title: "Il Mio Servizio"
  net.casaos.icon: "https://cdn.example.com/icon.png"
  net.casaos.last_modified_by: "external_system"  # o "casaos_ui"
  net.casaos.last_modified_at: "2026-07-31T14:30:00Z"
```

La logica di sincronizzazione controlla questa label prima di agire:

```javascript
function shouldSyncFromCasaOS(labels) {
  return labels['net.casaos.last_modified_by'] !== 'external_system';
}

function shouldSyncToCasaOS(source) {
  return source === 'external_system';
}
```

---

## Schema del Flusso Completo

```
┌─────────────────────────────────────────────────────┐
│                  SISTEMA ESTERNO                    │
│  (tua UI, API, DB con titoli e icone)               │
└───────────────┬─────────────────▲───────────────────┘
                │                 │
     POST/PUT   │                 │ syncFromCasaOS()
  /v2/app_management/compose      │
                │                 │
┌───────────────▼─────────────────┴───────────────────┐
│              BRIDGE DI SINCRONIZZAZIONE              │
│  - Flag syncInProgress                              │
│  - Controllo label last_modified_by                 │
│  - File watcher su /var/lib/casaos/apps/            │
└───────────────┬─────────────────▲───────────────────┘
                │                 │
     API REST   │                 │  inotify / polling
  localhost:3000│                 │
                │                 │
┌───────────────▼─────────────────┴───────────────────┐
│           CASAOS-APPMANAGEMENT                      │
│  - Scrive docker-compose.yml con label              │
│  - Legge label da Docker Engine                     │
│  - /var/lib/casaos/apps/{id}/docker-compose.yml     │
└─────────────────────────────────────────────────────┘
                │
     Docker Engine API
                │
┌───────────────▼─────────────────────────────────────┐
│              CONTAINER DOCKER                       │
│  labels:                                            │
│    net.casaos.title: "..."                          │
│    net.casaos.icon: "..."                           │
│    net.casaos.last_modified_by: "..."               │
└─────────────────────────────────────────────────────┘
```

---

## Riepilogo punti chiave

- CasaOS salva i metadati della dashboard come **label Docker** nei file `docker-compose.yml`, non in un DB separato.
- Il microservizio **CasaOS-AppManagement** espone un'API REST per creare, leggere e aggiornare le app.
- Per la direzione CasaOS → sistema esterno, il **file system watcher** su `/var/lib/casaos/apps/` è l'approccio più efficiente.
- Per prevenire loop di sincronizzazione, usare sia un **flag in memoria** sia una **label di firma** (`net.casaos.last_modified_by`) nel Compose file.
- La label `net.casaos.last_modified_by` persiste anche dopo un restart del processo, rendendola più affidabile del solo flag in memoria.
