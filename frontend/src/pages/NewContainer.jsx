import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Save, Code, FileText, Check, AlertTriangle, Plus, Trash2, PlusSquare } from 'lucide-react';
import yaml from 'js-yaml';
import { io } from 'socket.io-client';
import { useDialog } from '../contexts/DialogContext';

const CAPABILITIES = [
  'AUDIT_CONTROL', 'AUDIT_READ', 'BLOCK_SUSPEND', 'BPF', 'CHECKPOINT_RESTORE',
  'DAC_READ_SEARCH', 'IPC_LOCK', 'IPC_OWNER', 'LEASE', 'LINUX_IMMUTABLE',
  'MAC_ADMIN', 'MAC_OVERRIDE', 'NET_ADMIN', 'NET_BROADCAST', 'PERFMON',
  'SYS_ADMIN', 'SYS_BOOT', 'SYS_MODULE', 'SYS_NICE', 'SYS_PACCT',
  'SYS_PTRACE', 'SYS_RAWIO', 'SYS_RESOURCE', 'SYS_TIME', 'SYS_TTY_CONFIG',
  'SYSLOG', 'WAKE_ALARM'
];

export default function NewContainer() {
  const { showAlert } = useDialog();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('manual');
  const [yamlInput, setYamlInput] = useState('');
  const [yamlError, setYamlError] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [maxMemory, setMaxMemory] = useState(8192);

  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    image: '',
    tag: 'latest',
    icon: '',
    webUI: { scheme: 'http', port: '', path: '/' },
    networkMode: 'bridge',
    pidMode: '',
    hostname: '',
    restartPolicy: 'unless-stopped',
    privileged: false,
    memory: 0,
    cpuQuota: 0,
    ports: [],
    volumes: [],
    env: [],
    devices: [],
    commands: [],
    capAdd: []
  });

  useEffect(() => {
    const fetchSysInfo = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/system/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.memory && data.memory.total) {
            const totalMB = Math.floor(data.memory.total / (1024 * 1024));
            setMaxMemory(totalMB);
          }
        }
      } catch (err) {
        console.error('Failed to fetch system memory', err);
      }
    };
    fetchSysInfo();

    const token = localStorage.getItem('token');
    const socket = io({ auth: { type: 'ui', token } });

    socket.on('container.create.progress', (data) => {
      setProgress(data);
    });

    socket.on('container.create.success', (data) => {
      setLoading(false);
      setProgress(null);
      navigate('/');
    });

    socket.on('container.create.error', (data) => {
      setLoading(false);
      setProgress(null);
      showAlert('Errore Creazione', 'Error: ' + data.error, true);
    });

    return () => socket.disconnect();
  }, [navigate]);

  const handleImportYaml = () => {
    setYamlError('');
    try {
      const parsed = yaml.load(yamlInput);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid YAML');
      
      let service = parsed;
      if (parsed.services) {
        const serviceName = Object.keys(parsed.services)[0];
        service = parsed.services[serviceName];
        if (!service.container_name) service.container_name = serviceName;
      }

      if (!service.image) throw new Error('No image specified in YAML');

      let imageName = service.image;
      let imageTag = 'latest';
      const colonIdx = service.image.lastIndexOf(':');
      if (colonIdx > 0 && !service.image.substring(colonIdx).includes('/')) {
        imageName = service.image.substring(0, colonIdx);
        imageTag = service.image.substring(colonIdx + 1);
      }

      const getCasaOSData = (xCasaos) => {
        if (!xCasaos) return {};
        const res = {};
        if (xCasaos.icon) res.icon = xCasaos.icon;
        if (xCasaos.title) {
          if (typeof xCasaos.title === 'string') res.title = xCasaos.title;
          else if (xCasaos.title.custom) res.title = xCasaos.title.custom;
          else if (xCasaos.title.en_us) res.title = xCasaos.title.en_us;
        }
        if (xCasaos.ports) {
            const uiPort = xCasaos.ports.find(p => p.ui || p.web);
            if (uiPort) {
                res.scheme = uiPort.scheme || 'http';
                res.port = uiPort.target || uiPort.published || '';
                res.path = uiPort.path || '/';
            }
        }
        return res;
      };

      const rootCasaosData = getCasaOSData(parsed['x-casaos']);
      const serviceCasaosData = getCasaOSData(service['x-casaos']);

      const newData = { ...formData };
      newData.image = imageName;
      newData.tag = imageTag;
      newData.name = service.container_name || '';
      newData.displayName = serviceCasaosData.title || rootCasaosData.title || '';
      newData.icon = serviceCasaosData.icon || rootCasaosData.icon || '';
      newData.restartPolicy = service.restart || 'unless-stopped';
      newData.privileged = !!service.privileged;
      newData.networkMode = service.network_mode || 'bridge';
      newData.pidMode = service.pid || '';
      newData.hostname = service.hostname || '';
      
      if (serviceCasaosData.port || rootCasaosData.port) {
          newData.webUI = {
              scheme: serviceCasaosData.scheme || rootCasaosData.scheme || 'http',
              port: serviceCasaosData.port || rootCasaosData.port || '',
              path: serviceCasaosData.path || rootCasaosData.path || '/'
          };
      }

      if (service.ports) {
        newData.ports = service.ports.map(p => {
          if (typeof p === 'string') {
            const parts = p.split(':');
            let protocol = 'tcp';
            let host = '';
            let container = '';
            if (parts.length === 2) { host = parts[0]; container = parts[1]; }
            if (parts.length === 3) { host = parts[1]; container = parts[2]; }
            if (container.includes('/')) {
                const cParts = container.split('/');
                container = cParts[0];
                protocol = cParts[1].toLowerCase();
            }
            return { host, container, protocol };
          } else if (typeof p === 'object') {
              return {
                  host: String(p.published || ''),
                  container: String(p.target || ''),
                  protocol: (p.protocol || 'tcp').toLowerCase()
              };
          }
          return { host: '', container: '', protocol: 'tcp' };
        }).filter(p => p.host && p.container);
      }

      if (service.volumes) {
        newData.volumes = service.volumes.map(v => {
          if (typeof v === 'string') {
            const parts = v.split(':');
            if (parts.length >= 2) return { host: parts[0], container: parts[1] };
          } else if (typeof v === 'object') {
              return { host: v.source || '', container: v.target || '' };
          }
          return { host: '', container: '' };
        }).filter(v => v.host && v.container);
      }

      if (service.environment) {
        if (Array.isArray(service.environment)) {
          newData.env = service.environment.map(e => {
            const [k, ...v] = e.split('=');
            return { key: k, value: v.join('=') };
          });
        } else {
          newData.env = Object.entries(service.environment).map(([k, v]) => ({ key: k, value: String(v) }));
        }
      }

      if (service.devices) {
          newData.devices = service.devices.map(d => {
              if (typeof d === 'string') {
                  const parts = d.split(':');
                  if (parts.length >= 2) return { host: parts[0], container: parts[1] };
              }
              return { host: '', container: '' };
          }).filter(d => d.host && d.container);
      }

      if (service.command) {
          if (Array.isArray(service.command)) {
              newData.commands = service.command.map(c => ({ value: c }));
          } else {
              newData.commands = service.command.split(' ').map(c => ({ value: c }));
          }
      }
      
      if (service.cap_add) {
          newData.capAdd = service.cap_add.filter(c => CAPABILITIES.includes(c.toUpperCase())).map(c => c.toUpperCase());
      }

      setFormData(newData);
      setActiveTab('manual');
    } catch (err) {
      setYamlError(err.message);
    }
  };

  const handleCreate = async () => {
    if (!formData.image) {
      showAlert('Attenzione', 'Image is required');
      return;
    }
    
    setLoading(true);
    
    const portsObj = {};
    formData.ports.forEach(p => {
      if (p.host && p.container) {
          const key = `${p.container}/${p.protocol}`;
          if (!portsObj[key]) portsObj[key] = [];
          portsObj[key].push({ HostPort: p.host });
      }
    });

    const envArray = formData.env.filter(e => e.key).map(e => `${e.key}=${e.value}`);
    const volumesArray = formData.volumes.filter(v => v.host && v.container).map(v => `${v.host}:${v.container}`);
    const devicesArray = formData.devices.filter(d => d.host && d.container).map(d => ({
        PathOnHost: d.host,
        PathInContainer: d.container,
        CgroupPermissions: 'rwm'
    }));
    const commandsArray = formData.commands.filter(c => c.value).map(c => c.value);

    let cpuQuotaObj = 0;
    if (formData.cpuQuota === 1) cpuQuotaObj = 25000;
    else if (formData.cpuQuota === 2) cpuQuotaObj = 50000;
    else if (formData.cpuQuota === 3) cpuQuotaObj = 75000;

    const payload = {
      image: formData.image,
      tag: formData.tag || 'latest',
      name: formData.name,
      displayName: formData.displayName,
      icon: formData.icon,
      webUI: formData.webUI.port ? formData.webUI : null,
      networkMode: formData.networkMode,
      pidMode: formData.pidMode,
      hostname: formData.hostname,
      restartPolicy: formData.restartPolicy,
      privileged: formData.privileged,
      memory: formData.memory ? parseInt(formData.memory) * 1024 * 1024 : 0,
      cpuQuota: cpuQuotaObj,
      ports: portsObj,
      volumes: volumesArray,
      env: envArray,
      devices: devicesArray,
      cmd: commandsArray,
      capAdd: formData.capAdd
    };

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/docker/containers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to start creation process');
      }
    } catch (err) {
      showAlert('Errore', err.message, true);
      setLoading(false);
    }
  };

  const updateList = (field, index, key, value) => {
    const list = [...formData[field]];
    list[index][key] = value;
    setFormData({ ...formData, [field]: list });
  };

  const addList = (field, emptyObj) => setFormData({ ...formData, [field]: [...formData[field], emptyObj] });
  const removeList = (field, index) => setFormData({ ...formData, [field]: formData[field].filter((_, i) => i !== index) });

  const handleCapToggle = (cap) => {
      const isSelected = formData.capAdd.includes(cap);
      if (isSelected) {
          setFormData({ ...formData, capAdd: formData.capAdd.filter(c => c !== cap) });
      } else {
          setFormData({ ...formData, capAdd: [...formData.capAdd, cap] });
      }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '40px' }}>
      <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <PlusSquare size={24} /> Create New Container
      </h2>

      {loading && progress && (
        <div style={{
          padding: '3px',
          borderRadius: '20px',
          background: `conic-gradient(from 0deg, var(--primary) ${progress.progressDetail?.total ? Math.round((progress.progressDetail.current / progress.progressDetail.total) * 100) : 0}%, transparent ${progress.progressDetail?.total ? Math.round((progress.progressDetail.current / progress.progressDetail.total) * 100) : 0}%)`,
          marginBottom: '20px',
          transition: 'background 0.3s ease'
        }}>
          <div className="glass" style={{ padding: '20px', textAlign: 'center', margin: 0, border: 'none', borderRadius: '17px', background: 'var(--bg-color)' }}>
            <div className="spin" style={{ marginBottom: '10px' }}><Play size={32} color="var(--primary)" /></div>
            <h3 style={{ margin: '0 0 10px 0' }}>{progress.status}</h3>
            {progress.progressDetail?.current && (
              <p style={{ opacity: 0.8, marginTop: '10px', marginBottom: 0, fontWeight: 'bold', fontSize: '1.2rem' }}>
                {Math.round((progress.progressDetail.current / progress.progressDetail.total) * 100)}%
              </p>
            )}
          </div>
        </div>
      )}

      <div className="glass" style={{ overflow: 'hidden', display: loading ? 'none' : 'block' }}>
        
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--card-border)' }}>
          <button 
            className="btn" 
            style={{ flex: 1, borderRadius: 0, padding: '15px', background: activeTab === 'manual' ? 'var(--primary)' : 'transparent', color: activeTab === 'manual' ? 'white' : 'var(--text-color)' }}
            onClick={() => setActiveTab('manual')}
          >
            <FileText size={18} /> Manual Configuration
          </button>
          <button 
            className="btn" 
            style={{ flex: 1, borderRadius: 0, padding: '15px', background: activeTab === 'yaml' ? 'var(--primary)' : 'transparent', color: activeTab === 'yaml' ? 'white' : 'var(--text-color)' }}
            onClick={() => setActiveTab('yaml')}
          >
            <Code size={18} /> Import docker-compose
          </button>
        </div>

        <div style={{ padding: '20px' }} className="casaos-form">
          {activeTab === 'yaml' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>
                Paste a <code>docker-compose.yml</code> file here. We will parse it and pre-fill the manual configuration form.
              </p>
              <textarea 
                value={yamlInput}
                onChange={e => setYamlInput(e.target.value)}
                style={{ width: '100%', height: '300px', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '15px', fontFamily: 'monospace' }}
                placeholder={"version: '3'\nservices:\n  nginx:\n    image: nginx:latest\n    ports:\n      - '8080:80'"}
              />
              {yamlError && (
                <div style={{ padding: '10px', background: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertTriangle size={18} /> {yamlError}
                </div>
              )}
              <button className="btn btn-primary" onClick={handleImportYaml} style={{ alignSelf: 'flex-start' }}>
                <Check size={18} /> Parse & Review
              </button>
            </div>
          )}

          {activeTab === 'manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: '10px' }}>
                <div>
                  <label>Docker Image *</label>
                  <input type="text" value={formData.image} onChange={e => setFormData({...formData, image: e.target.value})} placeholder="nginx" />
                </div>
                <div>
                  <label>Tag</label>
                  <input type="text" value={formData.tag} onChange={e => setFormData({...formData, tag: e.target.value})} placeholder="latest" />
                </div>
              </div>

              <div>
                  <label>Docker Container Name *</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="my-app" />
              </div>

              <div>
                <label>Display Name (Dashboard)</label>
                <input type="text" value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} placeholder={formData.name || "My App"} />
              </div>

              <div>
                <label>Icon URL</label>
                <input type="text" value={formData.icon} onChange={e => setFormData({...formData, icon: e.target.value})} placeholder="https://example.com/icon.png" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', gap: '10px', alignItems: 'end' }}>
                <div>
                  <label>Web UI Scheme</label>
                  <select value={formData.webUI.scheme} onChange={e => setFormData({...formData, webUI: {...formData.webUI, scheme: e.target.value}})}>
                    <option value="http">http://</option>
                    <option value="https">https://</option>
                  </select>
                </div>
                <div>
                  <label>Web UI Port</label>
                  <input type="text" value={formData.webUI.port} onChange={e => setFormData({...formData, webUI: {...formData.webUI, port: e.target.value}})} placeholder="e.g. 8080" />
                </div>
                <div>
                  <label>Web UI Path</label>
                  <input type="text" value={formData.webUI.path} onChange={e => setFormData({...formData, webUI: {...formData.webUI, path: e.target.value}})} placeholder="e.g. /admin" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '20px' }}>
                <div>
                  <label>Network Mode</label>
                  <select value={formData.networkMode} onChange={e => setFormData({...formData, networkMode: e.target.value})}>
                    <option value="bridge">bridge</option>
                    <option value="host">host</option>
                    <option value="none">none</option>
                  </select>
                </div>
                <div>
                  <label>PID Mode</label>
                  <input type="text" value={formData.pidMode} onChange={e => setFormData({...formData, pidMode: e.target.value})} placeholder="e.g. host" list="pid-options" />
                  <datalist id="pid-options">
                    <option value="host" />
                  </datalist>
                </div>
                <div>
                  <label>Hostname</label>
                  <input type="text" value={formData.hostname} onChange={e => setFormData({...formData, hostname: e.target.value})} placeholder="Optional" />
                </div>
                <div>
                  <label>Restart Policy</label>
                  <select value={formData.restartPolicy} onChange={e => setFormData({...formData, restartPolicy: e.target.value})}>
                    <option value="no">No</option>
                    <option value="always">Always</option>
                    <option value="on-failure">On Failure</option>
                    <option value="unless-stopped">Unless Stopped</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label>Memory Limit</label>
                  <input type="range" className="memory-slider" min="0" max={maxMemory} step="256" value={formData.memory} onChange={e => setFormData({...formData, memory: parseInt(e.target.value)})} />
                  <div style={{ textAlign: 'center', fontSize: '0.9rem', marginTop: '5px' }}>{formData.memory === 0 ? 'Unlimited' : `${formData.memory} MB (Max: ${maxMemory} MB)`}</div>
                </div>
                <div>
                  <label>CPU Quota</label>
                  <select value={formData.cpuQuota} onChange={e => setFormData({...formData, cpuQuota: parseInt(e.target.value)})}>
                    <option value={0}>Unlimited</option>
                    <option value={1}>Low (25%)</option>
                    <option value={2}>Medium (50%)</option>
                    <option value={3}>High (75%)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label className="switch">
                  <input type="checkbox" checked={formData.privileged} onChange={e => setFormData({...formData, privileged: e.target.checked})} />
                  <span className="slider round"></span>
                </label>
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Privileged Mode</span>
              </div>

              {/* Ports */}
              <div style={{ padding: '15px', background: 'var(--bg-color)', borderRadius: '8px' }}>
                <div className="section-header">
                  <span style={{ fontWeight: 'bold' }}>Port Mappings</span>
                  <button className="btn-pill" onClick={() => addList('ports', { host: '', container: '', protocol: 'tcp' })}><Plus size={14}/> Add</button>
                </div>
                <div className="list-grid ports-grid" style={{ marginBottom: '8px' }}>
                  <span>Host Port</span><span>Container Port</span><span>Protocol</span><span></span>
                </div>
                {formData.ports.map((port, idx) => (
                  <div key={idx} className="list-grid ports-grid">
                    <input type="text" placeholder="8080" value={port.host} onChange={e => updateList('ports', idx, 'host', e.target.value)} />
                    <input type="text" placeholder="80" value={port.container} onChange={e => updateList('ports', idx, 'container', e.target.value)} />
                    <select value={port.protocol} onChange={e => updateList('ports', idx, 'protocol', e.target.value)}>
                        <option value="tcp">TCP</option>
                        <option value="udp">UDP</option>
                    </select>
                    <button className="btn-icon" onClick={() => removeList('ports', idx)}><Trash2 size={16}/></button>
                  </div>
                ))}
                {formData.ports.length === 0 && <p style={{ fontSize: '0.8rem', opacity: 0.6, textAlign: 'center' }}>No ports mapped</p>}
              </div>

              {/* Volumes */}
              <div style={{ padding: '15px', background: 'var(--bg-color)', borderRadius: '8px' }}>
                <div className="section-header">
                  <span style={{ fontWeight: 'bold' }}>Volumes</span>
                  <button className="btn-pill" onClick={() => addList('volumes', { host: '', container: '' })}><Plus size={14}/> Add</button>
                </div>
                <div className="list-grid volumes-grid" style={{ marginBottom: '8px' }}>
                  <span>Host Path</span><span>Container Path</span><span></span>
                </div>
                {formData.volumes.map((vol, idx) => (
                  <div key={idx} className="list-grid volumes-grid">
                    <input type="text" placeholder="/path/on/host" value={vol.host} onChange={e => updateList('volumes', idx, 'host', e.target.value)} />
                    <input type="text" placeholder="/path/in/container" value={vol.container} onChange={e => updateList('volumes', idx, 'container', e.target.value)} />
                    <button className="btn-icon" onClick={() => removeList('volumes', idx)}><Trash2 size={16}/></button>
                  </div>
                ))}
                {formData.volumes.length === 0 && <p style={{ fontSize: '0.8rem', opacity: 0.6, textAlign: 'center' }}>No volumes mapped</p>}
              </div>

              {/* Devices */}
              <div style={{ padding: '15px', background: 'var(--bg-color)', borderRadius: '8px' }}>
                <div className="section-header">
                  <span style={{ fontWeight: 'bold' }}>Devices</span>
                  <button className="btn-pill" onClick={() => addList('devices', { host: '', container: '' })}><Plus size={14}/> Add</button>
                </div>
                <div className="list-grid devices-grid" style={{ marginBottom: '8px' }}>
                  <span>Host Device</span><span>Container Device</span><span></span>
                </div>
                {formData.devices.map((dev, idx) => (
                  <div key={idx} className="list-grid devices-grid">
                    <input type="text" placeholder="/dev/dri" value={dev.host} onChange={e => updateList('devices', idx, 'host', e.target.value)} />
                    <input type="text" placeholder="/dev/dri" value={dev.container} onChange={e => updateList('devices', idx, 'container', e.target.value)} />
                    <button className="btn-icon" onClick={() => removeList('devices', idx)}><Trash2 size={16}/></button>
                  </div>
                ))}
                {formData.devices.length === 0 && <p style={{ fontSize: '0.8rem', opacity: 0.6, textAlign: 'center' }}>No devices mapped</p>}
              </div>

              {/* Environment Variables */}
              <div style={{ padding: '15px', background: 'var(--bg-color)', borderRadius: '8px' }}>
                <div className="section-header">
                  <span style={{ fontWeight: 'bold' }}>Environment Variables</span>
                  <button className="btn-pill" onClick={() => addList('env', { key: '', value: '' })}><Plus size={14}/> Add</button>
                </div>
                <div className="list-grid env-grid" style={{ marginBottom: '8px' }}>
                  <span>Key</span><span>Value</span><span></span>
                </div>
                {formData.env.map((env, idx) => (
                  <div key={idx} className="list-grid env-grid">
                    <input type="text" placeholder="TZ" value={env.key} onChange={e => updateList('env', idx, 'key', e.target.value)} />
                    <input type="text" placeholder="Europe/Rome" value={env.value} onChange={e => updateList('env', idx, 'value', e.target.value)} />
                    <button className="btn-icon" onClick={() => removeList('env', idx)}><Trash2 size={16}/></button>
                  </div>
                ))}
                {formData.env.length === 0 && <p style={{ fontSize: '0.8rem', opacity: 0.6, textAlign: 'center' }}>No env variables</p>}
              </div>

              {/* Commands */}
              <div style={{ padding: '15px', background: 'var(--bg-color)', borderRadius: '8px' }}>
                <div className="section-header">
                  <span style={{ fontWeight: 'bold' }}>Container Command</span>
                  <button className="btn-pill" onClick={() => addList('commands', { value: '' })}><Plus size={14}/> Add</button>
                </div>
                <div className="list-grid commands-grid" style={{ marginBottom: '8px' }}>
                  <span>Command</span><span></span>
                </div>
                {formData.commands.map((cmd, idx) => (
                  <div key={idx} className="list-grid commands-grid">
                    <input type="text" placeholder="--appendonly=yes" value={cmd.value} onChange={e => updateList('commands', idx, 'value', e.target.value)} />
                    <button className="btn-icon" onClick={() => removeList('commands', idx)}><Trash2 size={16}/></button>
                  </div>
                ))}
                {formData.commands.length === 0 && <p style={{ fontSize: '0.8rem', opacity: 0.6, textAlign: 'center' }}>No custom commands</p>}
              </div>

              {/* Capabilities */}
              <div style={{ padding: '15px', background: 'var(--bg-color)', borderRadius: '8px' }}>
                <div className="section-header">
                  <span style={{ fontWeight: 'bold' }}>Capabilities (cap-add)</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                    {CAPABILITIES.map(cap => (
                        <div 
                            key={cap} 
                            onClick={() => handleCapToggle(cap)}
                            style={{ 
                                padding: '5px 10px', 
                                borderRadius: '4px', 
                                border: '1px solid var(--card-border)', 
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                background: formData.capAdd.includes(cap) ? 'var(--primary)' : 'transparent',
                                color: formData.capAdd.includes(cap) ? 'white' : 'inherit'
                            }}
                        >
                            {cap}
                        </div>
                    ))}
                </div>
              </div>

              <button className="btn btn-primary" onClick={handleCreate} style={{ padding: '15px', fontSize: '1.1rem', marginTop: '10px' }}>
                <Save size={20} /> Deploy Container
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
