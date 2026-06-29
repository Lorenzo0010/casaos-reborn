import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Monitor, Server, Box, Terminal as TermIcon, Moon, Sun, LogOut } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Containers from './pages/Containers';
import AppStore from './pages/AppStore';
import TerminalPage from './pages/Terminal';
import Login from './pages/Login';

function App() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  if (!token) {
    return <Login setToken={setToken} />;
  }

  return (
    <Router>
      <div className="layout">
        <aside className="sidebar">
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Server /> CasaOS Reborn
          </div>
          <NavLink to="/" className={({isActive}) => isActive ? 'active' : ''}><Monitor /> Dashboard</NavLink>
          <NavLink to="/containers" className={({isActive}) => isActive ? 'active' : ''}><Box /> Containers</NavLink>
          <NavLink to="/appstore" className={({isActive}) => isActive ? 'active' : ''}><Box /> App Store</NavLink>
          <NavLink to="/terminal" className={({isActive}) => isActive ? 'active' : ''}><TermIcon /> Terminal</NavLink>
          
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={toggleTheme} className="btn" style={{ background: 'transparent', border: '1px solid var(--card-border)', color: 'var(--text-color)' }}>
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />} Toggle Theme
            </button>
            <button onClick={logout} className="btn btn-danger">
              <LogOut size={18} /> Logout
            </button>
          </div>
        </aside>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/containers" element={<Containers />} />
            <Route path="/appstore" element={<AppStore />} />
            <Route path="/terminal" element={<TerminalPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
