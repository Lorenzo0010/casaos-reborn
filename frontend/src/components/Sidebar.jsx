import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Monitor, Server, Terminal as TermIcon, Menu, Wrench, Folder, LayoutGrid, Cpu, HardDrive, MemoryStick, Activity, Globe, ArrowDown, ArrowUp } from 'lucide-react';
import axios from 'axios';
import { io } from 'socket.io-client';

export default function Sidebar() {
  const isMobileInitial = window.innerWidth < 768;
  const [activePanel, setActivePanel] = useState(isMobileInitial ? null : 'widgets');
  const [isMobile, setIsMobile] = useState(isMobileInitial);
  
  const [stats, setStats] = useState(null);
  const [containers, setContainers] = useState([]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const togglePanel = (panel) => {
    if (activePanel === panel) {
      setActivePanel(null); // Close if already open
    } else {
      setActivePanel(panel);
    }
  };

  const closeMobile = () => {
    if (isMobile) setActivePanel(null);
  };

  return (
    <>
      {/* Top Header for Mobile ONLY */}
      <div className="mobile-header" style={{ display: isMobile ? 'flex' : 'none', justifyContent: 'space-between', alignItems: 'center', height: '60px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => togglePanel('menu')} className="btn-icon" style={{ background: activePanel === 'menu' ? 'var(--primary)' : 'transparent', color: activePanel === 'menu' ? '#fff' : 'var(--text-color)' }}>
            <Menu size={24} />
          </button>
          <button onClick={() => togglePanel('widgets')} className="btn-icon" style={{ background: activePanel === 'widgets' ? 'var(--primary)' : 'transparent', color: activePanel === 'widgets' ? '#fff' : 'var(--text-color)' }}>
            <LayoutGrid size={24} />
          </button>
        </div>
        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Server size={20} /> CasaOS
        </div>
      </div>

      {/* Mobile Overlay */}
      {isMobile && activePanel && (
        <div 
          style={{ position: 'fixed', top: '60px', left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 90 }}
          onClick={closeMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`sidebar ${activePanel ? 'open' : 'closed'} ${isMobile ? 'mobile' : 'desktop'}`} style={{ 
        width: activePanel ? (isMobile ? '280px' : '300px') : '70px', 
        padding: activePanel ? '20px' : '20px 10px',
        overflowY: 'auto'
      }}>
        
        {/* Desktop Buttons */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: activePanel ? 'flex-start' : 'center' }}>
            <button 
              onClick={() => togglePanel('menu')} 
              className="btn-icon" 
              style={{ 
                background: activePanel === 'menu' ? 'var(--primary)' : 'transparent', 
                color: activePanel === 'menu' ? '#fff' : 'var(--text-color)',
                width: '40px', height: '40px', borderRadius: '12px'
              }}
              title="Menu"
            >
              <Menu size={24} />
            </button>
            <button 
              onClick={() => togglePanel('widgets')} 
              className="btn-icon"
              style={{ 
                background: activePanel === 'widgets' ? 'var(--primary)' : 'transparent', 
                color: activePanel === 'widgets' ? '#fff' : 'var(--text-color)',
                width: '40px', height: '40px', borderRadius: '12px'
              }}
              title="Widget"
            >
              <LayoutGrid size={24} />
            </button>
          </div>
        )}

        {/* Panel Content */}
        {activePanel === 'menu' && (
          <div className="sidebar-menu-content" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
          <div className="sidebar-widgets-content" style={{ display: 'flex', flexDirection: 'column', gap: '15px', paddingBottom: '20px' }}>
            {/* Widget items rendered vertically */}
            <div className="glass widget" style={{ padding: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8, marginBottom: '5px' }}>
                <Cpu size={18} /> <span>CPU ({stats.cpu?.cores || 0} Core)</span>
              </div>
              <div className="value" style={{ fontSize: '1.5rem' }}>{stats.cpu?.load || 0}%</div>
              <progress value={stats.cpu?.load || 0} max="100" style={{ width: '100%', height: '6px', marginTop: '5px' }}></progress>
              <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '4px' }}>
                {stats.cpu?.temperature != null ? `${Math.round(stats.cpu.temperature)}°C` : 'Temp N/A'}
              </div>
            </div>

            <div className="glass widget" style={{ padding: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8, marginBottom: '5px' }}>
                <MemoryStick size={18} /> <span>RAM</span>
              </div>
              <div className="value" style={{ fontSize: '1.5rem' }}>{stats.memory?.percent || 0}%</div>
              <progress value={stats.memory?.percent || 0} max="100" style={{ width: '100%', height: '6px', marginTop: '5px' }}></progress>
              <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '4px' }}>
                {((stats.memory?.used || 0) / 1024 / 1024 / 1024).toFixed(1)} GB / {((stats.memory?.total || 0) / 1024 / 1024 / 1024).toFixed(1)} GB
              </div>
            </div>

            <div className="glass widget" style={{ padding: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8, marginBottom: '5px' }}>
                <HardDrive size={18} /> <span>Disco Primario</span>
              </div>
              <div className="value" style={{ fontSize: '1.5rem' }}>{stats.disk?.percent || 0}%</div>
              <progress value={stats.disk?.percent || 0} max="100" style={{ width: '100%', height: '6px', marginTop: '5px' }}></progress>
              <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '4px' }}>
                {((stats.disk?.used || 0) / 1024 / 1024 / 1024).toFixed(1)} GB / {((stats.disk?.total || 0) / 1024 / 1024 / 1024).toFixed(1)} GB
              </div>
            </div>

            <div className="glass widget" style={{ padding: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8, marginBottom: '5px' }}>
                <Activity size={18} /> <span>Container Attivi</span>
              </div>
              <div className="value" style={{ fontSize: '1.5rem' }}>{containers ? containers.filter(c => c.State === 'running').length : 0} <span style={{fontSize: '0.9rem', color: 'var(--text-color)', fontWeight: 'normal'}}>su {containers ? containers.length : 0}</span></div>
              <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '4px' }}>OS: {stats.os?.distro || 'Sconosciuto'}</div>
            </div>

            <div className="glass widget" style={{ padding: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8, marginBottom: '10px' }}>
                <Globe size={18} /> <span>Rete</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowDown size={14} color="#10b981" /> Down</span>
                  <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>{stats.network?.rx_sec != null ? formatSpeed(stats.network.rx_sec) : '0 B/s'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowUp size={14} color="#3b82f6" /> Up</span>
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
