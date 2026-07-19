import React, { useState, useEffect } from 'react';
import { HardDrive, ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import axios from 'axios';
import { io } from 'socket.io-client';

export default function WidgetsPanel({ className = '', style = {} }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const fetchStats = async () => {
      try {
        const res = await axios.get('/api/system/stats', { headers: { Authorization: `Bearer ${token}` } });
        setStats(res.data);
      } catch (err) {}
    };

    fetchStats();

    const socket = io(window.location.origin, {
      auth: { token, type: 'web' }
    });

    socket.on('system.stats', (data) => setStats(data));

    return () => socket.disconnect();
  }, []);

  const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec || bytesPerSec === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (!stats) {
    return (
      <div className={`flex gap-4 ${className} hide-scrollbar`} style={{ paddingBottom: '10px', overflowX: 'auto', ...style }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="widget p-4 flex items-center justify-center" style={{ margin: 0, padding: '16px', minWidth: '260px', height: '140px', flex: '0 0 auto', opacity: 0.5 }}>
            <div className="spin" style={{ width: '24px', height: '24px', border: '3px solid var(--border-subtle)', borderTopColor: 'var(--primary)', borderRadius: '50%' }}></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex gap-4 ${className} hide-scrollbar`} style={{ paddingBottom: '10px', overflowX: 'auto', ...style }}>
      
      <div className="widget p-4" style={{ margin: 0, padding: '16px', minWidth: '260px', flex: '0 0 auto' }}>
        <div className="flex items-center gap-2 mb-1" style={{ opacity: 0.9, color: 'var(--text-color)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stato del sistema</span>
        </div>
        <div className="flex mt-4" style={{ justifyContent: 'space-around', alignItems: 'center' }}>
          <div className="flex-col items-center">
            <div className="value" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>{stats.cpu?.load || 0}%</div>
            <div style={{ fontSize: '0.85rem', marginTop: '2px', fontWeight: 500 }}>CPU</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {stats.cpu?.temperature != null ? `${Math.round(stats.cpu.temperature)}°C` : 'N/A'}
            </div>
          </div>
          <div className="flex-col items-center">
            <div className="value" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>{stats.memory?.percent || 0}%</div>
            <div style={{ fontSize: '0.85rem', marginTop: '2px', fontWeight: 500 }}>RAM</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {((stats.memory?.total || 0) / 1024 / 1024 / 1024).toFixed(2)} GB
            </div>
          </div>
        </div>
      </div>

      <div className="widget p-4" style={{ margin: 0, padding: '16px', minWidth: '260px', flex: '0 0 auto' }}>
        <div className="flex items-center justify-between mb-3" style={{ opacity: 0.9, color: 'var(--text-color)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Archiviazione</span>
          <HardDrive size={16} opacity={0.7} />
        </div>
        <div className="flex justify-between items-center mb-1">
          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>Sano</span>
        </div>
        <div className="flex justify-between mt-2 mb-1" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span>Usato: {((stats.disk?.used || 0) / 1024 / 1024 / 1024).toFixed(2)} GB</span>
        </div>
        <div className="flex justify-between mb-2" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span>Totale: {((stats.disk?.total || 0) / 1024 / 1024 / 1024).toFixed(2)} GB</span>
        </div>
        <progress value={stats.disk?.percent || 0} max="100" style={{ width: '100%', height: '4px', borderRadius: '2px' }}></progress>
      </div>

      <div className="widget p-4" style={{ margin: 0, padding: '16px', minWidth: '260px', flex: '0 0 auto' }}>
        <div className="flex items-center justify-between mb-3" style={{ opacity: 0.9, color: 'var(--text-color)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stato della rete</span>
          <span style={{ fontSize: '0.8rem', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '4px' }}>wlan0 <ChevronRight size={14} /></span>
        </div>
        <div className="flex justify-between mt-4">
          <div className="flex items-center gap-2">
            <ArrowUp size={16} color="var(--primary)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary)' }}>{stats.network?.tx_sec != null ? formatSpeed(stats.network.tx_sec) : '0 B/s'}</span>
          </div>
          <div className="flex items-center gap-2">
            <ArrowDown size={16} color="var(--success)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--success)' }}>{stats.network?.rx_sec != null ? formatSpeed(stats.network.rx_sec) : '0 B/s'}</span>
          </div>
        </div>
      </div>

      <div className="widget p-4 flex items-center justify-between" style={{ margin: 0, padding: '16px', cursor: 'pointer', minWidth: '260px', flex: '0 0 auto' }}>
        <span style={{ fontWeight: 600 }}>Impostazioni widget</span>
        <ChevronRight size={18} opacity={0.6} />
      </div>
      
    </div>
  );
}
