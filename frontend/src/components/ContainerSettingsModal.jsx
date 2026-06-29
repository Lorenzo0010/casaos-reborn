import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Plus, Check } from 'lucide-react';

export default function ContainerSettingsModal({ containerId, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({
    image: '',
    name: '',
    env: [],
    ports: [],
    volumes: [],
    restartPolicy: 'unless-stopped',
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

        const parsedVolumes = (info?.HostConfig?.Binds || []).map(b => {
          const parts = b.split(':');
          return { hostPath: parts[0] || '', containerPath: parts[1] || '' };
        });

        const labels = info?.Config?.Labels || {};
        setData({
          image: info?.Config?.Image || '',
          name: (info?.Name || '').replace('/', ''),
          env: parsedEnv,
          ports: parsedPorts,
          volumes: parsedVolumes,
          restartPolicy: info?.HostConfig?.RestartPolicy?.Name || 'unless-stopped',
          privileged: !!info?.HostConfig?.Privileged,
          memory: info?.HostConfig?.Memory || 0,
          webUI: {
            scheme: labels['casaos.reborn.web.scheme'] || 'http://',
            port: labels['casaos.reborn.web.port'] || '',
            path: labels['casaos.reborn.web.path'] || '/'
          }
        });
      } catch (err) {
        console.error(err);
        alert('Failed to load container details');
        onClose();
      } finally {
        setLoading(false);
      }
    };
    fetchInspect();
  }, [containerId, onClose]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      
      const payload = {
        image: data.image,
        name: data.name,
        restartPolicy: data.restartPolicy,
        privileged: data.privileged,
        memory: data.memory ? parseInt(data.memory) * 1024 * 1024 : 0,
        webUI: data.webUI,
        env: data.env.map(e => `${e.key}=${e.value}`),
        ports: {},
        volumes: data.volumes.map(v => `${v.hostPath}:${v.containerPath}`)
      };

      data.ports.forEach(p => {
        const key = `${p.containerPort}/${p.protocol}`;
        payload.ports[key] = [{ HostPort: p.hostPort }];
      });

      const res = await axios.post(`/api/docker/containers/${containerId}/recreate`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.status === 202 || res.status === 200) {
        onSaved();
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save container: ' + (err.response?.data?.error || err.message));
      setSaving(false);
    }
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
      <div className="modal-content glass casaos-form">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>{data.name}</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="form-body">
            <div className="form-group row">
              <div style={{ flex: 1 }}>
                <label>Immagine Docker *</label>
                <input type="text" className="valid" value={data.image} onChange={e => updateField('image', e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label>Nome del contenitore *</label>
              <div className="input-with-icon">
                <input type="text" className="valid" value={data.name} onChange={e => updateField('name', e.target.value)} />
                <Check className="valid-icon" size={16} />
              </div>
            </div>

            <div className="form-group">
              <label>Web UI</label>
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
                  placeholder="Porta (es. 8080)" 
                  style={{ border: 'none', borderRight: '1px solid var(--card-border)', borderRadius: 0 }} 
                  value={data.webUI.port} 
                  onChange={e => setData(p => ({ ...p, webUI: { ...p.webUI, port: e.target.value } }))} 
                />
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

          </div>
        
        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button className="btn" onClick={onClose} disabled={saving}>Annulla</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>Salva e Ricrea</button>
        </div>
      </div>
    </div>
  );
}
