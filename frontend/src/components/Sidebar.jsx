import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Monitor, Server, Terminal as TermIcon, Menu, Wrench, Folder, LayoutGrid, Cpu, HardDrive, MemoryStick, Activity, Globe, ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import axios from 'axios';
import { io } from 'socket.io-client';

export default function Sidebar({ activePanel, togglePanel, isMobile, isCollapsed, setIsCollapsed }) {
  const [stats, setStats] = useState(null);
  const [containers, setContainers] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const fetchStats = async () => {
      try {
        const res = await axios.get('/api/system/stats', { headers: { Authorization: `Bearer ${token}` } });
        setStats(res.data);
      } catch (err) {}
    };

    const fetchContainers = async () => {
      try {
        const res = await axios.get('/api/docker/containers', { headers: { Authorization: `Bearer ${token}` } });
        setContainers(res.data);
      } catch (err) {}
    };

    fetchStats();
    fetchContainers();

    const socket = io(window.location.origin, {
      auth: { token, type: 'web' }
    });

    socket.on('system.stats', (data) => setStats(data));
    socket.on('docker.containers', (data) => setContainers(data));

    return () => socket.disconnect();
  }, []);

  const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec || bytesPerSec === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const closeMobile = () => {
    if (isMobile) togglePanel(activePanel); // This will close it
  };

  if (!activePanel) return null; // Non renderizzare affatto la sidebar se chiusa

  return (
    <>
      {/* Mobile Overlay */}
      {isMobile && activePanel && (
        <div 
          className="animate-fade-in"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 90 }}
          onClick={closeMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`sidebar glass open ${isMobile ? 'mobile animate-slide-in-left' : 'desktop'} ${!isMobile && isCollapsed ? 'collapsed' : ''}`} style={{ 
        width: isMobile ? '280px' : (isCollapsed ? '80px' : '300px'), 
        padding: isCollapsed && !isMobile ? '20px 10px' : '20px',
        overflowY: 'auto',
        overflowX: 'hidden',
        position: isMobile ? 'fixed' : 'relative',
        height: '100vh',
        zIndex: 100
      }}>
        
        {/* Collapse Button (Desktop Only) */}
        {!isMobile && (
          <div className="flex justify-end mb-2">
            <button 
              className="btn-icon" 
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={isCollapsed ? "Espandi Sidebar" : "Riduci Sidebar"}
            >
              {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
          </div>
        )}

        {/* Panel Content */}
        {activePanel === 'menu' && (
          <div className="sidebar-menu-content flex-col gap-2">
            <NavLink to="/" onClick={closeMobile} className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
              <Monitor /> <span className="sidebar-link-text">Dashboard</span>
            </NavLink>
            <NavLink to="/files" onClick={closeMobile} className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
              <Folder /> <span className="sidebar-link-text">Files</span>
            </NavLink>
            <NavLink to="/terminal" onClick={closeMobile} className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
              <TermIcon /> <span className="sidebar-link-text">Terminal</span>
            </NavLink>
            <NavLink to="/advanced" onClick={closeMobile} className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
              <Wrench /> <span className="sidebar-link-text">Avanzate</span>
            </NavLink>
          </div>
        )}

        {activePanel === 'widgets' && stats && (
          <div className="sidebar-widgets-content flex-col gap-4" style={{ paddingBottom: '20px' }}>
            {/* Widget items rendered vertically */}
            <div className="widget p-4" style={{ background: 'var(--card-border)', borderRadius: 'var(--radius-md)' }}>
              <div className="flex items-center gap-2 mb-1 text-muted">
                <Cpu size={18} /> <span>CPU ({stats.cpu?.cores || 0} Core)</span>
              </div>
              <div className="value" style={{ fontSize: '1.5rem' }}>{stats.cpu?.load || 0}%</div>
              <progress value={stats.cpu?.load || 0} max="100" style={{ width: '100%', height: '6px', marginTop: '5px' }}></progress>
              <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '4px' }}>
                {stats.cpu?.temperature != null ? `${Math.round(stats.cpu.temperature)}°C` : 'Temp N/A'}
              </div>
            </div>

            <div className="widget p-4" style={{ background: 'var(--card-border)', borderRadius: 'var(--radius-md)' }}>
              <div className="flex items-center gap-2 mb-1 text-muted">
                <MemoryStick size={18} /> <span>RAM</span>
              </div>
              <div className="value" style={{ fontSize: '1.5rem' }}>{stats.memory?.percent || 0}%</div>
              <progress value={stats.memory?.percent || 0} max="100" style={{ width: '100%', height: '6px', marginTop: '5px' }}></progress>
              <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '4px' }}>
                {((stats.memory?.used || 0) / 1024 / 1024 / 1024).toFixed(1)} GB / {((stats.memory?.total || 0) / 1024 / 1024 / 1024).toFixed(1)} GB
              </div>
            </div>

            <div className="widget p-4" style={{ background: 'var(--card-border)', borderRadius: 'var(--radius-md)' }}>
              <div className="flex items-center gap-2 mb-1 text-muted">
                <HardDrive size={18} /> <span>Disco Primario</span>
              </div>
              <div className="value" style={{ fontSize: '1.5rem' }}>{stats.disk?.percent || 0}%</div>
              <progress value={stats.disk?.percent || 0} max="100" style={{ width: '100%', height: '6px', marginTop: '5px' }}></progress>
              <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '4px' }}>
                {((stats.disk?.used || 0) / 1024 / 1024 / 1024).toFixed(1)} GB / {((stats.disk?.total || 0) / 1024 / 1024 / 1024).toFixed(1)} GB
              </div>
            </div>

            <div className="widget p-4" style={{ background: 'var(--card-border)', borderRadius: 'var(--radius-md)' }}>
              <div className="flex items-center gap-2 mb-1 text-muted">
                <Activity size={18} /> <span>Container Attivi</span>
              </div>
              <div className="value" style={{ fontSize: '1.5rem' }}>{containers ? containers.filter(c => c.State === 'running').length : 0} <span style={{fontSize: '0.9rem', color: 'var(--text-color)', fontWeight: 'normal'}}>su {containers ? containers.length : 0}</span></div>
              <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '4px' }}>OS: {stats.os?.distro || 'Sconosciuto'}</div>
            </div>

            <div className="widget p-4" style={{ background: 'var(--card-border)', borderRadius: 'var(--radius-md)' }}>
              <div className="flex items-center gap-2 mb-2 text-muted">
                <Globe size={18} /> <span>Rete</span>
              </div>
              <div className="flex justify-between">
                <div className="flex-col" style={{ alignItems: 'flex-start' }}>
                  <span className="flex items-center gap-1 text-sm text-muted"><ArrowDown size={14} color="#10b981" /> Down</span>
                  <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>{stats.network?.rx_sec != null ? formatSpeed(stats.network.rx_sec) : '0 B/s'}</span>
                </div>
                <div className="flex-col" style={{ alignItems: 'flex-end' }}>
                  <span className="flex items-center gap-1 text-sm text-muted"><ArrowUp size={14} color="#3b82f6" /> Up</span>
                  <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>{stats.network?.tx_sec != null ? formatSpeed(stats.network.tx_sec) : '0 B/s'}</span>
                </div>
              </div>
            </div>

          </div>
        )}

      </aside>
    </>
  );
}
