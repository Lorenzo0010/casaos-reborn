import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import NewContainer from './pages/NewContainer';
import TerminalPage from './pages/Terminal';
import Login from './pages/Login';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';

function App() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (token) {
      fetch('/api/system/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ theme })
      }).catch(console.error);
    }
  }, [theme, token]);

  // Fetch preferences on mount or token change
  useEffect(() => {
    if (token) {
      fetch('/api/system/preferences', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.theme) {
          setTheme(data.theme);
        }
        setPreferences(data);
        applyCustomStyles(data, data.theme || theme);
      })
      .catch(console.error);
    }
  }, [token, theme]);

  const getContrastColor = (hex) => {
    if (!hex) return '#ffffff';
    let r = parseInt(hex.substr(1, 2), 16);
    let g = parseInt(hex.substr(3, 2), 16);
    let b = parseInt(hex.substr(5, 2), 16);
    let yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
  };

  const applyCustomStyles = (prefs, currentTheme) => {
    if (!prefs) return;
    const root = document.documentElement;
    
    // Primary Color & Contrast
    const primary = prefs.accentColor || '#3b82f6';
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--primary-text', getContrastColor(primary));

    // Background Themes
    const bgTheme = prefs.bgTheme || 'gray';
    
    if (currentTheme === 'light') {
      if (bgTheme === 'gray') {
        root.style.setProperty('--bg-color', '#f3f4f6');
        root.style.setProperty('--text-color', '#1f2937');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.7)');
        root.style.setProperty('--sidebar-bg', '#ffffff');
      } else if (bgTheme === 'black') {
        root.style.setProperty('--bg-color', '#e5e7eb');
        root.style.setProperty('--text-color', '#000000');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.7)');
        root.style.setProperty('--sidebar-bg', '#ffffff');
      } else if (bgTheme === 'navy') {
        root.style.setProperty('--bg-color', '#e0e7ff');
        root.style.setProperty('--text-color', '#1e1b4b');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.7)');
        root.style.setProperty('--sidebar-bg', '#eef2ff');
      } else if (bgTheme === 'red') {
        root.style.setProperty('--bg-color', '#ffe4e6');
        root.style.setProperty('--text-color', '#4c0519');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.7)');
        root.style.setProperty('--sidebar-bg', '#fff1f2');
      }
    } else {
      // Dark Mode
      if (bgTheme === 'gray') {
        root.style.setProperty('--bg-color', '#111827');
        root.style.setProperty('--text-color', '#f9fafb');
        root.style.setProperty('--card-bg', 'rgba(31, 41, 55, 0.7)');
        root.style.setProperty('--sidebar-bg', '#1f2937');
      } else if (bgTheme === 'black') {
        root.style.setProperty('--bg-color', '#000000');
        root.style.setProperty('--text-color', '#ffffff');
        root.style.setProperty('--card-bg', 'rgba(20, 20, 20, 0.7)');
        root.style.setProperty('--sidebar-bg', '#0a0a0a');
      } else if (bgTheme === 'navy') {
        root.style.setProperty('--bg-color', '#020617');
        root.style.setProperty('--text-color', '#f8fafc');
        root.style.setProperty('--card-bg', 'rgba(15, 23, 42, 0.7)');
        root.style.setProperty('--sidebar-bg', '#0f172a');
      } else if (bgTheme === 'red') {
        root.style.setProperty('--bg-color', '#2a040d');
        root.style.setProperty('--text-color', '#fff1f2');
        root.style.setProperty('--card-bg', 'rgba(67, 10, 23, 0.7)');
        root.style.setProperty('--sidebar-bg', '#4c0519');
      }
    }
  };

  const savePreferences = async (newPrefs) => {
    try {
      await fetch('/api/system/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newPrefs)
      });
      setPreferences(newPrefs);
      applyCustomStyles(newPrefs, theme);
    } catch (e) {
      console.error(e);
    }
  };

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
        <Sidebar theme={theme} toggleTheme={toggleTheme} logout={logout} openSettings={() => setIsSettingsOpen(true)} />

        <div className="main-content">
          <div className="main-scrollable">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/new" element={<NewContainer />} />
              <Route path="/terminal" element={<TerminalPage />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        </div>
      </div>
      
      {isSettingsOpen && (
        <SettingsModal 
          onClose={() => setIsSettingsOpen(false)} 
          preferences={preferences || {}} 
          onSave={savePreferences} 
        />
      )}
    </Router>
  );
}

export default App;
