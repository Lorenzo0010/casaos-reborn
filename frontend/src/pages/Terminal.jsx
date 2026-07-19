import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { io } from 'socket.io-client';
import { Terminal as TermIcon, Server, User, Menu } from 'lucide-react';

export default function TerminalPage({ togglePanel }) {
  const terminalRef = useRef(null);
  const socketRef = useRef(null);
  const termRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [sshHost, setSshHost] = useState(localStorage.getItem('ssh_host') || '192.168.1.1');
  const [sshUser, setSshUser] = useState(localStorage.getItem('ssh_user') || 'root');

  const connectSSH = (e) => {
    if (e) e.preventDefault();
    
    localStorage.setItem('ssh_host', sshHost);
    localStorage.setItem('ssh_user', sshUser);
    setConnected(true);
  };

  useEffect(() => {
    if (!connected) return;

    const term = new Terminal({
      cursorBlink: true,
      theme: { background: '#1e1e1e', foreground: '#f3f4f6' },
      fontFamily: 'monospace'
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(terminalRef.current);
    fitAddon.fit();
    termRef.current = term;

    const token = localStorage.getItem('token');
    
    socketRef.current = io(window.location.origin, {
      auth: { type: 'terminal', token, sshHost, sshUser }
    });

    socketRef.current.on('connect', () => {
      term.writeln(`\x1b[32m*** Connecting to ${sshUser}@${sshHost} via SSH ***\x1b[0m\r\n`);
      socketRef.current.emit('terminal.resize', { cols: term.cols, rows: term.rows });
    });

    socketRef.current.on('terminal.incomingData', (data) => {
      term.write(data);
    });

    term.onData((data) => {
      socketRef.current.emit('terminal.keystroke', data);
    });

    const handleResize = () => {
      fitAddon.fit();
      if (socketRef.current) socketRef.current.emit('terminal.resize', { cols: term.cols, rows: term.rows });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [connected]);

  if (!connected) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="widget" style={{ padding: '30px', width: '100%', maxWidth: '400px' }}>
          <div className="page-header" style={{ marginBottom: '20px' }}>
            <div className="flex items-center gap-2">
              <button onClick={() => togglePanel('menu')} className="btn-icon-only" title="Menu">
                <Menu size={24} />
              </button>
              <h2 className="m-0 flex items-center gap-2" style={{ fontSize: '1.25rem' }}>
                <TermIcon size={24} color="var(--primary)" /> Connessione SSH Host
              </h2>
            </div>
          </div>
          
          <p style={{ opacity: 0.7, marginBottom: '20px', fontSize: '0.9rem' }}>
            Inserisci le credenziali per accedere all'intera macchina. La password verrà richiesta in modo sicuro nel terminale.
          </p>

          <form onSubmit={connectSSH} className="casaos-form">
            <div className="form-group mb-4">
              <label className="flex items-center gap-2"><Server size={16}/> Indirizzo IP / Host</label>
              <input type="text" className="form-control" value={sshHost} onChange={(e) => setSshHost(e.target.value)} required />
            </div>
            
            <div className="form-group mb-6">
              <label className="flex items-center gap-2"><User size={16}/> Nome Utente</label>
              <input type="text" className="form-control" value={sshUser} onChange={(e) => setSshUser(e.target.value)} required />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Connetti</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-col h-full">
      <div className="page-header">
        <div className="flex items-center gap-2">
          <button onClick={() => togglePanel('menu')} className="btn-icon-only" title="Menu">
            <Menu size={24} />
          </button>
          <h1>Terminale SSH</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted">{sshUser}@{sshHost}</span>
          <button className="btn" onClick={() => setConnected(false)} style={{ padding: '6px 12px', fontSize: '0.875rem' }}>Disconnetti</button>
        </div>
      </div>
      <div 
        ref={terminalRef} 
        style={{ flex: 1, backgroundColor: '#1e1e1e', padding: '10px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }} 
      />
    </div>
  );
}
