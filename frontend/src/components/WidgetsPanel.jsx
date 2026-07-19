import React, { useState, useEffect } from 'react';
import { HardDrive, ArrowDown, ArrowUp, ChevronRight, Cpu, Activity, Clock, Monitor } from 'lucide-react';
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

  const formatUptime = (seconds) => {
    if (!seconds) return 'N/A';
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    
    if (d > 0) return `${d}g ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  if (!stats) {
    return (
      <div className={`widgets-row ${className}`} style={{ width: '100%', ...style }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="widget p-4 flex items-center justify-center" style={{ margin: 0, padding: '24px', minWidth: '260px', minHeight: '180px', flex: '0 0 auto', opacity: 0.5 }}>
            <div className="spin" style={{ width: '24px', height: '24px', border: '3px solid var(--border-subtle)', borderTopColor: 'var(--primary)', borderRadius: '50%' }}></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`widgets-row ${className}`} style={{ width: '100%', ...style }}>
      
      {/* 1. CPU Widget */}
      <div className="widget p-4" style={{ margin: 0, padding: '24px', minWidth: '260px', minHeight: '180px', flex: '0 0 auto', justifyContent: 'space-between' }}>
        <div className="flex items-center justify-between mb-3" style={{ opacity: 0.9, color: 'var(--text-color)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Processore</span>
          <Cpu size={16} opacity={0.7} />
        </div>
        <div className="flex-col items-center justify-center text-center my-auto">
          <div className="value" style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--primary)', lineHeight: 1 }}>{stats.cpu?.load || 0}%</div>
        </div>
        <div className="flex justify-between items-end mt-2" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Core</span>
            <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>{stats.cpu?.cores || '-'} Cores</span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Temperatura</span>
            <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>{stats.cpu?.temperature != null ? `${Math.round(stats.cpu.temperature)}°C` : 'N/A'}</span>
          </span>
        </div>
      </div>

      {/* 2. RAM Widget */}
      <div className="widget p-4" style={{ margin: 0, padding: '24px', minWidth: '260px', minHeight: '180px', flex: '0 0 auto', justifyContent: 'space-between' }}>
        <div className="flex items-center justify-between mb-3" style={{ opacity: 0.9, color: 'var(--text-color)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Memoria RAM</span>
          <Activity size={16} opacity={0.7} />
        </div>
        <div className="flex-col items-center justify-center text-center my-auto">
          <div className="value" style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--primary)', lineHeight: 1 }}>{stats.memory?.percent || 0}%</div>
        </div>
        <div className="flex justify-between items-end mt-2" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>In Uso</span>
            <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>{((stats.memory?.used || 0) / 1024 / 1024 / 1024).toFixed(2)} GB</span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Totale</span>
            <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>{((stats.memory?.total || 0) / 1024 / 1024 / 1024).toFixed(2)} GB</span>
          </span>
        </div>
      </div>

      {/* 3. Storage Widget */}
      <div className="widget p-4" style={{ margin: 0, padding: '24px', minWidth: '260px', minHeight: '180px', flex: '0 0 auto', justifyContent: 'space-between' }}>
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

      {/* 4. Network Widget */}
      <div className="widget p-4" style={{ margin: 0, padding: '24px', minWidth: '260px', minHeight: '180px', flex: '0 0 auto', justifyContent: 'space-between' }}>
        <div className="flex items-center justify-between mb-3" style={{ opacity: 0.9, color: 'var(--text-color)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stato della Rete</span>
          <span style={{ fontSize: '0.8rem', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '4px' }}>Attiva</span>
        </div>
        <div className="flex-col justify-center my-auto gap-4" style={{ display: 'flex' }}>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ArrowDown size={20} color="var(--success)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Download</span>
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-color)' }}>{stats.network?.rx_sec != null ? formatSpeed(stats.network.rx_sec) : '0 B/s'}</span>
          </div>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ArrowUp size={20} color="var(--primary)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Upload</span>
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-color)' }}>{stats.network?.tx_sec != null ? formatSpeed(stats.network.tx_sec) : '0 B/s'}</span>
          </div>
        </div>
      </div>

      {/* 5. System Info Widget */}
      <div className="widget p-4" style={{ margin: 0, padding: '24px', minWidth: '260px', minHeight: '180px', flex: '0 0 auto', justifyContent: 'space-between' }}>
        <div className="flex items-center justify-between mb-3" style={{ opacity: 0.9, color: 'var(--text-color)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Info di Sistema</span>
          <Monitor size={16} opacity={0.7} />
        </div>
        
        <div className="flex-col my-auto" style={{ display: 'flex', gap: '12px' }}>
          <div className="flex items-center gap-3">
            <div style={{ background: 'var(--card-border)', padding: '8px', borderRadius: '12px' }}>
              <Monitor size={20} color="var(--text-color)" />
            </div>
            <div className="flex-col">
              <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Sistema Operativo</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-color)', lineHeight: 1.2 }}>
                {stats.os?.distro || stats.os?.platform || 'Sconosciuto'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div style={{ background: 'var(--card-border)', padding: '8px', borderRadius: '12px' }}>
              <Clock size={20} color="var(--primary)" />
            </div>
            <div className="flex-col">
              <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Tempo di Attività</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-color)', lineHeight: 1.2 }}>
                {formatUptime(stats.os?.uptime)}
              </span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
