import React, { useState, useEffect } from 'react';
import { HardDrive, ArrowDown, ArrowUp, ChevronRight, ChevronLeft, Cpu, Activity, Clock, Monitor, Server, Smartphone } from 'lucide-react';
import axios from 'axios';
import { io } from 'socket.io-client';

import CpuModal from './CpuModal';
import RamModal from './RamModal';
import NetworkModal from './NetworkModal';

export default function WidgetsPanel({ className = '', style = {}, editMode = false, widgetsOrder = ['cpu', 'ram', 'storage', 'network', 'system'], setWidgetsOrder }) {
  const [stats, setStats] = useState(null);
  const [isCpuModalOpen, setIsCpuModalOpen] = useState(false);
  const [isRamModalOpen, setIsRamModalOpen] = useState(false);
  const [isNetworkModalOpen, setIsNetworkModalOpen] = useState(false);
  const [draggedWidget, setDraggedWidget] = useState(null);
  const [weatherData, setWeatherData] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const fetchStats = async () => {
      try {
        const res = await axios.get('/api/system/stats', { headers: { Authorization: `Bearer ${token}` } });
        setStats(res.data);
      } catch (err) { }
    };

    const fetchWeather = async () => {
      try {
        const res = await axios.get('/api/system/weather', { headers: { Authorization: `Bearer ${token}` } });
        setWeatherData(res.data);
      } catch (err) { }
    };

    fetchStats();
    fetchWeather();
    
    // Poll weather every 30 minutes (wttr.in shouldn't be spammed)
    const weatherInterval = setInterval(fetchWeather, 30 * 60 * 1000);

    const socket = io(window.location.origin, {
      auth: { token, type: 'web' }
    });

    socket.on('system.stats', (data) => setStats(data));

    return () => {
      clearInterval(weatherInterval);
      socket.disconnect();
    };
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
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);

    if (d > 0) return `${d}g ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const handleDragStart = (e, id) => {
    if (!editMode) return;
    setDraggedWidget(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    if (!editMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (!editMode || !draggedWidget || draggedWidget === targetId) return;

    let newOrder = [...widgetsOrder];
    // Ensure all possible widgets exist
    const allWidgets = ['cpu', 'ram', 'storage', 'network', 'system', 'weather'];
    allWidgets.forEach(w => {
      if (!newOrder.includes(w)) newOrder.push(w);
    });

    const draggedIndex = newOrder.indexOf(draggedWidget);
    const targetIndex = newOrder.indexOf(targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedWidget);
      if(setWidgetsOrder) setWidgetsOrder(newOrder);
    }
    setDraggedWidget(null);
  };

  const moveWidget = (id, direction) => {
    if (!editMode) return;
    let newOrder = [...widgetsOrder];
    // Ensure all possible widgets exist
    const allWidgets = ['cpu', 'ram', 'storage', 'network', 'system', 'weather'];
    allWidgets.forEach(w => {
      if (!newOrder.includes(w)) newOrder.push(w);
    });

    const index = newOrder.indexOf(id);
    if (index === -1) return;
    
    if (direction === -1 && index > 0) {
      const temp = newOrder[index - 1];
      newOrder[index - 1] = newOrder[index];
      newOrder[index] = temp;
      if(setWidgetsOrder) setWidgetsOrder(newOrder);
    } else if (direction === 1 && index < newOrder.length - 1) {
      const temp = newOrder[index + 1];
      newOrder[index + 1] = newOrder[index];
      newOrder[index] = temp;
      if(setWidgetsOrder) setWidgetsOrder(newOrder);
    }
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

  const renderArrows = (id) => {
    if (!editMode) return null;
    return (
      <div className="flex justify-between items-center" style={{ position: 'absolute', top: '8px', left: '8px', right: '8px', zIndex: 10 }}>
        <button onClick={(e) => { e.stopPropagation(); moveWidget(id, -1); }} className="btn-icon-only" style={{ background: 'var(--card-bg)', padding: '6px', width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ flex: 1, cursor: 'grab', height: '32px' }} title="Trascina per riordinare"></div>
        <button onClick={(e) => { e.stopPropagation(); moveWidget(id, 1); }} className="btn-icon-only" style={{ background: 'var(--card-bg)', padding: '6px', width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
          <ChevronRight size={18} />
        </button>
      </div>
    );
  };

  const widgetComponents = {
    cpu: (
      <div 
        key="cpu"
        draggable={editMode}
        onDragStart={(e) => handleDragStart(e, 'cpu')}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, 'cpu')}
        onClick={() => !editMode && setIsCpuModalOpen(true)} 
        className={`widget p-4 ${editMode ? 'shake-animation' : ''}`} 
        style={{ position: 'relative', cursor: editMode ? 'grab' : 'pointer', margin: 0, padding: '24px', minWidth: '260px', minHeight: '180px', flex: '0 0 auto', justifyContent: 'space-between', opacity: draggedWidget === 'cpu' ? 0.5 : 1 }}
      >
        {renderArrows('cpu')}
        <div className="flex items-center justify-between mb-3" style={{ opacity: 0.9, color: 'var(--text-color)', marginTop: editMode ? '20px' : '0' }}>
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
        <div style={{ background: 'var(--border-subtle)', height: '6px', borderRadius: '3px', marginTop: '16px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, Math.max(0, stats.cpu?.load || 0))}%`, height: '100%', background: 'var(--primary)', borderRadius: '3px', transition: 'width 0.3s' }}></div>
        </div>
      </div>
    ),
    ram: (
      <div 
        key="ram"
        draggable={editMode}
        onDragStart={(e) => handleDragStart(e, 'ram')}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, 'ram')}
        onClick={() => !editMode && setIsRamModalOpen(true)} 
        className={`widget p-4 ${editMode ? 'shake-animation' : ''}`} 
        style={{ position: 'relative', cursor: editMode ? 'grab' : 'pointer', margin: 0, padding: '24px', minWidth: '260px', minHeight: '180px', flex: '0 0 auto', justifyContent: 'space-between', opacity: draggedWidget === 'ram' ? 0.5 : 1 }}
      >
        {renderArrows('ram')}
        <div className="flex items-center justify-between mb-3" style={{ opacity: 0.9, color: 'var(--text-color)', marginTop: editMode ? '20px' : '0' }}>
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
        <div style={{ background: 'var(--border-subtle)', height: '6px', borderRadius: '3px', marginTop: '16px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, Math.max(0, stats.memory?.percent || 0))}%`, height: '100%', background: 'var(--primary)', borderRadius: '3px', transition: 'width 0.3s' }}></div>
        </div>
      </div>
    ),
    storage: (
      <div 
        key="storage"
        draggable={editMode}
        onDragStart={(e) => handleDragStart(e, 'storage')}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, 'storage')}
        className={`widget p-4 ${editMode ? 'shake-animation' : ''}`} 
        style={{ position: 'relative', cursor: editMode ? 'grab' : 'default', margin: 0, padding: '24px', minWidth: '260px', minHeight: '180px', flex: '0 0 auto', justifyContent: 'space-between', opacity: draggedWidget === 'storage' ? 0.5 : 1 }}
      >
        {renderArrows('storage')}
        <div className="flex items-center justify-between mb-3" style={{ opacity: 0.9, color: 'var(--text-color)', marginTop: editMode ? '20px' : '0' }}>
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
        <div style={{ background: 'var(--border-subtle)', height: '6px', borderRadius: '3px', marginTop: '16px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, Math.max(0, stats.disk?.percent || 0))}%`, height: '100%', background: 'var(--primary)', borderRadius: '3px', transition: 'width 0.3s' }}></div>
        </div>
      </div>
    ),
    network: (
      <div 
        key="network"
        draggable={editMode}
        onDragStart={(e) => handleDragStart(e, 'network')}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, 'network')}
        onClick={() => !editMode && setIsNetworkModalOpen(true)} 
        className={`widget p-4 ${editMode ? 'shake-animation' : ''}`} 
        style={{ position: 'relative', cursor: editMode ? 'grab' : 'pointer', margin: 0, padding: '24px', minWidth: '260px', minHeight: '180px', flex: '0 0 auto', justifyContent: 'space-between', opacity: draggedWidget === 'network' ? 0.5 : 1 }}
      >
        {renderArrows('network')}
        <div className="flex items-center justify-between mb-3" style={{ opacity: 0.9, color: 'var(--text-color)', marginTop: editMode ? '20px' : '0' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stato della Rete</span>
          <span style={{ fontSize: '0.8rem', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '4px' }}>Attiva</span>
        </div>
        <div className="flex-col justify-center my-auto gap-4" style={{ display: 'flex' }}>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ArrowDown size={20} color="var(--success)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Download</span>
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-color)' }}>{stats.network?.rx_sec != null && stats.network.rx_sec > 10240 ? formatSpeed(stats.network.rx_sec) : '0 B/s'}</span>
          </div>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ArrowUp size={20} color="var(--primary)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Upload</span>
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-color)' }}>{stats.network?.tx_sec != null && stats.network.tx_sec > 10240 ? formatSpeed(stats.network.tx_sec) : '0 B/s'}</span>
          </div>
        </div>
      </div>
    ),
    system: (
      <div 
        key="system"
        draggable={editMode}
        onDragStart={(e) => handleDragStart(e, 'system')}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, 'system')}
        className={`widget p-4 ${editMode ? 'shake-animation' : ''}`} 
        style={{ position: 'relative', cursor: editMode ? 'grab' : 'default', margin: 0, padding: '24px', minWidth: '260px', minHeight: '180px', flex: '0 0 auto', justifyContent: 'space-between', opacity: draggedWidget === 'system' ? 0.5 : 1 }}
      >
        {renderArrows('system')}
        <div className="flex items-center justify-between mb-3" style={{ opacity: 0.9, color: 'var(--text-color)', marginTop: editMode ? '20px' : '0' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Info di Sistema</span>
          <Server size={16} opacity={0.7} />
        </div>

        <div className="flex-col my-auto" style={{ display: 'flex', gap: '12px' }}>
          <div className="flex items-center gap-3">
            <div style={{ background: 'rgba(139, 92, 246, 0.2)', padding: '8px', borderRadius: '12px' }}>
              <Smartphone size={20} color="#8b5cf6" />
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
    ),
    weather: (
      <div 
        key="weather"
        draggable={editMode}
        onDragStart={(e) => handleDragStart(e, 'weather')}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, 'weather')}
        className={`widget p-4 ${editMode ? 'shake-animation' : ''}`} 
        style={{ position: 'relative', cursor: editMode ? 'grab' : 'default', margin: 0, padding: '24px', minWidth: '260px', minHeight: '180px', flex: '0 0 auto', justifyContent: 'space-between', opacity: draggedWidget === 'weather' ? 0.5 : 1 }}
      >
        {renderArrows('weather')}
        <div className="flex items-center justify-between mb-3" style={{ opacity: 0.9, color: 'var(--text-color)', marginTop: editMode ? '20px' : '0' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meteo</span>
          <span style={{ fontSize: '1.2rem' }}>
            {weatherData?.description?.toLowerCase().includes('sun') || weatherData?.description?.toLowerCase().includes('clear') ? '☀️' : 
             weatherData?.description?.toLowerCase().includes('cloud') ? '☁️' : 
             weatherData?.description?.toLowerCase().includes('rain') ? '🌧️' : 
             weatherData?.description?.toLowerCase().includes('snow') ? '❄️' : '🌤️'}
          </span>
        </div>
        <div className="flex-col items-center justify-center text-center my-auto">
          <div className="value" style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--primary)', lineHeight: 1 }}>
            {weatherData ? `${weatherData.temp}°C` : '--°C'}
          </div>
        </div>
        <div className="flex justify-between items-end mt-2" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>{weatherData ? weatherData.city : 'Caricamento...'}</span>
            <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>{weatherData ? weatherData.description : '--'}</span>
          </span>
        </div>
      </div>
    )
  };

  const allPossibleWidgets = ['cpu', 'ram', 'storage', 'network', 'system', 'weather'];
  // Array fallback in caso widgetsOrder sia vuoto o manchi roba
  const currentOrder = Array.isArray(widgetsOrder) && widgetsOrder.length > 0 ? widgetsOrder : allPossibleWidgets;
  const missingWidgets = allPossibleWidgets.filter(w => !currentOrder.includes(w));
  const finalOrder = [...currentOrder, ...missingWidgets];

  return (
    <>
      <CpuModal isOpen={isCpuModalOpen} onClose={() => setIsCpuModalOpen(false)} />
      <RamModal isOpen={isRamModalOpen} onClose={() => setIsRamModalOpen(false)} />
      <NetworkModal isOpen={isNetworkModalOpen} onClose={() => setIsNetworkModalOpen(false)} />
      <div className={`widgets-row ${className}`} style={{ width: '100%', ...style }}>
        {finalOrder.map(widgetId => widgetComponents[widgetId])}
      </div>
    </>
  );
}
