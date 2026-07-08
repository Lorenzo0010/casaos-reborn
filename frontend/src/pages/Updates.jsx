import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { RefreshCw, Download, Server, Play, AlertCircle, ArrowUpCircle } from 'lucide-react';
import { io } from 'socket.io-client';
import { useDialog } from '../contexts/DialogContext';

export default function Updates() {
  const { showAlert } = useDialog();
  const [updates, setUpdates] = useState([]);
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchUpdates = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/docker/updates', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUpdates(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const triggerCheck = async () => {
    try {
      setIsChecking(true);
      const token = localStorage.getItem('token');
      await axios.post('/api/docker/check-updates', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Il backend manderà 'updater.status' via socket
    } catch (err) {
      console.error(err);
      setIsChecking(false);
      showAlert('Errore', 'Impossibile avviare la ricerca aggiornamenti.', true);
    }
  };

  const updateContainer = async (containerId, name, newFullImage) => {
    try {
      setUpdatingId(containerId);
      const token = localStorage.getItem('token');
      
      // Recupera le info correnti per replicare la logica del Salva e Ricrea
      const inspectRes = await axios.get(`/api/docker/containers/${containerId}/inspect`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const info = inspectRes.data;

      // Parsing delle proprietà (stesso codice di ContainerSettingsModal)
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

      const labels = info?.Config?.Labels || {};
      
      // Separazione immagine e tag
      let imageName = newFullImage;
      let imageTag = 'latest';
      const colonIdx = newFullImage.lastIndexOf(':');
      if (colonIdx > 0 && !newFullImage.substring(colonIdx).includes('/')) {
        imageName = newFullImage.substring(0, colonIdx);
        imageTag = newFullImage.substring(colonIdx + 1);
      }

      // Costruzione Payload (uguale a handleSave di ContainerSettingsModal)
      const payload = {
        image: imageName,
        tag: imageTag,
        name: (info?.Name || '').replace('/', ''),
        displayName: labels['casaos.reborn.name'] || '',
        icon: labels['casaos.reborn.icon'] || '',
        restartPolicy: info?.HostConfig?.RestartPolicy?.Name || 'unless-stopped',
        pidMode: info?.HostConfig?.PidMode || '',
        privileged: !!info?.HostConfig?.Privileged,
        memory: info?.HostConfig?.Memory || 0,
        webUI: {
          scheme: labels['casaos.reborn.web.scheme'] || 'http://',
          port: labels['casaos.reborn.web.port'] || '',
          path: labels['casaos.reborn.web.path'] || '/'
        },
        env: parsedEnv.filter(e => e.key).map(e => `${e.key}=${e.value}`),
        ports: {},
        volumes: parsedVolumes.filter(v => v.hostPath && v.containerPath).map(v => `${v.hostPath}:${v.containerPath}`)
      };

      parsedPorts.forEach(p => {
        if (p.containerPort) {
          const key = `${p.containerPort}/${p.protocol}`;
          payload.ports[key] = [{ HostPort: p.hostPort }];
        }
      });

      // Esegue la chiamata identica al Salva e Ricrea (che sappiamo funzionare perfettamente!)
      await axios.post(`/api/docker/containers/${containerId}/recreate`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Il processo è gestito asincronamente tramite socket
    } catch (err) {
      console.error(err);
      showAlert('Errore', 'Errore durante l\'aggiornamento: ' + (err.response?.data?.error || err.message), true);
      setUpdatingId(null);
    }
  };

  useEffect(() => {
    fetchUpdates();

    const token = localStorage.getItem('token');
    const socket = io(window.location.origin, {
      auth: { token, type: 'web' }
    });

    socket.on('updater.status', (data) => {
      if (data.status === 'checking') {
        setIsChecking(true);
        setCheckStatus({ container: data.container, action: data.action, percentage: data.percentage });
      }
      if (data.status === 'idle') {
        setIsChecking(false);
        setCheckStatus(null);
        fetchUpdates(); // Ricarica la lista aggiornata
      }
    });

    socket.on('updater.results', (data) => {
      setUpdates(data);
    });

    socket.on('container.recreate.success', ({ id, oldId }) => {
      if (updatingId === oldId) {
        setUpdatingId(null);
        showAlert('Aggiornato', 'Container aggiornato con successo!');
        fetchUpdates();
      }
    });

    socket.on('container.recreate.error', ({ id, error }) => {
      if (updatingId === id) {
        setUpdatingId(null);
        showAlert('Errore', 'Impossibile aggiornare: ' + error, true);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [updatingId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '20px' }}>
      
      <div className="glass widget" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ArrowUpCircle size={28} color="var(--primary)" />
            Aggiornamenti Container
          </h1>
          <p style={{ margin: 0, opacity: 0.7 }}>
            Il sistema controlla in background ogni 30 minuti se esistono nuove versioni delle immagini Docker per i tuoi container.
            Le immagini inutilizzate vengono pulite automaticamente al termine del controllo.
          </p>
        </div>
        <button 
          className="btn" 
          onClick={triggerCheck} 
          disabled={isChecking}
          style={{ background: 'var(--primary)', color: 'var(--primary-text)', padding: '10px 20px', borderRadius: '10px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <RefreshCw size={18} className={isChecking ? 'spin' : ''} />
          {isChecking ? 'Ricerca in corso...' : 'Cerca Aggiornamenti Ora'}
        </button>
      </div>

      {isChecking && checkStatus && checkStatus.container && (
        <div className="glass widget" style={{ padding: '15px 20px', animation: 'fadeIn 0.3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.95rem' }}>
            <span><strong>Scansione: </strong> {checkStatus.container}</span>
            <span style={{ opacity: 0.8 }}>{checkStatus.action}</span>
          </div>
          <div style={{ width: '100%', background: 'var(--card-border)', borderRadius: '10px', height: '10px', overflow: 'hidden' }}>
            <div style={{ width: `${checkStatus.percentage || 0}%`, background: 'var(--primary)', height: '100%', transition: 'width 0.2s linear' }}></div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.8rem', marginTop: '5px', opacity: 0.8, fontWeight: 'bold' }}>
            {checkStatus.percentage || 0}%
          </div>
        </div>
      )}

      <div className="glass widget" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', opacity: 0.7 }}>Caricamento...</div>
        ) : updates.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
            <AlertCircle size={48} color="var(--success, #10b981)" />
            <h2 style={{ margin: 0 }}>Tutto Aggiornato!</h2>
            <p style={{ margin: 0, opacity: 0.7 }}>Tutti i tuoi container utilizzano le versioni più recenti.</p>
          </div>
        ) : (
          <div style={{ overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'rgba(0,0,0,0.05)' }}>
                  <th style={{ padding: '15px 20px' }}>Container</th>
                  <th style={{ padding: '15px 20px' }}>Immagine (Nuova Versione)</th>
                  <th style={{ padding: '15px 20px' }}>Ultimo Controllo</th>
                  <th style={{ padding: '15px 20px', textAlign: 'right' }}>Azione</th>
                </tr>
              </thead>
              <tbody>
                {updates.map(upd => (
                  <tr key={upd.id} style={{ borderBottom: '1px solid var(--card-border)', transition: 'background 0.2s' }}>
                    <td style={{ padding: '15px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold' }}>
                        <Server size={20} color="var(--primary)" />
                        {upd.name}
                      </div>
                    </td>
                    <td style={{ padding: '15px 20px', opacity: 0.8 }}>
                      {upd.image}
                    </td>
                    <td style={{ padding: '15px 20px', opacity: 0.7 }}>
                      {new Date(upd.timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: '15px 20px', textAlign: 'right' }}>
                      <button 
                        className="btn" 
                        onClick={() => updateContainer(upd.id, upd.name, upd.image)}
                        disabled={updatingId === upd.id || isChecking}
                        style={{ background: updatingId === upd.id ? 'var(--card-border)' : '#10b981', color: '#fff', border: 'none', fontWeight: 'bold' }}
                      >
                        {updatingId === upd.id ? (
                          <><RefreshCw size={16} className="spin" style={{ marginRight: '5px' }}/> In Corso...</>
                        ) : (
                          <><Download size={16} style={{ marginRight: '5px' }}/> Aggiorna</>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
