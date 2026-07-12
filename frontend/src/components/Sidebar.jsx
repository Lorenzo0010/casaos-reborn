import React from 'react';
import { NavLink } from 'react-router-dom';
import { Monitor, Terminal as TermIcon, Wrench, Folder, ChevronLeft, ChevronRight } from 'lucide-react';
import WidgetsPanel from './WidgetsPanel';

export default function Sidebar({ activePanel, togglePanel, isMobile, isCollapsed, setIsCollapsed }) {
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

        {activePanel === 'widgets' && (
          <WidgetsPanel />
        )}

      </aside>
    </>
  );
}
