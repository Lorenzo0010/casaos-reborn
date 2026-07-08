import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Wrench, Palette, Save, RefreshCcw, Moon, Sun, Terminal, RefreshCw, Trash2, ArrowDown, LogOut, ArrowUpCircle } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import { io } from 'socket.io-client';

export default function Advanced({ theme, actualTheme, setTheme, preferences, onSave, logout }) {
  // ─── UI Settings state ───
  const [accentColor, setAccentColor] = useState(preferences?.accentColor || '#3b82f6');
  const [bgTheme, setBgTheme] = useState(preferences?.bgTheme || 'gray');
  const [isSaving, setIsSaving] = useState(false);

  // ─── System Logs state ───
  const [logs, setLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(true);
  const logsEndRef = useRef(null);

  // ─── Updates state ───
  const [updates, setUpdates] = useState([]);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [checkStatus, setCheckStatus] = useState(null);

  const { showAlert, showConfirm } = useDialog();

  // Sync accent/bgTheme when preferences change externally
  useEffect(() => {
    if (preferences?.accentColor) setAccentColor(preferences.accentColor);
    if (preferences?.bgTheme) setBgTheme(preferences.bgTheme);
  }, [preferences]);

  // ═══════════════════════════════════════
  // UI Settings logic
  // ═══════════════════════════════════════

  const predefinedAccents = [
    { name: 'Rosso', hex: '#ef4444' },
    { name: 'Arancione', hex: '#f97316' },
    { name: 'Giallo', hex: '#eab308' },
    { name: 'Giallo Cyber', hex: '#facc15' },
    { name: 'Smeraldo', hex: '#10b981' },
    { name: 'Azzurro', hex: '#0ea5e9' },
    { name: 'Blu CasaOS', hex: '#3b82f6' },
    { name: 'Viola', hex: '#8b5cf6' },
    { name: 'Rosa', hex: '#ec4899' },
  ];

  const predefinedBackgrounds = [
    { id: 'gray', name: 'Grigio Scuro', lightHex: '#e5e7eb', darkHex: '#1f2937' },
    { id: 'mediumgray', name: 'Grigio Medio', lightHex: '#d1d5db', darkHex: '#374151' },
    { id: 'anthracite', name: 'Antracite', lightHex: '#e4e4e7', darkHex: '#18181b' },
    { id: 'black', name: 'Total Black', lightHex: '#e5e7eb', darkHex: '#000000' },
    { id: 'navy', name: 'Blu Scuro', lightHex: '#e0e7ff', darkHex: '#020617' },
    { id: 'ocean', name: 'Verde Petrolio', lightHex: '#cffafe', darkHex: '#083344' },
    { id: 'red', name: 'Rosso Scuro', lightHex: '#ffe4e6', darkHex: '#2a040d' },
  ];

  const handleReset = async () => {
    setIsSaving(true);
    await onSave({
      ...preferences,
      accentColor: '#3b82f6',
      bgTheme: 'gray'
    });
    setAccentColor('#3b82f6');
    setBgTheme('gray');
    setIsSaving(false);
  };

  // ═══════════════════════════════════════
  // System Logs logic
  // ═══════════════════════════════════════

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/system/logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(res.data);
    } catch (err) {
      console.error(err);
      showAlert('Errore', 'Failed to fetch logs: ' + (err.response?.data?.error || err.message), true);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchUpdates();

    const token = localStorage.getItem('token');
    const socket = io(window.location.origin, {
      auth: { token, type: 'web' }
    });

    socket.on('updater.status', (data) => {
      if (data.status === 'checking') {
        setIsCheckingUpdates(true);
        setCheckStatus({ container: data.container, action: data.action, percentage: data.percentage });
      }
      if (data.status === 'idle') {
        setIsCheckingUpdates(false);
        setCheckStatus(null);
        fetchUpdates();
      }
    });

    socket.on('updater.results', (data) => {
      setUpdates(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const clearLogs = async () => {
    const confirmed = await showConfirm('Svuota Log', 'Sei sicuro di voler svuotare tutti i log di sistema? Questa azione non può essere annullata.');
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete('/api/system/logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs('');
    } catch (err) {
      showAlert('Errore', 'Failed to clear logs: ' + (err.response?.data?.error || err.message), true);
    }
  };

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Funzione per colorare le righe di errore
  const renderLogLines = () => {
    if (!logs) return 'Nessun log disponibile.';
    return logs.split('\n').map((line, idx) => {
      const isError = line.includes('[ERROR]');
      return (
        <div key={idx} style={{ color: isError ? '#ef4444' : 'inherit' }}>
          {line}
        </div>
      );
    });
  };

  // ═══════════════════════════════════════
  // Docker Updates & Prune logic
  // ═══════════════════════════════════════

  const fetchUpdates = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/docker/updates', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        setUpdates(res.data.updates || []);
        if (res.data.status?.isChecking) {
          setIsCheckingUpdates(true);
          setCheckStatus(res.data.status.currentTask);
        } else {
          setIsCheckingUpdates(false);
          setCheckStatus(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const triggerUpdateCheck = async () => {
    try {
      setIsCheckingUpdates(true);
      const token = localStorage.getItem('token');
      await axios.post('/api/docker/check-updates', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error(err);
      setIsCheckingUpdates(false);
      showAlert('Errore', 'Impossibile avviare la ricerca aggiornamenti.', true);
    }
  };

  const handlePruneImages = async () => {
    const confirmed = await showConfirm('Pulizia Immagini', 'Sei sicuro di voler eliminare tutte le immagini Docker non utilizzate da alcun container?');
    if (!confirmed) return;
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/docker/images/prune`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const deletedSpace = (res.data.result?.SpaceReclaimed || 0) / 1024 / 1024;
      showAlert('Pulizia Completata', `Spazio liberato: ${deletedSpace.toFixed(2)} MB`);
    } catch (err) {
      showAlert('Errore', `Errore durante la pulizia delle immagini: ` + err.message, true);
    }
  };

  // ═══════════════════════════════════════
  // Render
  // ═══════════════════════════════════════

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      
      <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 4px 0' }}>
        <Wrench /> Avanzate
      </h1>

      {/* ─── Section 1: UI Settings ─── */}
      <div className="widget glass">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <Palette /> Impostazioni UI
        </h2>
        
        <div className="casaos-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="input-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Tema Dark Mode {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
              <select value={theme} onChange={(e) => {
                setTheme(e.target.value);
                onSave({ ...preferences, theme: e.target.value });
              }} style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--bg-color)', color: 'var(--text-color)' }}>
                <option value="light">Chiaro</option>
                <option value="dark">Scuro</option>
                <option value="auto">Auto (Sistema)</option>
              </select>
            </div>
          </div>

          <div className="input-group" style={{ marginTop: '10px' }}>
            <label>Colore Accento</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '5px' }}>
              {predefinedAccents.map(color => (
                <button
                  key={color.hex}
                  type="button"
                  title={color.name}
                  onClick={() => {
                    setAccentColor(color.hex);
                    onSave({ ...preferences, accentColor: color.hex, bgTheme });
                  }}
                  style={{
                    width: '40px', height: '40px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                    backgroundColor: color.hex,
                    boxShadow: accentColor === color.hex ? `0 0 0 3px var(--card-bg), 0 0 0 5px ${color.hex}` : 'none',
                    transition: 'all 0.2s'
                  }}
                />
              ))}
            </div>
          </div>

          <div className="input-group" style={{ marginTop: '10px' }}>
            <label>Sfondo Adattivo (Light/Dark)</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '5px' }}>
              {predefinedBackgrounds.map(bg => {
                const currentHex = actualTheme === 'dark' ? bg.darkHex : bg.lightHex;
                return (
                  <button
                    key={bg.id}
                    type="button"
                    title={bg.name}
                    onClick={() => {
                      setBgTheme(bg.id);
                      onSave({ ...preferences, accentColor, bgTheme: bg.id });
                    }}
                    style={{
                      width: '40px', height: '40px', borderRadius: '50%', border: '1px solid var(--card-border)', cursor: 'pointer',
                      backgroundColor: currentHex,
                      boxShadow: bgTheme === bg.id ? `0 0 0 3px var(--card-bg), 0 0 0 5px var(--primary)` : 'none',
                      transition: 'all 0.2s',
                      position: 'relative'
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '20px', borderTop: '1px solid var(--card-border)', paddingTop: '20px' }}>
            <button type="button" className="btn btn-action danger" onClick={handleReset} disabled={isSaving}>
              <RefreshCcw size={16} /> Ripristina Default
            </button>
          </div>
        </div>
      </div>

      {/* ─── Section 2: System Logs ─── */}
      <div className="widget glass" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Terminal size={24} /> Log di Sistema
          </h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn" onClick={fetchLogs} title="Aggiorna Logs" style={{ background: 'var(--card-bg)' }}>
              <RefreshCw size={18} className={logsLoading ? 'spin' : ''} style={{ marginRight: '5px' }} /> Aggiorna
            </button>
            <button className="btn" onClick={scrollToBottom} title="Scorri alla fine" style={{ background: 'var(--card-bg)' }}>
              <ArrowDown size={18} style={{ marginRight: '5px' }} /> Fine
            </button>
            <button className="btn btn-danger" onClick={clearLogs} title="Svuota Logs">
              <Trash2 size={18} style={{ marginRight: '5px' }} /> Svuota
            </button>
          </div>
        </div>

        <div className="glass" style={{ height: '350px', backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '15px', borderRadius: '8px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {logsLoading && !logs ? 'Caricamento logs in corso...' : renderLogLines()}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* ─── Section 3: Docker Maintenance & Updates ─── */}
      <div className="widget glass" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 5px 0', borderBottom: '1px solid var(--card-border)', paddingBottom: '10px' }}>
          <ArrowUpCircle size={20} /> Gestione Docker & Aggiornamenti
        </h2>
        
        {/* Updates Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>Aggiornamenti Immagini</h3>
            <p style={{ margin: 0, opacity: 0.7, fontSize: '0.9rem' }}>
              Cerca nuove versioni delle immagini per i container in esecuzione.
            </p>
          </div>
          <button 
            className="btn btn-primary" 
            onClick={triggerUpdateCheck} 
            disabled={isCheckingUpdates}
            style={{ padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
          >
            <RefreshCw size={16} className={isCheckingUpdates ? 'spin' : ''} />
            {isCheckingUpdates ? 'Ricerca in corso...' : 'Controlla Ora'}
          </button>
        </div>

        {isCheckingUpdates && checkStatus && checkStatus.container && (
          <div style={{ padding: '15px', background: 'var(--bg-color)', borderRadius: '10px', border: '1px solid var(--card-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
              <span>Scansione: <strong>{checkStatus.container}</strong></span>
              <span style={{ opacity: 0.8 }}>{checkStatus.action}</span>
            </div>
            <div style={{ height: '4px', background: 'var(--card-bg)', borderRadius: '2px', overflow: 'hidden' }}>
              <div className="progress-bar-inner" style={{ width: '100%', height: '100%', background: 'var(--primary)', animation: 'pulse 1s infinite' }}></div>
            </div>
          </div>
        )}

        {updates.length > 0 && !isCheckingUpdates && (
          <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '15px', borderRadius: '10px', border: '1px solid var(--danger)' }}>
            <h4 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }}></div>
              Container da aggiornare ({updates.length})
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {updates.map(upd => (
                <div key={upd.id} style={{ background: 'var(--bg-color)', padding: '10px', borderRadius: '6px', border: '1px solid var(--card-border)' }}>
                  <div style={{ fontWeight: '600', marginBottom: '2px' }}>{upd.name}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.6, wordBreak: 'break-all' }}>{upd.image}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ width: '100%', height: '1px', background: 'var(--card-border)', margin: '5px 0' }}></div>

        {/* Prune Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>Pulizia Sistema</h3>
            <p style={{ margin: 0, opacity: 0.7, fontSize: '0.9rem' }}>Rimuovi le immagini docker orfane per liberare spazio su disco.</p>
          </div>
          <button className="btn btn-danger" onClick={handlePruneImages} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: '8px' }}>
            <Trash2 size={16} style={{ marginRight: '8px' }} />
            Pulisci Immagini
          </button>
        </div>
      </div>

      {/* ─── Section 4: Logout ─── */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
        <button 
          onClick={logout} 
          className="btn" 
          style={{ 
            display: 'flex', alignItems: 'center', gap: '8px', 
            padding: '10px 28px', 
            background: 'transparent', 
            border: '1px solid var(--card-border)', 
            color: 'var(--text-color)', 
            borderRadius: '10px',
            opacity: 0.7,
            transition: 'all 0.2s'
          }}
          onMouseOver={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}
          onMouseOut={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-color)'; }}
        >
          <LogOut size={18} /> Logout
        </button>
      </div>

    </div>
  );
}
