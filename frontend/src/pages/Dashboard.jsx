import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, Cpu, HardDrive, MemoryStick, Play, Square, RotateCw, Trash2, Settings, Loader } from 'lucide-react';
import ContainerSettingsModal from '../components/ContainerSettingsModal';
import { io } from 'socket.io-client';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingContainerId, setEditingContainerId] = useState(null);
  const [selfUpdating, setSelfUpdating] = useState(false);
  const [recreating, setRecreating] = useState({});

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/system/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(res.data);
    } catch (err) {
      console.error(err);
    }
  };

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
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const socket = io({
      auth: { type: 'ui', token }
    });
    
    socket.on('container.recreate.progress', (data) => {
      setRecreating(prev => ({ ...prev, [data.id]: data }));
      if (data.status === 'Rebooting system...') {
        setSelfUpdating(true);
      }
    });

    socket.on('container.update.progress', (data) => {
      setRecreating(prev => ({ ...prev, [data.id]: data }));
    });

    const handleSuccess = (data) => {
      setRecreating(prev => {
        const p = { ...prev };
        delete p[data.oldId];
        return p;
      });
      fetchContainers();
    };

    socket.on('container.recreate.success', handleSuccess);
    socket.on('container.update.success', handleSuccess);

    socket.on('container.recreate.error', (data) => {
      setRecreating(prev => {
        const p = { ...prev };
        delete p[data.id];
        return p;
      });
      alert('Error recreating container: ' + data.error);
    });

    socket.on('disconnect', () => {
      if (selfUpdating) {
        startHealthPolling();
      }
    });

    socket.on('connect', () => {
      fetchContainers();
    });

    return () => socket.disconnect();
  }, [selfUpdating]);

  const startHealthPolling = () => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await axios.get('/api/health', { timeout: 3000 });
        if (res.data?.status === 'ok') {
          clearInterval(pollInterval);
          window.location.reload();
        }
      } catch (e) {
      }
    }, 2000);
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
    const labels = container.Labels || {};
    const port = labels['casaos.reborn.web.port'];
    if (port) {
      const scheme = labels['casaos.reborn.web.scheme'] || 'http://';
      const path = labels['casaos.reborn.web.path'] || '/';
      return `${scheme}${window.location.hostname}:${port}${path}`;
    }
    if (!container.Ports) return null;
    const publicPortInfo = container.Ports.find(p => p.PublicPort);
    if (publicPortInfo) {
      return `http://${window.location.hostname}:${publicPortInfo.PublicPort}/`;
    }
    return null;
  };

  const runningContainers = containers.filter(c => c.State === 'running').length;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Buonanotte';
    if (hour < 12) return 'Buongiorno';
    if (hour < 18) return 'Buon pomeriggio';
    return 'Buonasera';
  };

  return (
    <div>
      <h1 style={{ marginBottom: '20px' }}>{getGreeting()}!</h1>

      {selfUpdating && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          zIndex: 2000, color: 'white'
        }}>
          <Loader className="spin" size={48} style={{ marginBottom: '20px' }} />
          <h2 style={{ margin: '0 0 8px 0' }}>Sistema in aggiornamento</h2>
          <p style={{ opacity: 0.7 }}>Riconnessione in corso...</p>
        </div>
      )}

      {/* Widgets (Horizontally scrollable) */}
      {!stats ? (
        <p>Loading system statistics...</p>
      ) : (
        <div className="widgets-row">
          <div className="glass widget" style={{ minWidth: '250px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
              <Cpu /> <span>CPU Usage ({stats.cpu.cores} Cores)</span>
            </div>
            <div className="value">{stats.cpu.load}%</div>
            <progress value={stats.cpu.load} max="100" style={{ width: '100%' }}></progress>
          </div>

          <div className="glass widget" style={{ minWidth: '250px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
              <MemoryStick /> <span>RAM Usage</span>
            </div>
            <div className="value">{stats.memory.percent}%</div>
            <progress value={stats.memory.percent} max="100" style={{ width: '100%' }}></progress>
            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
              {(stats.memory.used / 1024 / 1024 / 1024).toFixed(1)} GB / {(stats.memory.total / 1024 / 1024 / 1024).toFixed(1)} GB
            </div>
          </div>

          <div className="glass widget" style={{ minWidth: '250px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
              <HardDrive /> <span>Primary Disk Usage</span>
            </div>
            <div className="value">{stats.disk.percent}%</div>
            <progress value={stats.disk.percent} max="100" style={{ width: '100%' }}></progress>
            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
              {(stats.disk.used / 1024 / 1024 / 1024).toFixed(1)} GB / {(stats.disk.total / 1024 / 1024 / 1024).toFixed(1)} GB
            </div>
          </div>

          <div className="glass widget" style={{ minWidth: '250px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
              <Activity /> <span>Active Containers</span>
            </div>
            <div className="value">{runningContainers} <span style={{fontSize: '1rem', color: 'var(--text-color)', fontWeight: 'normal'}}>out of {containers.length}</span></div>
            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>OS: {stats.os.distro} {stats.os.release}</div>
          </div>
        </div>
      )}

      <h2 style={{ marginTop: '30px', marginBottom: '20px' }}>I tuoi Container</h2>

      {/* Containers List */}
      {loading ? (
        <p>Loading containers...</p>
      ) : (
        <div className="grid grid-cols-2">
          {containers.map(c => {
            const webUrl = getWebUrl(c);
            const isClickable = webUrl && c.State === 'running';
            const progressData = recreating[c.Id];
            
            let progressPercent = 0;
            if (progressData?.progressDetail?.total) {
              progressPercent = (progressData.progressDetail.current / progressData.progressDetail.total) * 100;
            }

            return (
            <div key={c.Id} className="glass" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', position: 'relative', overflow: 'hidden' }}>
              
              {progressData && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  backdropFilter: 'blur(3px)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                  zIndex: 10, padding: '20px', color: 'white'
                }}>
                  <Loader className="spin" size={32} style={{ marginBottom: '10px' }} />
                  <h4 style={{ margin: '0 0 10px 0' }}>{progressData.status}</h4>
                  {progressData.progressDetail?.total && (
                    <div style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '10px', height: '10px', overflow: 'hidden' }}>
                      <div style={{ width: `${progressPercent}%`, backgroundColor: 'var(--primary)', height: '100%', transition: 'width 0.2s' }}></div>
                    </div>
                  )}
                </div>
              )}

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

          {Object.entries(recreating)
            .filter(([recreId]) => !containers.some(c => c.Id === recreId))
            .map(([recreId, progressData]) => {
              let progressPercent = 0;
              if (progressData?.progressDetail?.total) {
                progressPercent = (progressData.progressDetail.current / progressData.progressDetail.total) * 100;
              }
              return (
                <div key={recreId} className="glass" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                    zIndex: 10, padding: '20px', color: 'white'
                  }}>
                    <Loader className="spin" size={32} style={{ marginBottom: '10px' }} />
                    <h4 style={{ margin: '0 0 10px 0' }}>{progressData.status}</h4>
                    {progressData.progressDetail?.total && (
                      <div style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '10px', height: '10px', overflow: 'hidden' }}>
                        <div style={{ width: `${progressPercent}%`, backgroundColor: 'var(--primary)', height: '100%', transition: 'width 0.2s' }}></div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>{progressData.name || 'Recreating...'}</h3>
                    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: '#f59e0b', color: 'white' }}>
                      recreating
                    </span>
                  </div>
                  <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                    <strong>Image:</strong> {progressData.image || '...'}
                  </div>
                  <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                    <strong>Status:</strong> Recreating...
                  </div>
                </div>
              );
            })}

          {containers.length === 0 && Object.keys(recreating).length === 0 && <p>No containers found.</p>}
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
