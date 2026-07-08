import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Monitor, Server, Box, Terminal as TermIcon, LogOut, PlusSquare, Menu, X, ChevronLeft, ChevronRight, Wrench } from 'lucide-react';

export default function Sidebar({ logout }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
        <NavLink to="/new" onClick={closeMobile} className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
          <PlusSquare /> <span className="sidebar-link-text">New Container</span>
        </NavLink>
        <NavLink to="/terminal" onClick={closeMobile} className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
          <TermIcon /> <span className="sidebar-link-text">Terminal</span>
        </NavLink>
        <NavLink to="/advanced" onClick={closeMobile} className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
          <Wrench /> <span className="sidebar-link-text">Avanzate</span>
        </NavLink>
        
        {/* Footer actions */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={logout} className="btn sidebar-link logout-btn" style={{ background: 'transparent', border: '1px solid var(--card-border)', color: 'var(--text-color)', padding: isCollapsed ? '8px' : '8px 15px' }}>
            <LogOut size={18} /> 
            <span className="sidebar-link-text">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
