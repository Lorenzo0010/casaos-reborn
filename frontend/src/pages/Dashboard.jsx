import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, Cpu, HardDrive, MemoryStick, Play, Square, RotateCw, Trash2, Settings, Loader, Pin, GripHorizontal, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Edit, GripVertical, Check, FileText, Globe, ArrowDown, ArrowUp } from 'lucide-react';
import ContainerSettingsModal from '../components/ContainerSettingsModal';
import LogsModal from '../components/LogsModal';
import { io } from 'socket.io-client';
import { useDialog } from '../contexts/DialogContext';

export default function Dashboard() {
  const { showAlert, showConfirm } = useDialog();
  const [stats, setStats] = useState(null);
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingContainerId, setEditingContainerId] = useState(null);
  const [logsContainer, setLogsContainer] = useState(null);
  const [selfUpdating, setSelfUpdating] = useState(false);
  const selfUpdatingRef = React.useRef(false);
  const [recreating, setRecreating] = useState({});

  // Layout preferences state
  const [sortMode, setSortMode] = useState('date');
  const [pinnedContainers, setPinnedContainers] = useState([]);
  const [customOrder, setCustomOrder] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [draggedItem, setDraggedItem] = useState(null);
  const [widgetsOrder, setWidgetsOrder] = useState(['cpu', 'ram', 'disk', 'containers', 'network']);
  const [draggedWidget, setDraggedWidget] = useState(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Load preferences from server on mount
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    
    const loadPrefs = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/system/preferences', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.data.sortMode) setSortMode(res.data.sortMode);
        if (Array.isArray(res.data.pinnedContainers)) setPinnedContainers(res.data.pinnedContainers);
        if (Array.isArray(res.data.customOrder)) setCustomOrder(res.data.customOrder);
        if (Array.isArray(res.data.widgetsOrder) && res.data.widgetsOrder.length > 0) setWidgetsOrder(res.data.widgetsOrder);
      } catch (e) {
        console.error('Error loading preferences from server', e);
      } finally {
        setPrefsLoaded(true);
      }
    };
    loadPrefs();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Save preferences when they change
  useEffect(() => {
    if (!prefsLoaded) return;
    
    const savePrefs = async () => {
      try {
        const token = localStorage.getItem('token');
        await axios.post('/api/system/preferences', {
          sortMode,
          pinnedContainers,
          customOrder,
          widgetsOrder
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) {
        console.error('Error saving preferences to server', e);
      }
    };
    
    // Basic debounce to avoid too many requests while dragging
    const timeout = setTimeout(savePrefs, 500);
    return () => clearTimeout(timeout);
  }, [sortMode, pinnedContainers, customOrder, widgetsOrder, prefsLoaded]);

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
        selfUpdatingRef.current = true;
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
      showAlert('Errore Creazione', 'Error recreating container: ' + data.error, true);
    });

    socket.on('container.recreate.rollback', (data) => {
      setRecreating(prev => {
        const p = { ...prev };
        delete p[data.oldId];
        return p;
      });
      fetchContainers();
      showAlert('Rollback Automatico Eseguito', `Errore durante la creazione del container. È stato eseguito un rollback automatico al container precedente.\n\nErrore originale: ${data.error}`, true);
    });

    socket.on('disconnect', () => {
      if (selfUpdatingRef.current) {
        startHealthPolling();
      }
    });

    socket.on('connect', () => {
      fetchContainers();
    });

    return () => socket.disconnect();
  }, []);

  const startHealthPolling = () => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await axios.get('/api/health', { timeout: 3000 });
        if (res.status === 200 || res.data?.status === 'ok') {
          clearInterval(pollInterval);
          window.location.reload();
        }
      } catch (e) {
        // Se c'è una risposta (es. 404 perché l'immagine è vecchia e non ha l'endpoint),
        // significa comunque che il server è tornato online!
        if (e.response) {
          clearInterval(pollInterval);
          window.location.reload();
        }
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
      showAlert('Errore', `Error performing ${action}: ` + err.message, true);
    }
  };

  const handlePruneImages = async () => {
    const confirmed = await showConfirm('Pulizia Immagini', 'Sei sicuro di voler eliminare tutte le immagini Docker non utilizzate da alcun container?');
    if (!confirmed) return;
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/docker/images/prune`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const deletedSpace = (res.data.result?.SpaceReclaimed || 0) / 1024 / 1024;
      showAlert('Pulizia Completata', `Spazio liberato: ${deletedSpace.toFixed(2)} MB`);
    } catch (err) {
      showAlert('Errore', `Errore durante la pulizia delle immagini: ` + err.message, true);
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

  const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec || bytesPerSec === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getContainerIcon = (container) => {
    const labels = container.Labels || {};
    const iconUrl = labels['casaos.reborn.icon'];
    if (iconUrl) return iconUrl;
    
    const name = (container.Names?.[0] || container.name || 'Unknown').replace('/', '');
    const initial = name.charAt(0).toUpperCase();
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = `hsl(${Math.abs(hash) % 360}, 60%, 50%)`;
    
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${color}"/><text x="50%" y="50%" font-family="sans-serif" font-size="40" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${initial}</text></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  };

  const runningContainers = containers.filter(c => c.State === 'running').length;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Buonanotte';
    if (hour < 12) return 'Buongiorno';
    if (hour < 18) return 'Buon pomeriggio';
    return 'Buonasera';
  };

  const sortedContainers = React.useMemo(() => {
    let sorted = [...containers];
    
    if (sortMode === 'alphabetical') {
      sorted.sort((a, b) => {
        const nameA = a.Labels?.['casaos.reborn.name'] || a.Names[0].replace('/', '');
        const nameB = b.Labels?.['casaos.reborn.name'] || b.Names[0].replace('/', '');
        return nameA.localeCompare(nameB);
      });
    } else if (sortMode === 'date') {
      sorted.sort((a, b) => b.Created - a.Created);
    } else if (sortMode === 'custom') {
      sorted.sort((a, b) => {
        const nameA = a.Names ? a.Names[0].replace('/', '') : a.Id;
        const nameB = b.Names ? b.Names[0].replace('/', '') : b.Id;
        let indexA = customOrder.indexOf(nameA);
        let indexB = customOrder.indexOf(nameB);
        if (indexA === -1) indexA = 99999;
        if (indexB === -1) indexB = 99999;
        return indexA - indexB;
      });
    }

    const pinned = [];
    const unpinned = [];
    sorted.forEach(c => {
      const stableId = c.Names ? c.Names[0].replace('/', '') : c.Id;
      if (pinnedContainers.includes(stableId)) {
        pinned.push(c);
      } else {
        unpinned.push(c);
      }
    });

    return [...pinned, ...unpinned];
  }, [containers, sortMode, pinnedContainers, customOrder]);

  const togglePin = (id) => {
    if (pinnedContainers.includes(id)) {
      setPinnedContainers(pinnedContainers.filter(p => p !== id));
    } else {
      setPinnedContainers([...pinnedContainers, id]);
    }
  };

  const moveCustom = (id, direction) => {
    const newOrder = [...customOrder];
    
    // Ensure all containers are in customOrder
    containers.forEach(c => {
      const stableId = c.Names ? c.Names[0].replace('/', '') : c.Id;
      if (!newOrder.includes(stableId)) newOrder.push(stableId);
    });

    const index = newOrder.indexOf(id);
    if (index === -1) return;

    if (direction === -1 && index > 0) {
      const temp = newOrder[index - 1];
      newOrder[index - 1] = newOrder[index];
      newOrder[index] = temp;
    } else if (direction === 1 && index < newOrder.length - 1) {
      const temp = newOrder[index + 1];
      newOrder[index + 1] = newOrder[index];
      newOrder[index] = temp;
    }
    setCustomOrder(newOrder);
  };

  const handleDragStart = (e, id) => {
    if (!editMode) return;
    setDraggedItem(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    if (!editMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (!editMode || !draggedItem || draggedItem === targetId) return;

    let newOrder = [...customOrder];
    containers.forEach(c => {
      const stableId = c.Names ? c.Names[0].replace('/', '') : c.Id;
      if (!newOrder.includes(stableId)) newOrder.push(stableId);
    });

    const draggedIndex = newOrder.indexOf(draggedItem);
    const targetIndex = newOrder.indexOf(targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedItem);
      setCustomOrder(newOrder);
    }
    setDraggedItem(null);
  };

  const handleWidgetDragStart = (e, id) => {
    if (!editMode) return;
    setDraggedWidget(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleWidgetDrop = (e, targetId) => {
    e.preventDefault();
    if (!editMode || !draggedWidget || draggedWidget === targetId) return;

    let newOrder = [...widgetsOrder];
    // Ensure all known widgets are in the list
    ['cpu', 'ram', 'disk', 'containers', 'network'].forEach(w => {
      if (!newOrder.includes(w)) newOrder.push(w);
    });

    const draggedIndex = newOrder.indexOf(draggedWidget);
    const targetIndex = newOrder.indexOf(targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedWidget);
      setWidgetsOrder(newOrder);
    }
    setDraggedWidget(null);
  };

  const moveWidget = (id, direction) => {
    const newOrder = [...widgetsOrder];
    const index = newOrder.indexOf(id);
    if (index === -1) return;

    if (direction === -1 && index > 0) {
      const temp = newOrder[index - 1];
      newOrder[index - 1] = newOrder[index];
      newOrder[index] = temp;
    } else if (direction === 1 && index < newOrder.length - 1) {
      const temp = newOrder[index + 1];
      newOrder[index + 1] = newOrder[index];
      newOrder[index] = temp;
    }
    setWidgetsOrder(newOrder);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>{getGreeting()}!</h1>
        <button 
          className={`btn-icon ${editMode ? 'active' : ''}`} 
          onClick={() => { setEditMode(!editMode); if (!editMode && sortMode !== 'custom') setSortMode('custom'); }} 
          title="Modifica Layout" 
          style={{ padding: '8px', color: editMode ? 'var(--primary)' : 'var(--text-color)', background: editMode ? 'var(--card-bg)' : 'transparent', border: editMode ? '1px solid var(--primary)' : '1px solid transparent', borderRadius: '8px' }}
        >
          <Edit size={24} />
        </button>
      </div>

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
          {widgetsOrder.map(widgetId => {
            const commonProps = {
              key: widgetId,
              className: `glass widget ${editMode ? 'edit-mode' : ''}`,
              style: { 
                minWidth: '250px', 
                position: 'relative',
                cursor: editMode && !isMobile ? 'grab' : 'default',
                opacity: draggedWidget === widgetId ? 0.5 : 1,
                border: '1px solid var(--card-border)'
              },
              draggable: editMode && !isMobile,
              onDragStart: (e) => handleWidgetDragStart(e, widgetId),
              onDragOver: handleDragOver,
              onDrop: (e) => handleWidgetDrop(e, widgetId)
            };

            const renderEditControls = () => {
              if (!editMode) return null;
              if (isMobile) return null; // Only show drag handle on desktop
              return (
                <div style={{ position: 'absolute', top: '10px', right: '10px', opacity: 0.5 }}>
                  <GripHorizontal size={20} />
                </div>
              );
            };

            const renderMobileControls = () => {
              if (!editMode) return null; // Show on both mobile and desktop
              return (
                <div style={{ display: 'flex', width: '100%', gap: '10px', marginTop: '15px' }}>
                  <button onClick={() => moveWidget(widgetId, -1)} className="btn" style={{ flex: 1, padding: '15px', display: 'flex', justifyContent: 'center', background: 'var(--card-bg)' }}><ChevronLeft size={30} /></button>
                  <button onClick={() => moveWidget(widgetId, 1)} className="btn" style={{ flex: 1, padding: '15px', display: 'flex', justifyContent: 'center', background: 'var(--card-bg)' }}><ChevronRight size={30} /></button>
                </div>
              );
            };

            if (widgetId === 'cpu') {
              return (
                <div {...commonProps}>
                  {renderEditControls()}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
                    <Cpu /> <span>CPU Usage ({stats.cpu.cores} Cores)</span>
                  </div>
                  <div className="value">{stats.cpu.load}%</div>
                  <progress value={stats.cpu.load} max="100" style={{ width: '100%' }}></progress>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                    {stats.cpu.temperature != null ? `${stats.cpu.temperature}°C` : 'Temperatura N/A'}
                  </div>
                  {renderMobileControls()}
                </div>
              );
            }

            if (widgetId === 'ram') {
              return (
                <div {...commonProps}>
                  {renderEditControls()}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
                    <MemoryStick /> <span>RAM Usage</span>
                  </div>
                  <div className="value">{stats.memory.percent}%</div>
                  <progress value={stats.memory.percent} max="100" style={{ width: '100%' }}></progress>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                    {(stats.memory.used / 1024 / 1024 / 1024).toFixed(1)} GB / {(stats.memory.total / 1024 / 1024 / 1024).toFixed(1)} GB
                  </div>
                  {renderMobileControls()}
                </div>
              );
            }

            if (widgetId === 'disk') {
              return (
                <div {...commonProps}>
                  {renderEditControls()}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
                    <HardDrive /> <span>Primary Disk Usage</span>
                  </div>
                  <div className="value">{stats.disk.percent}%</div>
                  <progress value={stats.disk.percent} max="100" style={{ width: '100%' }}></progress>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                    {(stats.disk.used / 1024 / 1024 / 1024).toFixed(1)} GB / {(stats.disk.total / 1024 / 1024 / 1024).toFixed(1)} GB
                  </div>
                  {renderMobileControls()}
                </div>
              );
            }

            if (widgetId === 'containers') {
              return (
                <div {...commonProps}>
                  {renderEditControls()}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
                    <Activity /> <span>Active Containers</span>
                  </div>
                  <div className="value">{runningContainers} <span style={{fontSize: '1rem', color: 'var(--text-color)', fontWeight: 'normal'}}>out of {containers.length}</span></div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>OS: {stats.os.distro} {stats.os.release}</div>
                  {renderMobileControls()}
                </div>
              );
            }

            if (widgetId === 'network') {
              return (
                <div {...commonProps}>
                  {renderEditControls()}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
                    <Globe /> <span>Network</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '0.8rem', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowDown size={14} color="#10b981" /> Download</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{stats.network ? formatSpeed(stats.network.rx_sec) : '0 B/s'}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={{ fontSize: '0.8rem', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowUp size={14} color="#3b82f6" /> Upload</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{stats.network ? formatSpeed(stats.network.tx_sec) : '0 B/s'}</span>
                    </div>
                  </div>
                  {renderMobileControls()}
                </div>
              );
            }

            return null;
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '30px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>I tuoi Container</h2>
        
        {editMode && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select value={sortMode} onChange={e => { setSortMode(e.target.value); if (e.target.value !== 'custom') setEditMode(false); }} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-color)', outline: 'none' }}>
              <option value="date">Data di Creazione</option>
              <option value="alphabetical">Alfabetico</option>
              <option value="custom">Personalizzato</option>
            </select>
          </div>
        )}
      </div>

      {/* Containers List */}
      {loading ? (
        <p>Loading containers...</p>
      ) : (
        <div className="grid grid-cols-cards">
          {sortedContainers.map((c, index) => {
            const webUrl = getWebUrl(c);
            const isClickable = webUrl && c.State === 'running';
            const progressData = recreating[c.Id];
            
            let progressPercent = 0;
            if (progressData?.progressDetail?.total) {
              progressPercent = (progressData.progressDetail.current / progressData.progressDetail.total) * 100;
            }

            const stableId = c.Names ? c.Names[0].replace('/', '') : c.Id;
            const isPinned = pinnedContainers.includes(stableId);

            return (
            <div 
              key={c.Id} 
              className={`glass ${editMode ? 'edit-mode' : ''}`} 
              draggable={editMode && !isMobile}
              onDragStart={(e) => handleDragStart(e, stableId)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stableId)}
              style={{ 
                padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', position: 'relative', overflow: 'hidden',
                cursor: editMode && !isMobile ? 'grab' : 'default',
                opacity: draggedItem === stableId ? 0.5 : 1,
                border: '1px solid var(--card-border)',
                height: '100%'
              }}
            >
              
              {/* Pin Icon */}
              {(editMode || isPinned) && (
                <button 
                  onClick={(e) => { e.stopPropagation(); togglePin(stableId); }}
                  style={{
                    position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none',
                    color: isPinned ? 'var(--primary)' : 'var(--text-color)', opacity: isPinned || editMode ? 1 : 0.2,
                    cursor: editMode ? 'pointer' : 'default', zIndex: 5, padding: '4px',
                    pointerEvents: editMode ? 'auto' : 'none'
                  }}
                  title={isPinned ? 'Pinned' : 'Pin to top'}
                >
                  <Pin size={20} fill={isPinned ? 'currentColor' : 'none'} />
                </button>
              )}

              {progressData && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  backdropFilter: 'blur(3px)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                  zIndex: 10, padding: '20px', color: 'white'
                }}>
                  <Loader className="spin" size={32} style={{ marginBottom: '10px' }} />
                  <h4 style={{ margin: '0 0 10px 0', textAlign: 'center' }}>{progressData.status}</h4>
                  {progressData.progressDetail?.total && (
                    <div style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '10px', height: '10px', overflow: 'hidden' }}>
                      <div style={{ width: `${progressPercent}%`, backgroundColor: 'var(--primary)', height: '100%', transition: 'width 0.2s' }}></div>
                    </div>
                  )}
                </div>
              )}

              {/* LOGO BLOCK (Top Center) */}
              <div style={{ flexShrink: 0 }}>
                {isClickable ? (
                  <a href={webUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'flex' }} title="Apri Web UI">
                    <img src={getContainerIcon(c)} alt="" style={{ width: 80, height: 80, borderRadius: '16px', objectFit: 'cover', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} onError={e => { e.target.style.display = 'none'; }} />
                  </a>
                ) : (
                  <img src={getContainerIcon(c)} alt="" style={{ width: 80, height: 80, borderRadius: '16px', objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} onError={e => { e.target.style.display = 'none'; }} />
                )}
              </div>
              
              {/* CONTENT BLOCK (Middle Center) */}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, alignItems: 'center', textAlign: 'center', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px', width: '100%' }}>
                  {isClickable ? (
                    <a href={webUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', maxWidth: '100%' }} title="Apri Web UI">
                      <h3 style={{ margin: 0, cursor: 'pointer', transition: 'color 0.2s', fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }} onMouseOver={e => e.target.style.color = 'var(--primary)'} onMouseOut={e => e.target.style.color = 'inherit'}>
                        {c.Labels?.['casaos.reborn.name'] || c.Names[0].replace('/', '')}
                      </h3>
                    </a>
                  ) : (
                    <h3 style={{ margin: 0, fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                      {c.Labels?.['casaos.reborn.name'] || c.Names[0].replace('/', '')}
                    </h3>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                  <span className={`status-dot ${c.State === 'running' ? 'running' : 'exited'}`}></span>
                  <span style={{ fontSize: '0.85rem', opacity: 0.7, fontWeight: 500 }}>
                    {c.State === 'running' ? c.Status.replace(/^Up\s/, 'Avviato da ') : c.Status.replace(/^Exited\s\(\d+\)\s/, 'Interrotto da ')}
                  </span>
                </div>
              </div>

              {/* BUTTONS BLOCK (Bottom) */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', flexShrink: 0, width: '100%', marginTop: 'auto' }}>
                {c.State !== 'running' ? (
                  <button onClick={() => handleAction(c.Id, 'start')} className="btn btn-action success" title="Avvia">
                    <Play size={16} />
                  </button>
                ) : (
                  <button onClick={() => handleAction(c.Id, 'stop')} className="btn btn-action danger" title="Arresta">
                    <Square size={16} />
                  </button>
                )}
                <button onClick={() => setLogsContainer({ id: c.Id, name: c.Labels?.['casaos.reborn.name'] || c.Names[0].replace('/', '') })} className="btn btn-action neutral" title="Log">
                  <FileText size={16} />
                </button>
                <button onClick={() => setEditingContainerId(c.Id)} className="btn btn-action neutral" title="Impostazioni">
                  <Settings size={16} />
                </button>

                {editMode && (
                  <>
                    <div style={{ width: '2px', height: '24px', backgroundColor: 'var(--card-border)', margin: '0 5px' }} />
                    <button onClick={() => moveCustom(c.Id, -1)} className="btn btn-action neutral" title="Sposta Su">
                      <ChevronUp size={16} />
                    </button>
                    <button onClick={() => moveCustom(c.Id, 1)} className="btn btn-action neutral" title="Sposta Giù">
                      <ChevronDown size={16} />
                    </button>
                    {!isMobile && (
                      <div style={{ display: 'flex', alignItems: 'center', opacity: 0.5, cursor: 'grab', marginLeft: '5px' }} title="Trascina per riordinare">
                        <GripHorizontal size={20} />
                      </div>
                    )}
                  </>
                )}
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
                <div key={recreId} className="glass" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', position: 'relative', overflow: 'hidden', height: '100%' }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                    zIndex: 10, padding: '20px', color: 'white'
                  }}>
                    <Loader className="spin" size={32} style={{ marginBottom: '10px' }} />
                    <h4 style={{ margin: '0 0 10px 0', textAlign: 'center' }}>{progressData.status}</h4>
                    {progressData.progressDetail?.total && (
                      <div style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '10px', height: '10px', overflow: 'hidden' }}>
                        <div style={{ width: `${progressPercent}%`, backgroundColor: 'var(--primary)', height: '100%', transition: 'width 0.2s' }}></div>
                      </div>
                    )}
                  </div>
                  
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ width: 80, height: 80, borderRadius: '16px', backgroundColor: 'var(--card-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, alignItems: 'center', textAlign: 'center', width: '100%' }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                      {progressData.name || 'Recreating...'}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                      <span className="status-dot recreating"></span>
                      <span style={{ fontSize: '0.85rem', opacity: 0.7, fontWeight: 500 }}>
                        Aggiornamento in corso...
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', flexShrink: 0, width: '100%', marginTop: 'auto' }}>
                    <button className="btn btn-action neutral" style={{ opacity: 0.5, cursor: 'not-allowed' }} disabled><Loader size={16} className="spin" /></button>
                  </div>
                </div>
              );
            })}

          {containers.length === 0 && Object.keys(recreating).length === 0 && <p>No containers found.</p>}
        </div>
      )}

      <div style={{ marginTop: '40px', padding: '20px', borderTop: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--card-bg)', borderRadius: '12px' }}>
        <div>
          <h3 style={{ margin: '0 0 5px 0' }}>Manutenzione Docker</h3>
          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.9rem' }}>Rimuovi le immagini docker non collegate ad alcun container per liberare spazio su disco.</p>
        </div>
        <button className="btn btn-danger" onClick={handlePruneImages}>
          <Trash2 size={16} style={{ marginRight: '8px' }} />
          Pulisci Immagini
        </button>
      </div>

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

      {logsContainer && (
        <LogsModal 
          containerId={logsContainer.id}
          containerName={logsContainer.name}
          onClose={() => setLogsContainer(null)} 
        />
      )}
    </div>
  );
}
