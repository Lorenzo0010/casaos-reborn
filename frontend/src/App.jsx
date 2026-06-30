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
  }, [theme]);

  // Fetch preferences on mount or token change
  useEffect(() => {
    if (token) {
      fetch('/api/system/preferences', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        setPreferences(data);
        applyCustomStyles(data, theme);
      })
      .catch(console.error);
    }
  }, [token, theme]);

  const applyCustomStyles = (prefs, currentTheme) => {
    if (!prefs) return;
    const root = document.documentElement;
    if (prefs.accentColor) root.style.setProperty('--primary', prefs.accentColor);
    
    if (currentTheme === 'light' && prefs.bgColor) {
      root.style.setProperty('--bg-color', prefs.bgColor);
    } else if (currentTheme === 'dark' && prefs.darkBgColor) {
      root.style.setProperty('--bg-color', prefs.darkBgColor);
    } else {
      // Reset background if not specified in preferences
      root.style.removeProperty('--bg-color');
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
