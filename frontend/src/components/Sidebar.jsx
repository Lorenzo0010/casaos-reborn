import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Monitor, Server, Terminal as TermIcon, Menu, X, ChevronLeft, ChevronRight, Wrench, Folder, ArrowUpCircle } from 'lucide-react';
import axios from 'axios';
import { io } from 'socket.io-client';

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [updateCount, setUpdateCount] = useState(0);

  useEffect(() => {
    const fetchUpdateCount = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await axios.get('/api/docker/updates', { headers: { Authorization: `Bearer ${token}` } });
        setUpdateCount(res.data ? res.data.length : 0);
      } catch (err) {}
    };

    fetchUpdateCount();

    const token = localStorage.getItem('token');
    const socket = io(window.location.origin, {
      auth: { token, type: 'web' }
    });

    socket.on('updater.results', (data) => {
      setUpdateCount(data ? data.length : 0);
    });

    return () => socket.disconnect();
  }, []);

  // Close mobile sidebar on window resize if it gets large
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      {/* Mobile Header (Hamburger Menu) */}
      <div className="mobile-header">
        <button onClick={() => setMobileOpen(true)} className="btn-icon">
          <Menu size={24} />
        </button>
        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Server size={20} /> CasaOS
        </div>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 90 }}
          onClick={closeMobile}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        
        {/* Header / Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', display: isCollapsed ? 'none' : 'flex', alignItems: 'center', gap: '8px' }}>
            <Server /> CasaOS
          </div>
          
          {/* Desktop collapse toggle */}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)} 
            className="btn-icon" 
            style={{ display: window.innerWidth > 768 ? 'block' : 'none' }}
          >
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
          
          {/* Mobile close button */}
          <button 
            onClick={closeMobile} 
            className="btn-icon" 
            style={{ display: window.innerWidth <= 768 ? 'block' : 'none' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Links */}
        <NavLink to="/" onClick={closeMobile} className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
          <Monitor /> <span className="sidebar-link-text">Dashboard</span>
        </NavLink>
        <NavLink to="/files" onClick={closeMobile} className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
          <Folder /> <span className="sidebar-link-text">Files</span>
        </NavLink>
        <NavLink to="/terminal" onClick={closeMobile} className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
          <TermIcon /> <span className="sidebar-link-text">Terminal</span>
        </NavLink>
        <NavLink to="/updates" onClick={closeMobile} className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'} style={{ position: 'relative' }}>
          <ArrowUpCircle /> 
          <span className="sidebar-link-text" style={{ flex: 1 }}>Aggiornamenti</span>
          {updateCount > 0 && !isCollapsed && (
            <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
              {updateCount}
            </span>
          )}
          {updateCount > 0 && isCollapsed && (
            <span style={{ position: 'absolute', top: '10px', right: '10px', background: '#ef4444', width: '8px', height: '8px', borderRadius: '50%' }}></span>
          )}
        </NavLink>
        <NavLink to="/advanced" onClick={closeMobile} className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
          <Wrench /> <span className="sidebar-link-text">Avanzate</span>
        </NavLink>

      </aside>
    </>
  );
}
