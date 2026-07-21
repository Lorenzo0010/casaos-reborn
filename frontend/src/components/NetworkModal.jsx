import React, { useState, useEffect } from 'react';
import { X, Globe, ArrowDown, ArrowUp } from 'lucide-react';
import axios from 'axios';

export default function NetworkModal({ isOpen, onClose }) {
  const [containers, setContainers] = useState([]);
  const [interfaces, setInterfaces] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/system/network-details', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setContainers(res.data.containers || []);
        setInterfaces(res.data.interfaces || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000); // refresh every 5s

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const formatBytes = (bytes) => {
    if (!bytes || isNaN(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: '20px'
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        backgroundColor: 'var(--bg-color)',
        width: '100%', maxWidth: '800px', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        borderRadius: '16px', overflow: 'hidden',
        border: '1px solid var(--card-border)'
      }}>
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Globe size={24} color="var(--primary)" />
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Dettagli Rete</h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {loading && containers.length === 0 && interfaces.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Caricamento dati di rete...</div>
          ) : (
            <div style={{ overflowX: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Interfaces */}
              {interfaces.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Interfacce di Rete
                  </h3>
                  <div className="modal-table-wrapper">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '8px' }}>Interfaccia</th>
                        <th style={{ padding: '8px' }}>Indirizzo IP</th>
                        <th style={{ padding: '8px' }}>Stato</th>
                        <th style={{ padding: '8px' }}>Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {interfaces.map((iface, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '8px', fontWeight: 500, color: 'var(--text-color)' }}>{iface.iface}</td>
                          <td style={{ padding: '8px', color: 'var(--primary)' }}>{iface.ip4 || 'N/A'}</td>
                          <td style={{ padding: '8px', color: iface.operstate === 'up' ? 'var(--success)' : 'var(--text-muted)' }}>
                            {iface.operstate?.toUpperCase()}
                          </td>
                          <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{iface.type || 'Sconosciuto'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {/* Containers */}
              {containers.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ padding: '2px 6px', background: 'var(--primary)', color: 'white', borderRadius: '4px', fontSize: '0.7rem', textTransform: 'uppercase' }}>Container</span>
                    Traffico Rete Container
                  </h3>
                  <div className="modal-table-wrapper">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '8px' }}>Nome Container</th>
                        <th style={{ padding: '8px' }}>ID</th>
                        <th style={{ padding: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <ArrowDown size={14} color="var(--success)" /> Download (RX)
                          </div>
                        </th>
                        <th style={{ padding: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <ArrowUp size={14} color="var(--primary)" /> Upload (TX)
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {containers.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '8px', fontWeight: 500, color: 'var(--text-color)' }}>{c.name}</td>
                          <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{c.id}</td>
                          <td style={{ padding: '8px', color: 'var(--success)', fontWeight: 'bold' }}>{formatBytes(c.rx)}</td>
                          <td style={{ padding: '8px', color: 'var(--primary)', fontWeight: 'bold' }}>{formatBytes(c.tx)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
