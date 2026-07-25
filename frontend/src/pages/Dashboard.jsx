import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Play, Square, CheckSquare, Settings, Loader, Pin, GripHorizontal, ChevronUp, ChevronDown, Edit, Check, FileText, PlusCircle, Menu, Github } from 'lucide-react';
import { Link } from 'react-router-dom';
import ContainerSettingsModal from '../components/ContainerSettingsModal';
import LogsModal from '../components/LogsModal';
import WidgetsPanel from '../components/WidgetsPanel';
import { io } from 'socket.io-client';
import { useDialog } from '../contexts/DialogContext';

export default function Dashboard({ togglePanel, activePanel }) {
  const { showAlert } = useDialog();
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
  const [containerOverrides, setContainerOverrides] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [draggedItem, setDraggedItem] = useState(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [showSystemContainers, setShowSystemContainers] = useState(false);
  const [widgetsOrder, setWidgetsOrder] = useState(['cpu', 'ram', 'storage', 'network', 'system']);

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
        if (res.data.containerOverrides) setContainerOverrides(res.data.containerOverrides);
        if (res.data.showSystemContainers !== undefined) setShowSystemContainers(res.data.showSystemContainers);
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
          containerOverrides,
          showSystemContainers,
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
  }, [sortMode, pinnedContainers, customOrder, containerOverrides, showSystemContainers, widgetsOrder, prefsLoaded]);

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
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const socket = io({
      auth: { type: 'ui', token }
    });

    // Recreate progress: key by container ID
    socket.on('container.recreate.progress', (data) => {
      setRecreating(prev => ({ ...prev, [data.id]: data }));
      if (data.status === 'Rebooting system...') {
        selfUpdatingRef.current = true;
        setSelfUpdating(true);
      }
    });

    // Update progress: key by container ID
    socket.on('container.update.progress', (data) => {
      setRecreating(prev => ({ ...prev, [data.id]: data }));
    });

    // Create progress: key by taskId (no existing container)
    socket.on('container.create.progress', (data) => {
      if (data.taskId) {
        setRecreating(prev => ({ ...prev, [data.taskId]: data }));
      }
    });

    // Ascolto lista container via WebSocket
    socket.on('docker.containers', (data) => {
      setContainers(data);
    });

    // Success: clean up by both oldId and taskId to ensure no phantoms
    const handleSuccess = (data) => {
      setRecreating(prev => {
        const p = { ...prev };
        if (data.oldId) delete p[data.oldId];
        if (data.taskId) delete p[data.taskId];
        if (data.id) delete p[data.id];
        return p;
      });
      fetchContainers();
    };

    socket.on('container.recreate.success', handleSuccess);
    socket.on('container.update.success', handleSuccess);
    socket.on('container.create.success', handleSuccess);

    // Error: clean up by both id and taskId
    socket.on('container.recreate.error', (data) => {
      setRecreating(prev => {
        const p = { ...prev };
        if (data.id) delete p[data.id];
        if (data.taskId) delete p[data.taskId];
        return p;
      });
      showAlert('Errore Ricreazione', 'Error recreating container: ' + data.error, true);
    });

    socket.on('container.create.error', (data) => {
      setRecreating(prev => {
        const p = { ...prev };
        if (data.taskId) delete p[data.taskId];
        return p;
      });
      showAlert('Errore Creazione', 'Error creating container: ' + data.error, true);
    });

    socket.on('container.recreate.rollback', (data) => {
      setRecreating(prev => {
        const p = { ...prev };
        if (data.oldId) delete p[data.oldId];
        if (data.taskId) delete p[data.taskId];
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
    // Il polling è stato rimosso, i container si aggiornano tramite WebSocket (docker.containers)
  }, []);

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



  const getWebUrl = (container) => {
    const labels = container.Labels || {};
    const port = labels['casaos.reborn.web.port'];
    if (port) {
      let scheme = labels['casaos.reborn.web.scheme'] || 'http';
      // Normalize: ensure scheme always has ://
      if (!scheme.includes('://')) scheme = scheme + '://';
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



  const getContainerName = (container) => {
    const stableId = container.Names ? container.Names[0].replace('/', '') : container.Id;
    if (containerOverrides[stableId] && containerOverrides[stableId].displayName) return containerOverrides[stableId].displayName;
    return container.Labels?.['casaos.reborn.name'] || stableId;
  };

  const getContainerIcon = (container) => {
    const stableId = container.Names ? container.Names[0].replace('/', '') : container.Id;
    if (containerOverrides[stableId] && containerOverrides[stableId].icon) return containerOverrides[stableId].icon;

    const labels = container.Labels || {};
    const iconUrl = labels['casaos.reborn.icon'];
    if (iconUrl) return iconUrl;

    const name = stableId;
    const initial = name.charAt(0).toUpperCase();

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = `hsl(${Math.abs(hash) % 360}, 60%, 50%)`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${color}"/><text x="50%" y="50%" font-family="sans-serif" font-size="40" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${initial}</text></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  };



  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Buonanotte';
    if (hour < 12) return 'Buongiorno';
    if (hour < 18) return 'Buon pomeriggio';
    return 'Buonasera';
  };

  const sortedContainers = React.useMemo(() => {
    let sorted = [...containers];

    if (!showSystemContainers) {
      sorted = sorted.filter(c => {
        const name = c.Names ? c.Names[0].replace('/', '') : c.Id;
        return name !== 'casaos-reborn' && name !== 'casaos-updater';
      });
    }

    if (sortMode === 'alphabetical') {
      sorted.sort((a, b) => {
        const nameA = getContainerName(a);
        const nameB = getContainerName(b);
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
    } else if (sortMode === 'status') {
      sorted.sort((a, b) => {
        const isRunningA = a.State === 'running' ? 1 : 0;
        const isRunningB = b.State === 'running' ? 1 : 0;
        if (isRunningA !== isRunningB) {
          return isRunningB - isRunningA; // Running first (1 comes before 0)
        }
        // Fallback to alphabetical if same state
        const nameA = getContainerName(a);
        const nameB = getContainerName(b);
        return nameA.localeCompare(nameB);
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
  }, [containers, sortMode, pinnedContainers, customOrder, showSystemContainers]);

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
    if (sortMode !== 'custom') setSortMode('custom');
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
      if (sortMode !== 'custom') setSortMode('custom');
    }
    setDraggedItem(null);
  };


  return (
    <div className="flex-col h-full" style={{ minWidth: 0, overflowY: 'auto' }}>
      <div className="page-header" style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: 'var(--bg-color)',
        padding: '0 0 0 0',
        margin: '0 0 20px 0',
        borderBottom: '1px solid transparent',
        boxShadow: '0 4px 20px -10px var(--bg-color)'
      }}>

        <div className="flex items-center gap-2">
          <button
            onClick={() => togglePanel('menu')}
            className="btn-icon-only"
            title="Menu"
          >
            <Menu size={24} />
          </button>
        </div>

        <h1 className="m-0 text-center font-bold" style={{ fontSize: 'clamp(1rem, 4vw, 2rem)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexGrow: 1 }}>
          {getGreeting()}!
        </h1>

        <div className="flex items-center gap-2">
          <Link
            to="/new"
            className="btn-icon-only"
            title="Nuovo Container"
            style={{ textDecoration: 'none' }}
          >
            <PlusCircle size={24} />
          </Link>
          <button
            className="btn-icon-only"
            onClick={() => setEditMode(!editMode)}
            title={editMode ? "Fine Modifica" : "Modifica Layout"}
            style={{ color: editMode ? 'var(--success)' : 'inherit' }}
          >
            {editMode ? <Check size={24} /> : <Edit size={24} />}
          </button>
        </div>
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

      {/* Widgets Row */}
      <WidgetsPanel 
        className="mb-6" 
        editMode={editMode} 
        widgetsOrder={widgetsOrder} 
        setWidgetsOrder={setWidgetsOrder} 
      />

      {/* Containers Section */}
      <div className="flex justify-between items-center mt-2 mb-5">
        <h2 className="m-0">I tuoi Container</h2>

        {editMode && (
          <div className="flex items-center gap-2">
            <div 
              className="flex items-center gap-2 mr-4" 
              onClick={() => setShowSystemContainers(!showSystemContainers)}
              style={{ cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-color)', userSelect: 'none' }}
            >
              <div style={{ color: showSystemContainers ? 'var(--primary)' : 'var(--text-muted)' }}>
                {showSystemContainers ? <CheckSquare size={18} /> : <Square size={18} />}
              </div>
              Mostra container di sistema
            </div>
            <select value={sortMode} onChange={e => { setSortMode(e.target.value); if (e.target.value !== 'custom') setEditMode(false); }} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-color)', outline: 'none' }}>
              <option value="date">Data di Creazione</option>
              <option value="alphabetical">Alfabetico</option>
              <option value="status">Stato (Avviati prima)</option>
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
            if (progressData?.percentage) {
              progressPercent = progressData.percentage;
            } else if (progressData?.progressDetail?.total) {
              progressPercent = (progressData.progressDetail.current / progressData.progressDetail.total) * 100;
            }

            const stableId = c.Names ? c.Names[0].replace('/', '') : c.Id;
            const isPinned = pinnedContainers.includes(stableId);

            const getRepositoryUrl = () => {
              const sourceLabel = c.Labels?.['org.opencontainers.image.source'];
              if (sourceLabel) return sourceLabel;
              
              let imgName = c.Image || '';
              const colonIdx = imgName.lastIndexOf(':');
              if (colonIdx > 0 && !imgName.substring(colonIdx).includes('/')) {
                imgName = imgName.substring(0, colonIdx);
              }
              
              if (imgName) {
                if (imgName.includes('/')) {
                  return `https://hub.docker.com/r/${imgName}`;
                } else {
                  return `https://hub.docker.com/_/${imgName}`;
                }
              }
              return null;
            };
            const repoUrl = getRepositoryUrl();

            return (
              <div
                key={c.Id}
                className={`container-card ${editMode ? 'edit-mode' : ''}`}
                draggable={editMode && !isMobile}
                onDragStart={(e) => handleDragStart(e, stableId)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stableId)}
                style={{
                  cursor: editMode && !isMobile ? 'grab' : 'default',
                  opacity: draggedItem === stableId ? 0.5 : 1,
                  borderStyle: editMode ? 'dashed' : 'solid',
                  borderColor: editMode ? 'var(--primary-alpha)' : 'var(--border-subtle)',
                  borderWidth: editMode ? '2px' : '1px'
                }}
              >

                {/* Pin Icon */}
                {(editMode || isPinned) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePin(stableId); }}
                    style={{
                      position: 'absolute', top: '12px', left: '12px', background: 'transparent', border: 'none',
                      color: isPinned ? 'var(--primary)' : 'var(--text-color)', opacity: isPinned || editMode ? 1 : 0.2,
                      cursor: editMode ? 'pointer' : 'default', zIndex: 5, padding: '4px',
                      pointerEvents: editMode ? 'auto' : 'none'
                    }}
                    title={isPinned ? 'Pinned' : 'Pin to top'}
                  >
                    <Pin size={16} fill={isPinned ? 'currentColor' : 'none'} />
                  </button>
                )}

                {/* LED Status */}
                <div className="card-led">
                  <span className={`status-dot ${c.State === 'running' ? 'running' : 'exited'}`} style={{ width: '12px', height: '12px' }}></span>
                </div>

                {progressData && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                    zIndex: 10, padding: '16px', color: 'white', borderRadius: 'inherit'
                  }}>
                    <Loader className="spin" size={28} style={{ marginBottom: '10px' }} />
                    <h4 className="m-0 text-center" style={{ fontSize: '0.85rem' }}>{progressData.status}</h4>
                    <div className="font-bold" style={{ fontSize: '0.85rem', marginTop: '5px', opacity: 0.9 }}>{Math.round(progressPercent)}%</div>
                    <progress value={progressPercent} max="100" style={{ width: '80%', height: '4px', borderRadius: '2px', marginTop: '10px' }}></progress>
                  </div>
                )}

                {/* Clickable Area (Icon + Title) */}
                {isClickable ? (
                  <a
                    href={webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                      width: '100%',
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                    title="Apri Web UI"
                    className="card-clickable-area"
                  >
                    <img src={getContainerIcon(c)} alt="" className="card-icon" style={{ cursor: 'pointer' }} onError={e => { e.target.style.display = 'none'; }} />
                    <h3 className="card-title" style={{ cursor: 'pointer', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = 'var(--primary)'} onMouseOut={e => e.target.style.color = 'inherit'}>
                      {getContainerName(c)}
                    </h3>
                  </a>
                ) : (
                  <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <img src={getContainerIcon(c)} alt="" className="card-icon" onError={e => { e.target.style.display = 'none'; }} />
                    <h3 className="card-title">
                      {getContainerName(c)}
                    </h3>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="card-actions">
                  {repoUrl && (
                    <button onClick={() => window.open(repoUrl, '_blank', 'noopener,noreferrer')} className="btn-action-square neutral" title="Sorgente (GitHub/DockerHub)">
                      <Github size={22} />
                    </button>
                  )}
                  {c.State !== 'running' ? (
                    <button onClick={() => handleAction(c.Id, 'start')} className="btn-action-square success" title="Avvia">
                      <Play size={22} />
                    </button>
                  ) : (
                    <button onClick={() => handleAction(c.Id, 'stop')} className="btn-action-square danger" title="Arresta">
                      <Square size={22} />
                    </button>
                  )}
                  <button onClick={() => setLogsContainer({ id: c.Id, name: getContainerName(c) })} className="btn-action-square neutral" title="Log">
                    <FileText size={22} />
                  </button>
                  <button onClick={() => setEditingContainerId(c.Id)} className="btn-action-square neutral" title="Impostazioni">
                    <Settings size={22} />
                  </button>
                </div>

                {editMode && (
                  <div className="card-edit-controls">
                    <button onClick={() => moveCustom(stableId, -1)} className="btn-action-square neutral" title="Sposta Su">
                      <ChevronUp size={20} />
                    </button>
                    <button onClick={() => moveCustom(stableId, 1)} className="btn-action-square neutral" title="Sposta Giù">
                      <ChevronDown size={20} />
                    </button>
                    {!isMobile && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5, cursor: 'grab', padding: '0 4px' }} title="Trascina per riordinare">
                        <GripHorizontal size={16} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {Object.entries(recreating)
            .filter(([recreId]) => !containers.some(c => c.Id === recreId))
            .map(([recreId, progressData]) => {
              let progressPercent = 0;
              if (progressData?.percentage) {
                progressPercent = progressData.percentage;
              } else if (progressData?.progressDetail?.total) {
                progressPercent = (progressData.progressDetail.current / progressData.progressDetail.total) * 100;
              }
              return (
                <div key={recreId} className="container-card">
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                    zIndex: 10, padding: '10px', color: 'white', borderRadius: 'inherit', textAlign: 'center'
                  }}>
                    <Loader className="spin" size={24} style={{ marginBottom: '8px', flexShrink: 0 }} />
                    <h4 className="m-0" style={{ fontSize: '0.8rem', whiteSpace: 'normal', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {progressData.status}
                    </h4>
                    <div className="font-bold" style={{ fontSize: '0.8rem', opacity: 0.9 }}>{Math.round(progressPercent)}%</div>
                  </div>

                  {/* LED */}
                  <div className="card-led">
                    <span className="status-dot recreating" style={{ width: '12px', height: '12px' }}></span>
                  </div>

                  {/* Placeholder Icon */}
                  <div className="card-icon" style={{ backgroundColor: 'var(--card-border)' }} />

                  {/* Title */}
                  <h3 className="card-title">
                    {progressData.name || 'Operazione in corso...'}
                  </h3>

                  {/* Disabled Action Button */}
                  <div className="card-actions">
                    <button className="btn-action-square neutral" style={{ opacity: 0.5, cursor: 'not-allowed' }} disabled>
                      <Loader size={18} className="spin" />
                    </button>
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
          containerOverrides={containerOverrides}
          onUpdateOverride={(stableId, overrides) => {
            setContainerOverrides(prev => ({
              ...prev,
              [stableId]: { ...(prev[stableId] || {}), ...overrides }
            }));
          }}
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
