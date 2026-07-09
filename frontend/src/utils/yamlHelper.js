import yaml from 'js-yaml';

/**
 * Genera una stringa docker-compose.yml a partire dai dati del form del container.
 * @param {Object} data - I dati del container provenienti da ContainerSettingsModal o NewContainer
 * @returns {string} - La stringa YAML formattata
 */
export const generateYamlFromData = (data) => {
  const service = {
    image: data.tag ? `${data.image}:${data.tag}` : data.image,
    container_name: data.name,
    restart: data.restartPolicy,
  };
  
  if (data.privileged) service.privileged = true;
  if (data.pidMode) service.pid = data.pidMode;
  
  // Supporta sia la struttura {hostPort, containerPort} che {host, container}
  const validPorts = (data.ports || []).filter(p => (p.hostPort && p.containerPort) || (p.host && p.container));
  if (validPorts.length > 0) {
    service.ports = validPorts.map(p => {
      const hPort = p.hostPort || p.host;
      const cPort = p.containerPort || p.container;
      const proto = p.protocol === 'tcp' ? '' : `/${p.protocol}`;
      return `${hPort}:${cPort}${proto}`;
    });
  }

  // Supporta sia la struttura {hostPath, containerPath} che {host, container}
  const validVolumes = (data.volumes || []).filter(v => (v.hostPath && v.containerPath) || (v.host && v.container));
  if (validVolumes.length > 0) {
    service.volumes = validVolumes.map(v => {
      const hPath = v.hostPath || v.host;
      const cPath = v.containerPath || v.container;
      return `${hPath}:${cPath}`;
    });
  }

  const validEnv = (data.env || []).filter(e => e.key);
  if (validEnv.length > 0) {
    service.environment = validEnv.map(e => `${e.key}=${e.value}`);
  }

  // Aggiunta supporto per comandi custom (usati in NewContainer)
  const validCommands = (data.commands || []).filter(c => c.value);
  if (validCommands.length > 0) {
    service.command = validCommands.map(c => c.value);
  }

  // Aggiunta supporto per devices
  const validDevices = (data.devices || []).filter(d => d.host && d.container);
  if (validDevices.length > 0) {
    service.devices = validDevices.map(d => `${d.host}:${d.container}`);
  }

  // Aggiunta supporto per cap_add
  const validCaps = (data.capAdd || []);
  if (validCaps.length > 0) {
    service.cap_add = validCaps;
  }
  
  const xCasaos = {};
  if (data.displayName) {
      xCasaos.title = { custom: data.displayName };
  }
  if (data.icon) {
      xCasaos.icon = data.icon;
  }
  if (data.webUI && data.webUI.port) {
      xCasaos.ports = [{
          ui: true,
          scheme: (data.webUI.scheme || 'http://').replace('://', ''),
          target: data.webUI.port,
          path: data.webUI.path || '/'
      }];
  }
  
  const compose = {
    name: data.name || 'app',
    version: '3.9',
    services: {
      [data.name || 'app']: service
    }
  };

  if (Object.keys(xCasaos).length > 0) {
      compose['x-casaos'] = xCasaos;
  }

  return yaml.dump(compose);
};

/**
 * Avvia il download del file YAML nel browser
 * @param {string} yamlString - La stringa YAML da scaricare
 * @param {string} filename - Il nome del file
 */
export const downloadYamlFile = (yamlString, filename = 'docker-compose.yml') => {
  const blob = new Blob([yamlString], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
