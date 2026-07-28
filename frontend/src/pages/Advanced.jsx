import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Wrench, Palette, Save, RefreshCcw, Moon, Sun, Terminal, RefreshCw, Trash2, ArrowDown, LogOut, ArrowUpCircle, Menu, Monitor } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import { io } from 'socket.io-client';
import { predefinedThemes } from '../App';

export default function Advanced({ togglePanel, theme, actualTheme, setTheme, preferences, onSave, logout }) {
  // ─── UI Settings state ───
  const initialTheme = preferences?.activeTheme || preferences?.mobileTheme || (predefinedThemes.some(t => t.id === preferences?.bgTheme) ? preferences?.bgTheme : 'navy');
  const [activeTheme, setActiveTheme] = useState(initialTheme);
  const [isSaving, setIsSaving] = useState(false);

  // ─── Notifications state ───
  const [telegramToken, setTelegramToken] = useState(preferences?.telegramToken || '');
  const [telegramChatId, setTelegramChatId] = useState(preferences?.telegramChatId || '');
  
  // ─── Widgets Settings state ───
  const [weatherCity, setWeatherCity] = useState(preferences?.weatherCity || 'Roma');
  
  // ─── System Logs state ───
  const [logs, setLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(true);
  const logsEndRef = useRef(null);

  // ─── Updates state ───
  const [updates, setUpdates] = useState([]);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [checkStatus, setCheckStatus] = useState(null);

  const { showAlert, showConfirm } = useDialog();

  // Sync activeTheme/telegram when preferences change externally
  useEffect(() => {
    if (preferences?.activeTheme || preferences?.mobileTheme || preferences?.bgTheme) {
      const newTheme = preferences.activeTheme || preferences.mobileTheme || preferences.bgTheme;
      if (predefinedThemes.some(t => t.id === newTheme)) {
        setActiveTheme(newTheme);
      }
    }
    if (preferences?.telegramToken !== undefined) setTelegramToken(preferences.telegramToken);
    if (preferences?.telegramChatId !== undefined) setTelegramChatId(preferences.telegramChatId);
    if (preferences?.weatherCity !== undefined) setWeatherCity(preferences.weatherCity);
  }, [preferences]);

  // ═══════════════════════════════════════
  // UI Settings logic
  // ═══════════════════════════════════════

  const handleReset = async () => {
    setIsSaving(true);
    await onSave({
      ...preferences,
      activeTheme: 'navy'
    });
    setActiveTheme('navy');
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
      setCheckStatus({ container: 'Inizializzazione...', action: '' });
      await axios.post('/api/docker/check-updates', {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
    } catch (error) {
      console.error('Error starting update check:', error);
      setIsCheckingUpdates(false);
      setCheckStatus(null);
      showAlert('Errore', 'Impossibile avviare la ricerca aggiornamenti.', true);
    }
  };



  const handleUpdateContainer = async (upd) => {
    if (upd.name === 'casaos-reborn') {
      window.location.href = window.location.protocol + '//' + window.location.hostname + ':1112/';
    } else {
      try {
        const token = localStorage.getItem('token');
        await axios.post(`/api/docker/containers/${upd.id}/update`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showAlert('Aggiornamento avviato', `L'aggiornamento per ${upd.name} è iniziato in background.`);
      } catch (err) {
        showAlert('Errore', `Impossibile aggiornare ${upd.name}: ${err.response?.data?.error || err.message}`, true);
      }
    }
  };

  // ═══════════════════════════════════════
  // Render
  // ═══════════════════════════════════════

  return (
    <div className="flex-col h-full">
      <div className="page-header" style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: 'var(--bg-color)',
        padding: '0 0 0 0',
        margin: '0 0 20px 0',
        borderBottom: '1px solid transparent',
        boxShadow: '0 4px 20px -10px var(--bg-color)'
      }}>
        <div className="flex items-center gap-2">
          <button onClick={() => togglePanel('menu')} className="btn-icon-only" title="Menu">
            <Menu size={24} />
          </button>
        </div>
        <h1 className="m-0 text-center font-bold flex items-center justify-center gap-2" style={{ flexGrow: 1 }}>
          <Wrench /> Avanzate
        </h1>
        <div className="flex items-center gap-2" style={{ width: '40px' }}></div>
      </div>

      <div className="flex-col gap-6" style={{ maxWidth: '900px', margin: '0 auto', width: '100%', paddingBottom: '40px' }}>

      {/* ─── Section 1: UI Settings ─── */}
      <div className="widget">
        <h2 className="flex items-center gap-2 mb-5 m-0">
          <Palette /> Impostazioni UI
        </h2>
        
        <div className="casaos-form flex-col gap-6">
          
          <div className="input-group">
            <label className="flex items-center gap-2 font-semibold">
              Modalità Tema
            </label>
            <div className="flex items-center gap-3 mt-3">
              {[
                { id: 'auto', label: 'Sistema', icon: Monitor },
                { id: 'light', label: 'Chiaro', icon: Sun },
                { id: 'dark', label: 'Scuro', icon: Moon }
              ].map(mode => {
                const isSelected = theme === mode.id;
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      setTheme(mode.id);
                      onSave({ theme: mode.id });
                    }}
                    className="flex items-center gap-2"
                    style={{
                      flex: 1,
                      justifyContent: 'center',
                      padding: '10px',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid var(--primary)' : '2px solid var(--card-border)',
                      background: isSelected ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                      color: isSelected ? 'var(--primary)' : 'var(--text-color)',
                      fontWeight: isSelected ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Icon size={18} />
                    {mode.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="input-group">
            <label className="font-semibold">Tema Grafico</label>
            <div className="flex flex-wrap gap-4 mt-3">
              {predefinedThemes.map(t => (
                <button
                  key={t.id}
                  type="button"
                  title={t.name}
                  onClick={() => {
                    setActiveTheme(t.id);
                    onSave({ activeTheme: t.id });
                  }}
                  className="flex-col items-center gap-2"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    width: '60px'
                  }}
                >
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    backgroundColor: t.primary,
                    boxShadow: activeTheme === t.id ? `0 0 0 3px var(--card-bg), 0 0 0 5px ${t.primary}` : 'none',
                    transition: 'all 0.2s',
                    marginBottom: '4px'
                  }} />
                  <span style={{
                    fontSize: '0.75rem',
                    color: activeTheme === t.id ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: activeTheme === t.id ? '600' : '400'
                  }}>
                    {t.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex mt-2" style={{ borderTop: '1px solid var(--card-border)', paddingTop: '20px' }}>
            <button type="button" className="btn btn-action danger flex items-center gap-2" onClick={handleReset} disabled={isSaving}>
              <RefreshCcw size={16} /> Ripristina Default
            </button>
          </div>
        </div>
      </div>

      {/* ─── Section 1.2: Telegram Notifications ─── */}
      <div className="widget flex-col">
        <h2 className="flex items-center gap-2 mb-5 m-0">
          <Terminal /> Notifiche Telegram
        </h2>
        <div className="glass p-5 rounded-xl flex-col gap-4">
          <p className="text-sm opacity-80 mb-2">Ricevi avvisi se la CPU o la RAM superano il 90%, o se lo spazio su disco sta per esaurirsi.</p>
          <div className="input-group">
            <label>Bot Token</label>
            <input 
              type="text" 
              className="input w-full" 
              placeholder="es. 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
            />
          </div>
          <div className="input-group mt-3">
            <label>Chat ID</label>
            <input 
              type="text" 
              className="input w-full" 
              placeholder="es. 123456789"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
            />
          </div>
          <div className="flex mt-3">
            <button className="btn btn-primary flex items-center gap-2" onClick={() => onSave({ telegramToken, telegramChatId })}>
              <Save size={16} /> Salva Impostazioni Telegram
            </button>
          </div>
        </div>
      </div>

      {/* ─── Section 1.3: Widget Settings ─── */}
      <div className="widget flex-col">
        <h2 className="flex items-center gap-2 mb-5 m-0">
          <Monitor /> Impostazioni Widget
        </h2>
        <div className="glass p-5 rounded-xl flex-col gap-4">
          <p className="text-sm opacity-80 mb-2">Configura le opzioni per i widget della dashboard.</p>
          <div className="input-group">
            <label>Città per Widget Meteo</label>
            <input 
              type="text" 
              className="input w-full" 
              placeholder="es. Roma, Milano, Napoli"
              value={weatherCity}
              onChange={(e) => setWeatherCity(e.target.value)}
            />
          </div>
          <div className="flex mt-3">
            <button className="btn btn-primary flex items-center gap-2" onClick={() => onSave({ weatherCity })}>
              <Save size={16} /> Salva Impostazioni Widget
            </button>
          </div>
        </div>
      </div>

      {/* ─── Section 1.5: Backup & Restore ─── */}
      <div className="widget flex-col">
        <h2 className="flex items-center gap-2 mb-5 m-0">
          <Save /> Backup & Ripristino
        </h2>
        <div className="glass p-5 rounded-xl flex-col gap-4">
          <p className="text-sm opacity-80 mb-2">Esporta tutte le configurazioni e i docker-compose per tenerli al sicuro, oppure ripristinali da un archivio salvato.</p>
          <div className="flex flex-wrap gap-4">
            <button className="btn btn-primary" onClick={async () => {
              try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/system/backup', {
                  headers: { Authorization: `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('Errore download backup');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'casaos_backup.zip';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              } catch (err) {
                showAlert('Errore', 'Impossibile scaricare il backup: ' + err.message, true);
              }
            }}>
              <ArrowDown size={18} /> Scarica Backup (.zip)
            </button>
            <label className="btn" style={{ background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ArrowUpCircle size={18} /> Ripristina da Backup
              <input type="file" accept=".zip" style={{ display: 'none' }} onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const confirmed = await showConfirm('Ripristino Backup', 'Sei sicuro? Le impostazioni attuali verranno sovrascritte. I container già in esecuzione non verranno fermati ma i file verranno sostituiti.');
                if (!confirmed) return;
                
                const formData = new FormData();
                formData.append('backup', file);
                try {
                  const token = localStorage.getItem('token');
                  const res = await axios.post('/api/system/restore', formData, {
                    headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
                  });
                  showAlert('Successo', res.data.message);
                } catch(err) {
                  showAlert('Errore', "Impossibile ripristinare il backup: " + (err.response?.data?.error || err.message), true);
                }
              }} />
            </label>
          </div>
        </div>
      </div>

      {/* ─── Section 2: System Logs ─── */}
      <div className="widget flex-col">
        <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
          <h2 className="flex items-center gap-2 m-0">
            <Terminal size={24} /> Log di Sistema
          </h2>
          <div className="flex gap-2">
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

        <div style={{ height: '350px', backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: '15px', borderRadius: '8px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {logsLoading && !logs ? 'Caricamento logs in corso...' : renderLogLines()}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* ─── Section 3: Docker Maintenance & Updates ─── */}
      <div className="widget flex-col gap-5">
        <h2 className="flex items-center gap-2 m-0 mb-2" style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '10px' }}>
          <ArrowUpCircle size={20} /> Gestione Docker & Aggiornamenti
        </h2>
        
        {/* Updates Section */}
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div className="flex-1" style={{ minWidth: '250px' }}>
            <h3 className="m-0 mb-2 text-lg">Aggiornamenti Immagini</h3>
            <p className="m-0 text-sm text-muted">
              Cerca nuove versioni delle immagini per i container in esecuzione.
            </p>
          </div>
          <div className="flex gap-2">
            <button 
              className="btn btn-primary flex items-center gap-2 font-bold" 
              onClick={triggerUpdateCheck} 
              disabled={isCheckingUpdates}
            >
              <RefreshCw size={16} className={isCheckingUpdates ? 'spin' : ''} />
              {isCheckingUpdates ? 'Ricerca in corso...' : 'Controlla Ora'}
            </button>
          </div>
        </div>

        {isCheckingUpdates && checkStatus && checkStatus.container && (
          <div className="p-4" style={{ background: 'var(--bg-color)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--card-border)' }}>
            <div className="flex justify-between mb-2 text-sm">
              <span>Scansione: <strong>{checkStatus.container}</strong></span>
              <span className="text-muted">{checkStatus.action}</span>
            </div>
            <div style={{ height: '4px', background: 'var(--card-bg)', borderRadius: '2px', overflow: 'hidden' }}>
              <div className="progress-bar-inner" style={{ width: '100%', height: '100%', background: 'var(--primary)', animation: 'pulse 1s infinite' }}></div>
            </div>
          </div>
        )}

        {updates.length > 0 && !isCheckingUpdates && (
          <div className="p-4" style={{ background: 'rgba(239, 68, 68, 0.05)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--danger)' }}>
            <h4 className="flex items-center gap-2 m-0 mb-2" style={{ color: 'var(--danger)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }}></div>
              Container da aggiornare ({updates.length})
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {updates.map(upd => (
                <div key={upd.id} style={{ background: 'var(--bg-color)', padding: '10px', borderRadius: '6px', border: '1px solid var(--card-border)' }}>
                  <div style={{ fontWeight: '600', marginBottom: '2px' }}>{upd.name}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.6, wordBreak: 'break-all', marginBottom: '8px' }}>{upd.image}</div>
                  <button 
                    className="btn btn-primary" 
                    style={{ width: '100%', padding: '6px' }}
                    onClick={() => handleUpdateContainer(upd)}
                  >
                    Aggiorna
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ─── Section 4: Logout ─── */}
      <div className="flex justify-center mt-2">
        <button 
          onClick={logout} 
          className="btn flex items-center gap-2" 
          style={{ 
            padding: '10px 28px', 
            background: 'transparent', 
            border: '1px solid var(--card-border)', 
            color: 'var(--text-color)', 
            borderRadius: 'var(--radius-md)',
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
    </div>
  );
}
