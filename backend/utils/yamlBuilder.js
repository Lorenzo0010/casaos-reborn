// Simple YAML serializer for docker-compose files

function dumpYAML(obj, indent = 0) {
  let yaml = '';
  const spaces = ' '.repeat(indent);

  if (typeof obj === 'string') {
    // Escape strings that might cause issues
    if (obj === '' || obj.includes(':') || obj.includes('\n') || obj.includes('#') || obj.trim() !== obj || !isNaN(Number(obj)) || obj === 'true' || obj === 'false' || obj.includes('\\')) {
      return `"${obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return obj;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    yaml += '\n';
    for (const item of obj) {
      yaml += `${spaces}- ${dumpYAML(item, indent + 2)}\n`;
    }
    return yaml.trimEnd();
  }

  if (typeof obj === 'object' && obj !== null) {
    if (Object.keys(obj).length === 0) return '{}';
    if (indent !== 0) yaml += '\n';
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      
      const safeKey = /^[a-zA-Z0-9_-]+$/.test(key) ? key : `"${key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0) {
        yaml += `${spaces}${safeKey}: {}\n`;
      } else if (Array.isArray(value) && value.length === 0) {
        yaml += `${spaces}${safeKey}: []\n`;
      } else {
        yaml += `${spaces}${safeKey}: ${dumpYAML(value, indent + 2)}\n`;
      }
    }
    return yaml.trimEnd();
  }

  return '';
}

/**
 * Generates a CasaOS-compatible docker-compose string from container parameters
 */
function buildCasaOSCompose(data) {
  const service = {
    image: data.tag && data.tag !== 'latest' ? `${data.image}:${data.tag}` : data.image,
    container_name: data.name,
    restart: data.restartPolicy || 'unless-stopped',
  };

  // Do not write network_mode if it's the auto-generated compose network, otherwise compose breaks
  if (data.networkMode && !data.networkMode.endsWith('_default')) {
    service.network_mode = data.networkMode;
  }

  if (data.privileged) service.privileged = true;
  if (data.pidMode) service.pid = data.pidMode;
  
  // memory
  if (data.memory && data.memory > 0) {
    service.deploy = {
      resources: {
        limits: {
          memory: `${data.memory}b`
        }
      }
    };
  }

  if (data.cpuQuota && data.cpuQuota > 0) {
    service.cpu_shares = data.cpuQuota; // simplified equivalent
  }

  if (data.ports && Object.keys(data.ports).length > 0) {
    service.ports = [];
    for (const [containerPortProto, hostBindings] of Object.entries(data.ports)) {
      const proto = containerPortProto.split('/')[1] || 'tcp';
      const containerPort = containerPortProto.split('/')[0];
      for (const b of hostBindings) {
        if (b.HostPort) {
          service.ports.push({
            target: parseInt(containerPort),
            published: String(b.HostPort),
            protocol: proto
          });
        }
      }
    }
  }

  // Volumes
  if (data.volumes && data.volumes.length > 0) {
    service.volumes = data.volumes;
  }

  // Environment
  if (data.env && data.env.length > 0) {
    service.environment = data.env;
  }

  // Devices
  if (data.devices && data.devices.length > 0) {
    service.devices = data.devices.map(d => `${d.PathOnHost}:${d.PathInContainer}`);
  }

  // Command
  if (data.cmd && data.cmd.length > 0) {
    service.command = data.cmd;
  }

  // CapAdd
  if (data.capAdd && data.capAdd.length > 0) {
    service.cap_add = data.capAdd;
  }

  // x-casaos metadata (official CasaOS schema)
  const titleStr = data.displayName || data.name;
  const isCustom = titleStr !== data.name;
  const xCasaos = {
    author: "casaos-reborn",
    category: data.webUI ? "Web" : "App",
    main: data.name,
    store_app_id: data.name,
    is_uncontrolled: false,
    title: {
      custom: isCustom ? titleStr : "",
      en_us: titleStr
    }
  };

  service.labels = {};
  if (data.icon) {
    xCasaos.icon = data.icon;
    service.labels['icon'] = data.icon;
    service.labels['net.casaos.icon'] = data.icon;
  }
  // Standard casaos label for fallback compatibility
  service.labels['casaos.app.name'] = titleStr;
  service.labels['net.casaos.title'] = titleStr;
  service.labels['net.casaos.last_modified_by'] = 'casaos-reborn';

  if (data.webUI) {
    xCasaos.scheme = data.webUI.scheme ? data.webUI.scheme.replace('://', '') : 'http';
    xCasaos.index = data.webUI.path || '/';
    xCasaos.port_map = String(data.webUI.port);
    xCasaos.host = data.webUI.domain || '';
    xCasaos.ports = [{
      ui: true,
      scheme: xCasaos.scheme,
      target: xCasaos.port_map,
      path: xCasaos.index
    }];
    service.labels['net.casaos.web_ui_scheme'] = xCasaos.scheme;
    service.labels['net.casaos.web_ui_port'] = xCasaos.port_map;
    service.labels['net.casaos.web_ui_path'] = xCasaos.index;
    if (xCasaos.host) service.labels['net.casaos.web_ui_host'] = xCasaos.host;
  }

  const compose = {
    name: data.name,
    services: {
      [data.name]: service
    },
    'x-casaos': xCasaos
  };

  // Add named volumes at the root level if any are used
  if (data.volumes && data.volumes.length > 0) {
    const namedVolumes = {};
    for (const vol of data.volumes) {
      const hostPart = vol.split(':')[0];
      // If the host part doesn't start with / or ./ or ., it's likely a named volume
      if (hostPart && !hostPart.startsWith('/') && !hostPart.startsWith('.') && !hostPart.startsWith('~')) {
        namedVolumes[hostPart] = {};
      }
    }
    if (Object.keys(namedVolumes).length > 0) {
      compose.volumes = namedVolumes;
    }
  }

  return dumpYAML(compose) + '\n';
}

