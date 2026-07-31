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

  // Ports
  const validPorts = [];
  if (data.ports) {
    for (const key of Object.keys(data.ports)) {
      const [containerPort, protocol] = key.split('/');
      for (const p of data.ports[key]) {
        const protoStr = protocol === 'tcp' ? '' : `/${protocol}`;
        validPorts.push(`${p.HostPort}:${containerPort}${protoStr}`);
      }
    }
  }
  if (validPorts.length > 0) service.ports = validPorts;

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
  const xCasaos = {
    author: "casaos-reborn",
    category: data.webUI ? "Web" : "App",
    main: data.name,
    store_app_id: data.name,
    is_uncontrolled: false,
    title: {
      custom: titleStr,
      en_us: titleStr
    }
  };

  service.labels = {};
  if (data.icon) {
    xCasaos.icon = data.icon;
    service.labels['icon'] = data.icon;
  }
  // Standard casaos label for fallback compatibility
  service.labels['casaos.app.name'] = titleStr;

  if (data.webUI) {
    xCasaos.scheme = data.webUI.scheme ? data.webUI.scheme.replace('://', '') : 'http';
    xCasaos.index = data.webUI.path || '/';
    xCasaos.port_map = String(data.webUI.port);
    xCasaos.ports = [{
      ui: true,
      scheme: xCasaos.scheme,
      target: xCasaos.port_map,
      path: xCasaos.index
    }];
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
 * Extracts x-casaos metadata from a compose file string using regex
 */
function parseCasaOSMetadata(yamlStr) {
  const metadata = {};
  
  // Extract root name
  const nameMatch = yamlStr.match(/^name:\s*(.+)$/m);
  if (nameMatch) metadata.name = nameMatch[1].replace(/["']/g, '').trim();

  // Find x-casaos block
  const casaosIdx = yamlStr.indexOf('x-casaos:');
  if (casaosIdx !== -1) {
    const casaosBlock = yamlStr.substring(casaosIdx);
    
    // Extract custom title
    const titleMatch = casaosBlock.match(/custom:\s*(.+)$/m);
    if (titleMatch && !metadata.name) metadata.name = titleMatch[1].replace(/["']/g, '').trim();

    // Extract icon
    const iconMatch = casaosBlock.match(/icon:\s*(.+)$/m);
    if (iconMatch) metadata.icon = iconMatch[1].replace(/["']/g, '').trim();

    // Extract scheme
    const schemeMatch = casaosBlock.match(/scheme:\s*(.+)$/m);
    if (schemeMatch) metadata.scheme = schemeMatch[1].replace(/["']/g, '').trim();

    // Extract index/path
    const indexMatch = casaosBlock.match(/index:\s*(.+)$/m);
    if (indexMatch) metadata.path = indexMatch[1].replace(/["']/g, '').trim();

    // Extract port_map
    const portMapMatch = casaosBlock.match(/port_map:\s*(.+)$/m);
    if (portMapMatch) metadata.port = portMapMatch[1].replace(/["']/g, '').trim();
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
    
    const projectName = labels['com.docker.compose.project'];
    if (projectName && appsDir) {
      const appDir = path.join(appsDir, projectName);
      const composePath = path.join(appDir, 'docker-compose.yml');
      
      if (fs.existsSync(composePath)) {
        try {
          const yamlStr = fs.readFileSync(composePath, 'utf8');
          const metadata = parseCasaOSMetadata(yamlStr);
          
          if (isInspectFormat && !c.Config.Labels) c.Config.Labels = {};
          if (!isInspectFormat && !c.Labels) c.Labels = {};
          
          const targetLabels = isInspectFormat ? c.Config.Labels : c.Labels;
          
          if (metadata.name) targetLabels['casaos.reborn.name'] = metadata.name;
          if (metadata.icon) targetLabels['casaos.reborn.icon'] = metadata.icon;
          if (metadata.scheme) targetLabels['casaos.reborn.web.scheme'] = metadata.scheme;
          if (metadata.path) targetLabels['casaos.reborn.web.path'] = metadata.path;
          if (metadata.port) targetLabels['casaos.reborn.web.port'] = metadata.port;
        } catch (err) {
          console.warn(`Failed to parse docker-compose.yml for project ${projectName}:`, err.message);
        }
      }
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
