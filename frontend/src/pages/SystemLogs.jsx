import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Terminal, RefreshCw, Trash2, ArrowDown } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';

export default function SystemLogs() {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const logsEndRef = useRef(null);
  const { showAlert, showConfirm } = useDialog();

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/system/logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(res.data);
    } catch (err) {
      console.error(err);
      showAlert('Errore', 'Failed to fetch logs: ' + (err.response?.data?.error || err.message), true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const clearLogs = async () => {
    const confirmed = await showConfirm('Svuota Log', 'Sei sicuro di voler svuotare tutti i log di sistema? Questa azione non può essere annullata.');
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete('/api/system/logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs('');
    } catch (err) {
      showAlert('Errore', 'Failed to clear logs: ' + (err.response?.data?.error || err.message), true);
    }
  };

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Funzione per colorare le righe di errore
  const renderLogLines = () => {
    if (!logs) return 'Nessun log disponibile.';
    return logs.split('\n').map((line, idx) => {
      const isError = line.includes('[ERROR]');
      return (
        <div key={idx} style={{ color: isError ? '#ef4444' : 'inherit' }}>
          {line}
        </div>
      );
    });
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '40px', height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
          <Terminal size={24} /> Log di Sistema
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn" onClick={fetchLogs} title="Aggiorna Logs" style={{ background: 'var(--card-bg)' }}>
            <RefreshCw size={18} className={loading ? 'spin' : ''} style={{ marginRight: '5px' }} /> Aggiorna
          </button>
          <button className="btn" onClick={scrollToBottom} title="Scorri alla fine" style={{ background: 'var(--card-bg)' }}>
            <ArrowDown size={18} style={{ marginRight: '5px' }} /> Fine
          </button>
          <button className="btn btn-danger" onClick={clearLogs} title="Svuota Logs">
            <Trash2 size={18} style={{ marginRight: '5px' }} /> Svuota
          </button>
        </div>
      </div>

      <div className="glass" style={{ flex: 1, backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '15px', borderRadius: '8px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {loading && !logs ? 'Caricamento logs in corso...' : renderLogLines()}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
