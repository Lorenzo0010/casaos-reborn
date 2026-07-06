import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Plus, Check, Image as ImageIcon, Download, Copy } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import yaml from 'js-yaml';

export default function ContainerSettingsModal({ containerId, containerOverrides, onUpdateOverride, onClose, onSaved }) {
  const { showAlert, showConfirm } = useDialog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showYamlExport, setShowYamlExport] = useState(false);
  const [yamlContent, setYamlContent] = useState('');
  const [data, setData] = useState({
    image: '',
    tag: 'latest',
    name: '',
    displayName: '',
    icon: '',
    env: [],
    ports: [],
    volumes: [],
    restartPolicy: 'unless-stopped',
    pidMode: '',
    privileged: false,
    memory: 0,
    webUI: { scheme: 'http://', port: '', path: '/' }
  });

  useEffect(() => {
    const fetchInspect = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/docker/containers/${containerId}/inspect`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const info = res.data;
        
        // Parse data
        const parsedEnv = (info?.Config?.Env || []).map(e => {
          const idx = e.indexOf('=');
          return { key: e.substring(0, idx), value: e.substring(idx + 1) };
        });

        const parsedPorts = [];
        const portBindings = info?.HostConfig?.PortBindings || {};
        for (const [key, valArray] of Object.entries(portBindings)) {
          const [cPort, proto] = key.split('/');
          if (valArray && valArray.length > 0) {
            parsedPorts.push({
              hostPort: valArray[0].HostPort || '',
              containerPort: cPort,
              protocol: proto
            });
          }
        }

        let parsedVolumes = [];
        if (info?.HostConfig?.Binds && info.HostConfig.Binds.length > 0) {
          parsedVolumes = info.HostConfig.Binds.map(b => {
            const parts = b.split(':');
            return { hostPath: parts[0] || '', containerPath: parts[1] || '' };
          });
        } else if (info?.Mounts && info.Mounts.length > 0) {
          parsedVolumes = info.Mounts.map(m => {
            return { hostPath: m.Source || '', containerPath: m.Destination || '' };
          });
        }

        // Parse image:tag
        const fullImage = info?.Config?.Image || '';
        let imageName = fullImage;
        let imageTag = 'latest';
        const colonIdx = fullImage.lastIndexOf(':');
        // Handle cases like registry.io/image:tag vs image:tag, avoid splitting on registry port
        if (colonIdx > 0 && !fullImage.substring(colonIdx).includes('/')) {
          imageName = fullImage.substring(0, colonIdx);
          imageTag = fullImage.substring(colonIdx + 1);
        }

        const stableId = (info?.Name || '').replace('/', '');
        const currentOverride = (containerOverrides && containerOverrides[stableId]) || {};
        const labels = info?.Config?.Labels || {};
        
        setData({
          image: imageName,
          tag: imageTag,
          name: stableId,
          displayName: currentOverride.displayName || labels['casaos.reborn.name'] || '',
          icon: currentOverride.icon || labels['casaos.reborn.icon'] || '',
          env: parsedEnv,
          ports: parsedPorts,
          volumes: parsedVolumes,
          restartPolicy: info?.HostConfig?.RestartPolicy?.Name || 'unless-stopped',
          pidMode: info?.HostConfig?.PidMode || '',
          privileged: !!info?.HostConfig?.Privileged,
          memory: info?.HostConfig?.Memory ? Math.round(info.HostConfig.Memory / (1024 * 1024)) : 0,
          webUI: {
            scheme: labels['casaos.reborn.web.scheme'] || 'http://',
            port: labels['casaos.reborn.web.port'] || '',
            path: labels['casaos.reborn.web.path'] || '/'
          }
        });
      } catch (err) {
        console.error(err);
        showAlert('Errore di Caricamento', 'Failed to load container details', true);
        onClose();
      } finally {
        setLoading(false);
      }
    };
    fetchInspect();
  }, [containerId, containerOverrides]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      
      const payload = {
        image: data.image,
        tag: data.tag || 'latest',
        name: data.name,
        displayName: data.displayName,
        icon: data.icon,
        restartPolicy: data.restartPolicy,
        pidMode: data.pidMode,
        privileged: data.privileged,
        memory: data.memory ? parseInt(data.memory) * 1024 * 1024 : 0,
        webUI: data.webUI,
        env: data.env.filter(e => e.key).map(e => `${e.key}=${e.value}`),
        ports: {},
        volumes: data.volumes.filter(v => v.hostPath && v.containerPath).map(v => `${v.hostPath}:${v.containerPath}`)
      };

      data.ports.forEach(p => {
        if (p.containerPort) {
          const key = `${p.containerPort}/${p.protocol}`;
          payload.ports[key] = [{ HostPort: p.hostPort }];
        }
      });

      if (onUpdateOverride) {
        onUpdateOverride(data.name, {
          displayName: data.displayName,
          icon: data.icon
        });
      }

      const res = await axios.post(`/api/docker/containers/${containerId}/recreate`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.status === 202 || res.status === 200) {
        onSaved();
      }
    } catch (err) {
      console.error(err);
      showAlert('Errore Salvataggio', 'Failed to save container: ' + (err.response?.data?.error || err.message), true);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await showConfirm('Elimina Container', 'Sei sicuro di voler eliminare questo container? Questa azione è irreversibile.');
    if (!confirmed) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/docker/containers/${containerId}/delete`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onSaved();
    } catch (err) {
      console.error(err);
      showAlert('Errore Eliminazione', 'Failed to delete container: ' + (err.response?.data?.error || err.message), true);
      setSaving(false);
    }
  };

  const handleExportYaml = () => {
    const service = {
      image: data.tag ? `${data.image}:${data.tag}` : data.image,
      container_name: data.name,
      restart: data.restartPolicy,
    };
    
    if (data.privileged) service.privileged = true;
    if (data.pidMode) service.pid = data.pidMode;
    
    const validPorts = data.ports.filter(p => p.hostPort && p.containerPort);
    if (validPorts.length > 0) {
      service.ports = validPorts.map(p => {
        let proto = p.protocol === 'tcp' ? '' : `/${p.protocol}`;
        return `${p.hostPort}:${p.containerPort}${proto}`;
      });
    }

    const validVolumes = data.volumes.filter(v => v.hostPath && v.containerPath);
    if (validVolumes.length > 0) {
      service.volumes = validVolumes.map(v => `${v.hostPath}:${v.containerPath}`);
    }

    const validEnv = data.env.filter(e => e.key);
    if (validEnv.length > 0) {
      service.environment = validEnv.map(e => `${e.key}=${e.value}`);
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
    
    if (Object.keys(xCasaos).length > 0) {
        service['x-casaos'] = xCasaos;
    }

    const compose = {
      version: '3.9',
      services: {
        [data.name || 'app']: service
      }
    };

    const yamlStr = yaml.dump(compose);
    setYamlContent(yamlStr);
    setShowYamlExport(true);
  };

  const downloadYaml = () => {
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.name || 'container'}-compose.yml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyYaml = () => {
    navigator.clipboard.writeText(yamlContent);
    showAlert('Copiato', 'File YAML copiato negli appunti.');
  };

  const updateField = (field, value) => setData(prev => ({ ...prev, [field]: value }));

  const addListItem = (listName, emptyObj) => {
    setData(prev => ({ ...prev, [listName]: [...prev[listName], emptyObj] }));
  };

  const updateListItem = (listName, index, field, value) => {
    setData(prev => {
      const newList = [...prev[listName]];
      newList[index][field] = value;
      return { ...prev, [listName]: newList };
    });
  };

  const removeListItem = (listName, index) => {
    setData(prev => {
      const newList = [...prev[listName]];
      newList.splice(index, 1);
      return { ...prev, [listName]: newList };
    });
  };

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content glass" style={{ width: '400px', textAlign: 'center' }}>
          Loading container details...
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content glass casaos-form" style={{ maxWidth: '800px', width: '95vw' }}>
        {showYamlExport ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>YAML Esportato</h2>
              <button className="btn-icon" onClick={() => setShowYamlExport(false)}><X size={20} /></button>
            </div>
            <div className="form-body" style={{ flex: 1 }}>
              <textarea 
                readOnly 
                value={yamlContent} 
                style={{ width: '100%', height: '300px', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '15px', fontFamily: 'monospace' }}
              />
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              <button className="btn" onClick={() => setShowYamlExport(false)} style={{ background: 'var(--card-bg)' }}>Indietro</button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn" onClick={copyYaml} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                  <Copy size={16} /> Copia
                </button>
                <button className="btn btn-primary" onClick={downloadYaml}>
                  <Download size={16} /> Scarica
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {data.icon ? (
                  <img src={data.icon} alt="" style={{ width: 36, height: 36, borderRadius: '8px', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
            ) : null}
            <h2 style={{ margin: 0 }}>{data.displayName || data.name}</h2>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="form-body">
            {/* Image + Tag */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: '10px' }}>
              <div>
                <label>Immagine Docker *</label>
                <input type="text" className="valid" value={data.image} onChange={e => updateField('image', e.target.value)} placeholder="nginx" />
              </div>
              <div>
                <label>Tag</label>
                <input type="text" className="valid" value={data.tag} onChange={e => updateField('tag', e.target.value)} placeholder="latest" />
              </div>
            </div>

            <div className="form-group">
              <label>Nome del contenitore (Docker) *</label>
              <div className="input-with-icon">
                <input type="text" className="valid" value={data.name} onChange={e => updateField('name', e.target.value)} />
                <Check className="valid-icon" size={16} />
              </div>
            </div>

            <div className="form-group">
              <label>Nome visualizzato nella dashboard (opzionale)</label>
              <input type="text" value={data.displayName} onChange={e => updateField('displayName', e.target.value)} placeholder={data.name || "Nome App"} />
            </div>

            {/* Icon URL */}
            <div className="form-group">
              <label>Icona (URL immagine)</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input type="text" value={data.icon} onChange={e => updateField('icon', e.target.value)} placeholder="https://example.com/icon.png" style={{ flex: 1 }} />
                {data.icon && (
                  <img src={data.icon} alt="" style={{ width: 32, height: 32, borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--card-border)' }} onError={e => { e.target.style.display = 'none'; }} />
                )}
              </div>
            </div>

            <div className="form-group">
              <label>Link Web UI (solo per la dashboard)</label>
              <p style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '8px', marginTop: '-4px' }}>
                Nota: Questo campo serve solo per il link sulla schermata principale. Per esporre fisicamente la porta, aggiungila nella sezione "Porte" sottostante.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', gap: '0', borderRadius: '6px', border: '1px solid var(--card-border)', overflow: 'hidden' }}>
                <select 
                  style={{ border: 'none', borderRight: '1px solid var(--card-border)', borderRadius: 0 }} 
                  value={data.webUI.scheme} 
                  onChange={e => setData(p => ({ ...p, webUI: { ...p.webUI, scheme: e.target.value } }))}
                >
                  <option value="http://">http://</option>
                  <option value="https://">https://</option>
                </select>
                <input 
                  type="text" 
                  list="mapped-ports"
                  placeholder="Porta (auto)" 
                  style={{ border: 'none', borderRight: '1px solid var(--card-border)', borderRadius: 0 }} 
                  value={data.webUI.port} 
                  onChange={e => setData(p => ({ ...p, webUI: { ...p.webUI, port: e.target.value } }))} 
                />
                <datalist id="mapped-ports">
                  {data.ports.filter(p => p.hostPort).map((p, i) => (
                    <option key={i} value={p.hostPort} />
                  ))}
                </datalist>
                <input 
                  type="text" 
                  placeholder="Percorso (es. /)" 
                  style={{ border: 'none', borderRadius: 0 }} 
                  value={data.webUI.path} 
                  onChange={e => setData(p => ({ ...p, webUI: { ...p.webUI, path: e.target.value } }))} 
                />
              </div>
            </div>

            <div className="form-group">
              <div className="section-header">
                <label>Porta</label>
                <button className="btn-pill" onClick={() => addListItem('ports', { hostPort: '', containerPort: '', protocol: 'tcp' })}>
                  <Plus size={14} /> Aggiungi
                </button>
              </div>
              <div className="list-grid ports-grid">
                <span>Host</span><span>Contenitore</span><span>Protocollo</span><span></span>
                {data.ports.map((p, i) => (
                  <React.Fragment key={i}>
                    <input type="text" className="valid" value={p.hostPort} onChange={e => updateListItem('ports', i, 'hostPort', e.target.value)} />
                    <input type="text" className="valid" value={p.containerPort} onChange={e => updateListItem('ports', i, 'containerPort', e.target.value)} />
                    <select value={p.protocol} onChange={e => updateListItem('ports', i, 'protocol', e.target.value)}>
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                    </select>
                    <button className="btn-icon" onClick={() => removeListItem('ports', i)}><X size={16}/></button>
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="form-group">
              <div className="section-header">
                <label>Volume</label>
                <button className="btn-pill" onClick={() => addListItem('volumes', { hostPath: '', containerPath: '' })}>
                  <Plus size={14} /> Aggiungi
                </button>
              </div>
              <div className="list-grid volumes-grid">
                <span>Host</span><span>Contenitore</span><span></span>
                {data.volumes.map((v, i) => (
                  <React.Fragment key={i}>
                    <input type="text" value={v.hostPath} onChange={e => updateListItem('volumes', i, 'hostPath', e.target.value)} />
                    <input type="text" value={v.containerPath} onChange={e => updateListItem('volumes', i, 'containerPath', e.target.value)} />
                    <button className="btn-icon" onClick={() => removeListItem('volumes', i)}><X size={16}/></button>
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="form-group">
              <div className="section-header">
                <label>Variabili d'ambiente</label>
                <button className="btn-pill" onClick={() => addListItem('env', { key: '', value: '' })}>
                  <Plus size={14} /> Aggiungi
                </button>
              </div>
              <div className="list-grid env-grid">
                <span>Chiave</span><span>Valore</span><span></span>
                {data.env.map((env, i) => (
                  <React.Fragment key={i}>
                    <input type="text" value={env.key} onChange={e => updateListItem('env', i, 'key', e.target.value)} />
                    <input type="text" value={env.value} onChange={e => updateListItem('env', i, 'value', e.target.value)} />
                    <button className="btn-icon" onClick={() => removeListItem('env', i)}><X size={16}/></button>
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Privilegi</label>
              <label className="switch">
                <input type="checkbox" checked={data.privileged} onChange={e => updateField('privileged', e.target.checked)} />
                <span className="slider round"></span>
              </label>
            </div>

            <div className="form-group">
              <label>Policy di riavvio</label>
              <select value={data.restartPolicy} onChange={e => updateField('restartPolicy', e.target.value)} style={{ width: '100%', padding: '10px' }}>
                <option value="unless-stopped">unless-stopped</option>
                <option value="always">always</option>
                <option value="on-failure">on-failure</option>
                <option value="no">no</option>
              </select>
            </div>

            <div className="form-group">
              <label>PID Mode</label>
              <input type="text" value={data.pidMode} onChange={e => updateField('pidMode', e.target.value)} placeholder="es. host" list="pid-options-modal" style={{ width: '100%', padding: '10px' }} />
              <datalist id="pid-options-modal">
                <option value="host" />
              </datalist>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--card-border)', margin: '10px 0' }} />
            
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="btn" onClick={handleExportYaml} disabled={saving} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                <Download size={16} /> Esporta YAML
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                Elimina Container
              </button>
            </div>

          </div>
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn" onClick={onClose} disabled={saving} style={{ background: 'var(--card-bg)' }}>Annulla</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvataggio...' : 'Salva e Ricrea'}
              </button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
