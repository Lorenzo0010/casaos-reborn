import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import NewContainer from './pages/NewContainer';
import TerminalPage from './pages/Terminal';
import Login from './pages/Login';
import Sidebar from './components/Sidebar';
import Settings from './pages/Settings';
import SystemLogs from './pages/SystemLogs';

function App() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'auto');
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [preferences, setPreferences] = useState(null);
  const [actualTheme, setActualTheme] = useState('light');

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
  }, [token, theme]);

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
      } else if (bgTheme === 'lightgray') {
        root.style.setProperty('--bg-color', '#e5e7eb');
        root.style.setProperty('--text-color', '#111827');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.7)');
        root.style.setProperty('--sidebar-bg', '#f3f4f6');
      } else if (bgTheme === 'mediumgray') {
        root.style.setProperty('--bg-color', '#e5e7eb');
        root.style.setProperty('--text-color', '#111827');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.7)');
        root.style.setProperty('--sidebar-bg', '#f3f4f6');
      } else if (bgTheme === 'darkgray') {
        root.style.setProperty('--bg-color', '#d1d5db');
        root.style.setProperty('--text-color', '#030712');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.6)');
        root.style.setProperty('--sidebar-bg', '#e5e7eb');
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
      } else if (bgTheme === 'purple') {
        root.style.setProperty('--bg-color', '#f3e8ff');
        root.style.setProperty('--text-color', '#3b0764');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.7)');
        root.style.setProperty('--sidebar-bg', '#faf5ff');
      } else if (bgTheme === 'forest') {
        root.style.setProperty('--bg-color', '#dcfce7');
        root.style.setProperty('--text-color', '#064e3b');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.7)');
        root.style.setProperty('--sidebar-bg', '#f0fdf4');
      } else if (bgTheme === 'mocha') {
        root.style.setProperty('--bg-color', '#ffedd5');
        root.style.setProperty('--text-color', '#431407');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.7)');
        root.style.setProperty('--sidebar-bg', '#fff7ed');
      } else if (bgTheme === 'anthracite') {
        root.style.setProperty('--bg-color', '#e4e4e7');
        root.style.setProperty('--text-color', '#18181b');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.7)');
        root.style.setProperty('--sidebar-bg', '#f4f4f5');
      } else if (bgTheme === 'ocean') {
        root.style.setProperty('--bg-color', '#cffafe');
        root.style.setProperty('--text-color', '#164e63');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.7)');
        root.style.setProperty('--sidebar-bg', '#ecfeff');
      } else if (bgTheme === 'military') {
        root.style.setProperty('--bg-color', '#e9edc9');
        root.style.setProperty('--text-color', '#3f4a3c');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.7)');
        root.style.setProperty('--sidebar-bg', '#fefae0');
      } else if (bgTheme === 'rust') {
        root.style.setProperty('--bg-color', '#ffedbf');
        root.style.setProperty('--text-color', '#7c2d12');
        root.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.7)');
        root.style.setProperty('--sidebar-bg', '#fff7ed');
      }
    } else {
      // Dark Mode
      if (bgTheme === 'gray') {
        root.style.setProperty('--bg-color', '#111827');
        root.style.setProperty('--text-color', '#f9fafb');
        root.style.setProperty('--card-bg', 'rgba(31, 41, 55, 0.7)');
        root.style.setProperty('--sidebar-bg', '#1f2937');
      } else if (bgTheme === 'lightgray') {
        root.style.setProperty('--bg-color', '#4b5563');
        root.style.setProperty('--text-color', '#f9fafb');
        root.style.setProperty('--card-bg', 'rgba(107, 114, 128, 0.7)');
        root.style.setProperty('--sidebar-bg', '#6b7280');
      } else if (bgTheme === 'mediumgray') {
        root.style.setProperty('--bg-color', '#374151');
        root.style.setProperty('--text-color', '#f9fafb');
        root.style.setProperty('--card-bg', 'rgba(75, 85, 99, 0.7)');
        root.style.setProperty('--sidebar-bg', '#4b5563');
      } else if (bgTheme === 'darkgray') {
        root.style.setProperty('--bg-color', '#1f2937');
        root.style.setProperty('--text-color', '#f9fafb');
        root.style.setProperty('--card-bg', 'rgba(55, 65, 81, 0.7)');
        root.style.setProperty('--sidebar-bg', '#374151');
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
      } else if (bgTheme === 'purple') {
        root.style.setProperty('--bg-color', '#2e1065');
        root.style.setProperty('--text-color', '#f3e8ff');
        root.style.setProperty('--card-bg', 'rgba(59, 7, 100, 0.7)');
        root.style.setProperty('--sidebar-bg', '#3b0764');
      } else if (bgTheme === 'forest') {
        root.style.setProperty('--bg-color', '#022c22');
        root.style.setProperty('--text-color', '#d1fae5');
        root.style.setProperty('--card-bg', 'rgba(6, 78, 59, 0.7)');
        root.style.setProperty('--sidebar-bg', '#064e3b');
      } else if (bgTheme === 'mocha') {
        root.style.setProperty('--bg-color', '#2e1008');
        root.style.setProperty('--text-color', '#ffedd5');
        root.style.setProperty('--card-bg', 'rgba(67, 20, 7, 0.7)');
        root.style.setProperty('--sidebar-bg', '#431407');
      } else if (bgTheme === 'anthracite') {
        root.style.setProperty('--bg-color', '#18181b');
        root.style.setProperty('--text-color', '#f4f4f5');
        root.style.setProperty('--card-bg', 'rgba(39, 39, 42, 0.7)');
        root.style.setProperty('--sidebar-bg', '#27272a');
      } else if (bgTheme === 'ocean') {
        root.style.setProperty('--bg-color', '#083344');
        root.style.setProperty('--text-color', '#cffafe');
        root.style.setProperty('--card-bg', 'rgba(22, 78, 99, 0.7)');
        root.style.setProperty('--sidebar-bg', '#164e63');
      } else if (bgTheme === 'military') {
        root.style.setProperty('--bg-color', '#333d29');
        root.style.setProperty('--text-color', '#e9edc9');
        root.style.setProperty('--card-bg', 'rgba(65, 72, 51, 0.7)');
        root.style.setProperty('--sidebar-bg', '#414833');
      } else if (bgTheme === 'rust') {
        root.style.setProperty('--bg-color', '#451a03');
        root.style.setProperty('--text-color', '#ffedd5');
        root.style.setProperty('--card-bg', 'rgba(124, 45, 18, 0.7)');
        root.style.setProperty('--sidebar-bg', '#7c2d12');
      }
    }
  };

  const savePreferences = async (newPrefs) => {
    // Aggiornamento ottimistico per un feedback istantaneo
    setPreferences(newPrefs);
    applyCustomStyles(newPrefs, theme);
    
    try {
      await fetch('/api/system/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newPrefs)
      });
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
        <Sidebar logout={logout} />

        <div className="main-content">
          <div className="main-scrollable">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/new" element={<NewContainer />} />
              <Route path="/terminal" element={<TerminalPage />} />
              <Route path="/logs" element={<SystemLogs />} />
              <Route path="/settings" element={<Settings theme={theme} toggleTheme={toggleTheme} preferences={preferences || {}} onSave={savePreferences} />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        </div>
      </div>
      
    </Router>
  );
}

export default App;
