import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Save, Code, FileText, Check, AlertTriangle, Plus, Trash2, PlusSquare } from 'lucide-react';
import yaml from 'js-yaml';
import { io } from 'socket.io-client';
import { useDialog } from '../contexts/DialogContext';

export default function NewContainer() {
  const { showAlert } = useDialog();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('manual');
  const [yamlInput, setYamlInput] = useState('');
  const [yamlError, setYamlError] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    image: '',
    tag: 'latest',
    icon: '',
    restartPolicy: 'unless-stopped',
    privileged: false,
    memory: '',
    ports: [],
    volumes: [],
    env: []
  });

  // Connect socket for creation progress
  useEffect(() => {
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
      // If it's a compose file, grab the first service
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
      
      // Parse ports
      if (service.ports) {
        newData.ports = service.ports.map(p => {
          if (typeof p === 'string') {
            const parts = p.split(':');
            if (parts.length === 2) return { host: parts[0], container: parts[1] };
            if (parts.length === 3) return { host: parts[1], container: parts[2] };
          }
          return { host: '', container: '' };
        }).filter(p => p.host && p.container);
      }

      // Parse volumes
      if (service.volumes) {
        newData.volumes = service.volumes.map(v => {
          if (typeof v === 'string') {
            const parts = v.split(':');
            if (parts.length >= 2) return { host: parts[0], container: parts[1] };
          }
          return { host: '', container: '' };
        }).filter(v => v.host && v.container);
      }

      // Parse env
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
    
    // Transform arrays back to objects for API
    const portsObj = {};
    formData.ports.forEach(p => {
      if (p.host && p.container) portsObj[`${p.container}/tcp`] = [{ HostPort: p.host }];
    });

    const envArray = formData.env.filter(e => e.key).map(e => `${e.key}=${e.value}`);
    const volumesArray = formData.volumes.filter(v => v.host && v.container).map(v => `${v.host}:${v.container}`);

    const payload = {
      image: formData.image,
      tag: formData.tag || 'latest',
      name: formData.name,
      displayName: formData.displayName,
      icon: formData.icon,
      restartPolicy: formData.restartPolicy,
      privileged: formData.privileged,
      memory: formData.memory ? parseInt(formData.memory) * 1024 * 1024 : 0,
      ports: portsObj,
      volumes: volumesArray,
      env: envArray
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
      // We don't setLoading(false) here, we wait for socket event
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

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '40px' }}>
      <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <PlusSquare size={24} /> Create New Container
      </h2>

      {loading && progress && (
        <div className="glass" style={{ padding: '20px', marginBottom: '20px', textAlign: 'center' }}>
          <div className="spin" style={{ marginBottom: '10px' }}><Play size={32} color="var(--primary)" /></div>
          <h3>{progress.status}</h3>
          {progress.progressDetail?.current && (
            <p style={{ opacity: 0.7 }}>
              {Math.round((progress.progressDetail.current / progress.progressDetail.total) * 100)}%
            </p>
          )}
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
                placeholder="version: '3'\nservices:\n  nginx:\n    image: nginx:latest\n    ports:\n      - '8080:80'"
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label>Docker Container Name *</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="my-app" />
                </div>
                <div>
                  <label>Display Name (Dashboard)</label>
                  <input type="text" value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} placeholder={formData.name || "My App"} />
                </div>
              </div>
              
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
                <label>Icon URL</label>
                <input type="text" value={formData.icon} onChange={e => setFormData({...formData, icon: e.target.value})} placeholder="https://example.com/icon.png" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label>Restart Policy</label>
                  <select value={formData.restartPolicy} onChange={e => setFormData({...formData, restartPolicy: e.target.value})}>
                    <option value="no">No</option>
                    <option value="always">Always</option>
                    <option value="on-failure">On Failure</option>
                    <option value="unless-stopped">Unless Stopped</option>
                  </select>
                </div>
                <div>
                  <label>Memory Limit (MB) - Optional</label>
                  <input type="number" value={formData.memory} onChange={e => setFormData({...formData, memory: e.target.value})} placeholder="e.g. 512" />
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
                  <button className="btn-pill" onClick={() => addList('ports', { host: '', container: '' })}><Plus size={14}/> Add</button>
                </div>
                <div className="list-grid ports-grid" style={{ marginBottom: '8px' }}>
                  <span>Host Port</span><span>Container Port</span><span>Protocol</span><span></span>
                </div>
                {formData.ports.map((port, idx) => (
                  <div key={idx} className="list-grid ports-grid">
                    <input type="text" placeholder="8080" value={port.host} onChange={e => updateList('ports', idx, 'host', e.target.value)} />
                    <input type="text" placeholder="80" value={port.container} onChange={e => updateList('ports', idx, 'container', e.target.value)} />
                    <select disabled><option>TCP</option></select>
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