/**
 * Extracts x-casaos metadata from a compose file string using js-yaml
 */
function parseCasaOSMetadata(yamlStr) {
  const metadata = {};
  
  try {
    const yaml = require('js-yaml');
    const doc = yaml.load(yamlStr);
    
    if (doc) {
      if (doc.name) {
        metadata.name = String(doc.name).trim();
      }
      
      let xCasaos = doc['x-casaos'];
      
      // Se non c'è al root, prova a cercarlo dentro il primo servizio
      if (!xCasaos && doc.services) {
        const services = Object.values(doc.services);
        if (services.length > 0 && services[0]['x-casaos']) {
          xCasaos = services[0]['x-casaos'];
        }
      }

      if (xCasaos && typeof xCasaos === 'object') {
        if (xCasaos.title) {
          const titleCustom = xCasaos.title.custom;
          const titleEn = xCasaos.title.en_US || xCasaos.title.en_us || xCasaos.title.en || xCasaos.title.it;
          
          if (titleCustom && String(titleCustom).trim() !== '') {
            metadata.title = String(titleCustom).trim();
          } else if (titleEn && String(titleEn).trim() !== '') {
            metadata.title = String(titleEn).trim();
          } else if (typeof xCasaos.title === 'string' && xCasaos.title.trim() !== '') {
            metadata.title = xCasaos.title.trim();
          }
        }
        
        if (xCasaos.icon) {
          metadata.icon = String(xCasaos.icon).trim();
        }
        
        if (xCasaos.scheme) {
          metadata.scheme = String(xCasaos.scheme).trim();
        }
        
        if (xCasaos.index) {
          metadata.path = String(xCasaos.index).trim();
        }
        
        if (xCasaos.path) {
          metadata.path = String(xCasaos.path).trim();
        }
        
        if (xCasaos.port_map) {
          metadata.port = String(xCasaos.port_map).trim();
        }

        if (xCasaos.host) {
          metadata.host = String(xCasaos.host).trim();
        }
      }
    }
  } catch (err) {
    console.warn('YAML Parse Error in parseCasaOSMetadata:', err.message);
  }

  return metadata;
}

/**
 * Injects CasaOS metadata directly into container objects.
 * Modifies the containers array in place.
 */
