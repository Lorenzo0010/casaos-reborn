import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { RefreshCw, Server, AlertCircle, ArrowUpCircle } from 'lucide-react';
import { io } from 'socket.io-client';
import { useDialog } from '../contexts/DialogContext';

export default function Updates() {
  const { showAlert } = useDialog();
  const [updates, setUpdates] = useState([]);
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState(null);
  const [loading, setLoading] = useState(true);

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
    } catch (err) {
      console.error(err);
      setIsChecking(false);
      showAlert('Errore', 'Impossibile avviare la ricerca aggiornamenti.', true);
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
        fetchUpdates();
      }
    });

    socket.on('updater.results', (data) => {
      setUpdates(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

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
