import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import NewContainer from './pages/NewContainer';
import TerminalPage from './pages/Terminal';
import Login from './pages/Login';
import Sidebar from './components/Sidebar';
import Advanced from './pages/Advanced';
import FileManager from './pages/FileManager';
import AppStore from './pages/AppStore';

export const predefinedThemes = [
  { 
    id: 'monochrome', name: 'Monochrome', 
    primary: '#71717a', 
    darkBg: '#000000', darkSurface: '#121212',
    lightBg: '#e4e4e7', lightSurface: '#ffffff'
  },
  { 
    id: 'dark_gray', name: 'Grigio Scuro', 
    primary: '#737373', 
    darkBg: '#1e1e1e', darkSurface: '#2d2d2d',
    lightBg: '#e5e5e5', lightSurface: '#ffffff'
  },
  { 
    id: 'navy', name: 'Ocean', 
    primary: '#3b82f6', 
    darkBg: '#020617', darkSurface: '#0f172a',
    lightBg: '#e2e8f0', lightSurface: '#ffffff'
  },
  { 
    id: 'forest', name: 'Emerald', 
    primary: '#10b981', 
    darkBg: '#022c22', darkSurface: '#064e3b',
    lightBg: '#d1fae5', lightSurface: '#ffffff'
  },
  { 
    id: 'red', name: 'Ruby', 
    primary: '#f43f5e', 
    darkBg: '#2a040d', darkSurface: '#4c0519',
    lightBg: '#ffe4e6', lightSurface: '#ffffff'
  },
  { 
    id: 'rust', name: 'Amber', 
    primary: '#f59e0b', 
    darkBg: '#451a03', darkSurface: '#78350f',
    lightBg: '#fef3c7', lightSurface: '#ffffff'
  },
  { 
    id: 'purple', name: 'Amethyst', 
    primary: '#8b5cf6', 
    darkBg: '#2e1065', darkSurface: '#4c1d95',
    lightBg: '#ede9fe', lightSurface: '#ffffff'
  }
];

function App() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'auto');
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [preferences, setPreferences] = useState(null);
  const [actualTheme, setActualTheme] = useState('light');

  const isMobileInitial = window.innerWidth < 768;
  const [activePanel, setActivePanel] = useState(null);
  const [isMobile, setIsMobile] = useState(isMobileInitial);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const togglePanel = (panel) => {
    if (activePanel === panel) {
      setActivePanel(null); // Close if already open
    } else {
      setActivePanel(panel);
    }
  };

  useEffect(() => {
    const updateActualTheme = () => {
      let current = theme;
      if (theme === 'auto') {
        current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      setActualTheme(current);
      document.documentElement.setAttribute('data-theme', current);
    };

    updateActualTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => updateActualTheme();
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);

  useEffect(() => {
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
      })
      .catch(console.error);
    }
  }, [token]);

  const getContrastColor = (hex) => {
    if (!hex) return '#ffffff';
    let r = parseInt(hex.substr(1, 2), 16);
    let g = parseInt(hex.substr(3, 2), 16);
    let b = parseInt(hex.substr(5, 2), 16);
    let yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
  };

  // Re-apply styles whenever actualTheme or preferences change
  useEffect(() => {
    if (preferences) {
      applyCustomStyles(preferences, actualTheme);
    }
  }, [actualTheme, preferences]);

  const applyCustomStyles = (prefs, currentTheme) => {
    if (!prefs) return;
    const root = document.documentElement;
    
    // We check for activeTheme or fallback to mobileTheme/bgTheme for backward compatibility, default 'navy'
    const activeThemeId = prefs.activeTheme || prefs.mobileTheme || (predefinedThemes.some(t => t.id === prefs.bgTheme) ? prefs.bgTheme : 'navy');
    const themeDef = predefinedThemes.find(t => t.id === activeThemeId) || predefinedThemes[0];
    
    // Primary Color & Contrast
    const primary = themeDef.primary;
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--primary-text', getContrastColor(primary));

    // Background Image support removed
    root.style.removeProperty('--bg-image');

    const isDark = currentTheme === 'dark';
    
    // Apply background and surface colors
    root.style.setProperty('--bg-color', isDark ? themeDef.darkBg : themeDef.lightBg);
    root.style.setProperty('--card-bg', isDark ? themeDef.darkSurface : themeDef.lightSurface);
    root.style.setProperty('--sidebar-bg', isDark ? themeDef.darkSurface : themeDef.lightSurface);
    
    if (isDark) {
      root.style.setProperty('--text-color', '#f9fafb');
      root.style.setProperty('--success', '#10b981');
      root.style.setProperty('--error', '#ef4444');
      root.style.setProperty('--danger', '#ef4444');
    } else {
      root.style.setProperty('--text-color', '#1f2937');
      root.style.setProperty('--success', '#16a34a');
      root.style.setProperty('--error', '#dc2626');
      root.style.setProperty('--danger', '#dc2626');
    }
  };

  const savePreferences = async (partialPrefs) => {
    if (!token) return;
    
    setPreferences(prev => {
      const nextPrefs = { ...(prev || {}), ...partialPrefs };
      applyCustomStyles(nextPrefs, actualTheme);
      return nextPrefs;
    });

    try {
      await fetch('/api/system/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(partialPrefs)
      });
    } catch (e) {
      console.error(e);
    }
  };


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
        <Sidebar 
          activePanel={activePanel} 
          togglePanel={togglePanel} 
          isMobile={isMobile} 
        />

        <div className="main-content">
          <div className="main-scrollable animate-fade-in">
            <Routes>
              <Route path="/" element={<Dashboard togglePanel={togglePanel} activePanel={activePanel} />} />
              <Route path="/store" element={<AppStore togglePanel={togglePanel} />} />
              <Route path="/new" element={<NewContainer togglePanel={togglePanel} />} />
              <Route path="/files" element={<FileManager togglePanel={togglePanel} />} />
              <Route path="/terminal" element={<TerminalPage togglePanel={togglePanel} />} />
              <Route path="/advanced" element={<Advanced togglePanel={togglePanel} theme={theme} actualTheme={actualTheme} setTheme={setTheme} preferences={preferences || {}} onSave={savePreferences} logout={logout} />} />
              <Route path="/settings" element={<Navigate to="/advanced" />} />
              <Route path="/logs" element={<Navigate to="/advanced" />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