function injectCasaOSMetadata(containers, appsDir) {
  const fs = require('fs');
  const path = require('path');
  
  if (!Array.isArray(containers)) {
    containers = [containers];
  }

  for (const c of containers) {
    const isInspectFormat = !!c.Config; // docker.getContainer(id).inspect() returns an object with Config
    const labels = isInspectFormat ? (c.Config.Labels || {}) : (c.Labels || {});
    
    if (isInspectFormat && !c.Config.Labels) c.Config.Labels = {};
    if (!isInspectFormat && !c.Labels) c.Labels = {};
    const targetLabels = isInspectFormat ? c.Config.Labels : c.Labels;

    // Skip reading stale net.casaos labels. We MUST read the YAML on disk.
    let projectName = labels['com.docker.compose.project'];
    const workingDir = labels['com.docker.compose.project.working_dir'];
    
    if (!projectName) {
      // Se creato tramite le API native di CasaOS, le etichette compose potrebbero mancare.
      // In questo caso, il nome del container corrisponde solitamente al nome della cartella in appsDir.
      const rawName = isInspectFormat ? c.Name : (c.Names && c.Names[0]);
      if (rawName) {
        projectName = rawName.replace(/^\//, '');
      }
    }
    
    if (projectName) {
      let appDir = null;
      if (workingDir && fs.existsSync(workingDir)) {
        appDir = workingDir;
      } else if (appsDir) {
        // Fallback: case-insensitive search in appsDir
        if (fs.existsSync(appsDir)) {
          const files = fs.readdirSync(appsDir);
          const lowerProject = projectName.toLowerCase();
          for (const file of files) {
            if (file.toLowerCase() === lowerProject) {
              appDir = path.join(appsDir, file);
              break;
            }
          }
        }
        if (!appDir) {
          appDir = path.join(appsDir, projectName); // strict fallback
        }
      }
      
      if (appDir) {
        let composePath = path.join(appDir, 'docker-compose.yml');
        
        if (!fs.existsSync(composePath)) {
          composePath = path.join(appDir, 'docker-compose.yaml');
        }
        
        if (fs.existsSync(composePath)) {
          try {
            const yamlStr = fs.readFileSync(composePath, 'utf8');
            const metadata = parseCasaOSMetadata(yamlStr);
            
            if (metadata.title) {
              targetLabels['casaos.reborn.name'] = metadata.title;
            } else if (metadata.name && !targetLabels['casaos.app.name']) {
              targetLabels['casaos.reborn.name'] = metadata.name;
            }
            
            if (metadata.icon) targetLabels['casaos.reborn.icon'] = metadata.icon;
            if (metadata.scheme) targetLabels['casaos.reborn.web.scheme'] = metadata.scheme;
            if (metadata.path) targetLabels['casaos.reborn.web.path'] = metadata.path;
            if (metadata.port) targetLabels['casaos.reborn.web.port'] = metadata.port;
            if (metadata.host) targetLabels['casaos.reborn.web.host'] = metadata.host;
          } catch (err) {
            console.warn(`Failed to parse docker-compose.yml for project ${projectName}:`, err.message);
          }
        }
      }
    }
    
    // Filtro variabili d'ambiente di sistema per pulire l'interfaccia utente (mobile e web)
    const systemVars = ['PATH', 'HOME', 'HOSTNAME', 'TERM', 'SHLVL', 'PWD', 'SUDO_USER', 'SUDO_UID', 'SUDO_GID', 'SUDO_COMMAND', 'DEBIAN_FRONTEND'];
    if (isInspectFormat && c.Config && Array.isArray(c.Config.Env)) {
      c.Config.Env = c.Config.Env.filter(env => {
        const key = env.split('=')[0];
        return !systemVars.includes(key);
      });
    } else if (!isInspectFormat && Array.isArray(c.Env)) {
      c.Env = c.Env.filter(env => {
        const key = env.split('=')[0];
        return !systemVars.includes(key);
      });
    }
  }
  
  return containers;
}

module.exports = {
  buildCasaOSCompose,
  dumpYAML,
  parseCasaOSMetadata,
  injectCasaOSMetadata
};
