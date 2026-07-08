import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { X, RefreshCw } from 'lucide-react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

export default function LogsModal({ containerId, containerName, onClose }) {
  const [loading, setLoading] = useState(true);
  const terminalRef = useRef(null);
  const xtermInstance = useRef(null);
  const fitAddon = useRef(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/docker/containers/${containerId}/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (xtermInstance.current) {
        xtermInstance.current.clear();
        // Replace '\n' without '\r' to '\r\n' to fix rendering issues in xterm if any
        const formattedLogs = res.data.replace(/\r?\n/g, '\r\n');
        xtermInstance.current.write(formattedLogs);
      }
    } catch (err) {
      console.error(err);
      if (xtermInstance.current) {
        xtermInstance.current.write(`\r\n\x1b[31mError fetching logs: ${err.response?.data?.error || err.message}\x1b[0m\r\n`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4'
      },
      disableStdin: true,
      cursorBlink: false,
      convertEol: true
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    
    term.open(terminalRef.current);
    fit.fit();

    xtermInstance.current = term;
    fitAddon.current = fit;

    const handleResize = () => fit.fit();
    window.addEventListener('resize', handleResize);

    fetchLogs();

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [containerId]);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-content glass" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%', height: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Logs: {containerName}</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-icon" onClick={fetchLogs} title="Refresh Logs" disabled={loading}>
              <RefreshCw size={20} className={loading ? 'spin' : ''} />
            </button>
            <button className="btn-icon" onClick={onClose}>
              <X size={24} />
            </button>
          </div>
        </div>
        
        <div 
          ref={terminalRef} 
          style={{ flex: 1, backgroundColor: '#1e1e1e', padding: '10px', borderRadius: '8px', overflow: 'hidden' }}
        />
        
        <div className="modal-footer" style={{ marginTop: '15px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose} style={{ background: 'var(--card-bg)' }}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
