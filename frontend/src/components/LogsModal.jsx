import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, RefreshCw } from 'lucide-react';

export default function LogsModal({ containerId, containerName, onClose }) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/docker/containers/${containerId}/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(res.data);
    } catch (err) {
      console.error(err);
      setLogs('Error fetching logs: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [containerId]);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-content glass" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%', height: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Logs: {containerName}</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-icon" onClick={fetchLogs} title="Refresh Logs">
              <RefreshCw size={20} className={loading ? 'spin' : ''} />
            </button>
            <button className="btn-icon" onClick={onClose}>
              <X size={24} />
            </button>
          </div>
        </div>
        
        <div style={{ flex: 1, backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '15px', borderRadius: '8px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '14px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {loading && !logs ? 'Caricamento logs...' : (logs || 'Nessun log disponibile per questo container.')}
        </div>
        
        <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose} style={{ background: 'var(--card-bg)' }}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
