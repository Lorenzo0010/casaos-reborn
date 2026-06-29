import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Play, Square, RotateCw, Trash2, Settings, ExternalLink } from 'lucide-react';
import ContainerSettingsModal from '../components/ContainerSettingsModal';

export default function Containers() {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingContainerId, setEditingContainerId] = useState(null);

  const fetchContainers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/docker/containers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setContainers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContainers();
    const interval = setInterval(() => {
      if (!editingContainerId) {
        fetchContainers();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [editingContainerId]);

  const handleAction = async (id, action) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/docker/containers/${id}/${action}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchContainers();
    } catch (err) {
      alert(`Error performing ${action}: ` + err.message);
    }
  };

  const getWebUrl = (container) => {
    // 1. Try to use custom Web UI labels first
    const labels = container.Labels || {};
    const port = labels['casaos.reborn.web.port'];
    if (port) {
      const scheme = labels['casaos.reborn.web.scheme'] || 'http://';
      const path = labels['casaos.reborn.web.path'] || '/';
      return `${scheme}${window.location.hostname}:${port}${path}`;
    }

    // 2. Fallback to first available public port
    if (!container.Ports) return null;
    const publicPortInfo = container.Ports.find(p => p.PublicPort);
    if (publicPortInfo) {
      return `http://${window.location.hostname}:${publicPortInfo.PublicPort}/`;
    }
    return null;
  };

  return (
    <div>
      <h1>Containers</h1>
      
      {loading ? (
        <p>Loading containers...</p>
      ) : (
        <div className="grid grid-cols-2">
          {containers.map(c => {
            const webUrl = getWebUrl(c);
            const isClickable = webUrl && c.State === 'running';

            return (
            <div key={c.Id} className="glass" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                
                {isClickable ? (
                  <a href={webUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }} title="Apri Web UI">
                    <h3 style={{ margin: 0, cursor: 'pointer', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = 'var(--primary)'} onMouseOut={e => e.target.style.color = 'inherit'}>
                      {c.Names[0].replace('/', '')}
                    </h3>
                  </a>
                ) : (
                  <h3 style={{ margin: 0 }}>
                    {c.Names[0].replace('/', '')}
                  </h3>
                )}

                <span style={{
                  padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem',
                  backgroundColor: c.State === 'running' ? 'var(--success)' : 'var(--danger)',
                  color: 'white'
                }}>
                  {c.State}
                </span>
              </div>
              
              <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                <strong>Image:</strong> {c.Image}
              </div>
              <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                <strong>Status:</strong> {c.Status}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                {c.State !== 'running' ? (
                  <button onClick={() => handleAction(c.Id, 'start')} className="btn btn-success" title="Start">
                    <Play size={16} />
                  </button>
                ) : (
                  <>
                    <button onClick={() => handleAction(c.Id, 'stop')} className="btn" style={{ background: '#f59e0b', color: 'white' }} title="Stop">
                      <Square size={16} />
                    </button>
                    <button onClick={() => handleAction(c.Id, 'restart')} className="btn btn-primary" title="Restart">
                      <RotateCw size={16} />
                    </button>
                  </>
                )}
                <button onClick={() => setEditingContainerId(c.Id)} className="btn" style={{ background: 'var(--bg-color)', color: 'var(--text-color)', marginLeft: 'auto' }} title="Settings">
                  <Settings size={16} />
                </button>
                <button onClick={() => {
                  if (window.confirm('Are you sure you want to delete this container?')) handleAction(c.Id, 'delete');
                }} className="btn btn-danger" title="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )})}
          {containers.length === 0 && <p>No containers found.</p>}
        </div>
      )}

      {editingContainerId && (
        <ContainerSettingsModal 
          containerId={editingContainerId} 
          onClose={() => setEditingContainerId(null)}
          onSaved={() => {
            setEditingContainerId(null);
            fetchContainers();
          }}
        />
      )}
    </div>
  );
}
