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

  if (!stats) return null;

  return (
    <div className={`flex-col gap-4 ${className}`} style={{ paddingBottom: '20px', ...style }}>
      
      <div className="glass widget p-4" style={{ margin: 0, padding: '16px' }}>
        <div className="flex items-center gap-2 mb-1" style={{ opacity: 1, color: 'var(--text-color)' }}>
          <span style={{ fontWeight: 600 }}>Stato del sistema</span>
        </div>
        <div className="flex mt-4" style={{ justifyContent: 'space-around', alignItems: 'center' }}>
          <div className="flex-col items-center">
            <div className="value" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.cpu?.load || 0}%</div>
            <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>CPU</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-color)', opacity: 0.8 }}>
              {stats.cpu?.temperature != null ? `${Math.round(stats.cpu.temperature)}°C` : 'N/A'}
            </div>
          </div>
          <div className="flex-col items-center">
            <div className="value" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.memory?.percent || 0}%</div>
            <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>RAM</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-color)', opacity: 0.8 }}>
              {((stats.memory?.total || 0) / 1024 / 1024 / 1024).toFixed(2)} GB
            </div>
          </div>
        </div>
      </div>

      <div className="glass widget p-4" style={{ margin: 0, padding: '16px' }}>
        <div className="flex items-center justify-between mb-3" style={{ opacity: 1, color: 'var(--text-color)' }}>
          <span style={{ fontWeight: 600 }}>Archiviazione</span>
          <HardDrive size={16} opacity={0.7} />
        </div>
        <div className="flex justify-between items-center mb-1">
          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.4)' }}>Sano</span>
        </div>
        <div className="flex justify-between mt-2 mb-1" style={{ fontSize: '0.8rem' }}>
          <span>Usato: {((stats.disk?.used || 0) / 1024 / 1024 / 1024).toFixed(2)} GB</span>
        </div>
        <div className="flex justify-between mb-2" style={{ fontSize: '0.8rem' }}>
          <span>Totale: {((stats.disk?.total || 0) / 1024 / 1024 / 1024).toFixed(2)} GB</span>
        </div>
        <progress value={stats.disk?.percent || 0} max="100" style={{ width: '100%', height: '8px', borderRadius: '4px' }}></progress>
      </div>

      <div className="glass widget p-4" style={{ margin: 0, padding: '16px' }}>
        <div className="flex items-center justify-between mb-3" style={{ opacity: 1, color: 'var(--text-color)' }}>
          <span style={{ fontWeight: 600 }}>Stato della rete</span>
          <span style={{ fontSize: '0.8rem', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '4px' }}>wlan0 <ChevronRight size={14} /></span>
        </div>
        <div className="flex justify-between mt-4">
          <div className="flex items-center gap-2">
            <ArrowUp size={16} color="#3b82f6" />
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{stats.network?.tx_sec != null ? formatSpeed(stats.network.tx_sec) : '0 B/s'}</span>
          </div>
          <div className="flex items-center gap-2">
            <ArrowDown size={16} color="#10b981" />
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{stats.network?.rx_sec != null ? formatSpeed(stats.network.rx_sec) : '0 B/s'}</span>
          </div>
        </div>
      </div>

      <div className="glass widget p-4 flex items-center justify-between" style={{ margin: 0, padding: '16px', cursor: 'pointer' }}>
        <span style={{ fontWeight: 600 }}>Impostazioni widget</span>
        <ChevronRight size={18} opacity={0.6} />
      </div>
      
    </div>
  );
}
