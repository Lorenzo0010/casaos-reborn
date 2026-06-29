import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { io } from 'socket.io-client';
import { Play } from 'lucide-react';

export default function TerminalPage() {
  const terminalRef = useRef(null);
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [host, setHost] = useState(window.location.hostname);
  const [user, setUser] = useState('root');

  useEffect(() => {
    if (!connected) return;

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#f3f4f6'
      },
      fontFamily: 'monospace'
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(terminalRef.current);
    fitAddon.fit();

    const token = localStorage.getItem('token');
    
    socketRef.current = io(window.location.origin, {
      auth: { type: 'terminal', token, sshHost: host, sshUser: user }
    });

    socketRef.current.on('connect', () => {
      term.writeln(`\x1b[32m*** Connecting to ${user}@${host} via SSH ***\x1b[0m\r\n`);
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
      socketRef.current.emit('terminal.resize', { cols: term.cols, rows: term.rows });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [connected]);

  if (!connected) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass" style={{ padding: '40px', display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '400px' }}>
          <h2 style={{ margin: 0, textAlign: 'center' }}>Connessione SSH</h2>
          
          <div className="input-group">
            <label>IP / Hostname</label>
            <input type="text" value={host} onChange={e => setHost(e.target.value)} />
          </div>

          <div className="input-group">
            <label>Utente</label>
            <input type="text" value={user} onChange={e => setUser(e.target.value)} />
          </div>

          <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '10px' }} onClick={() => setConnected(true)}>
            <Play size={18} /> Connetti al Terminale
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h1 style={{ margin: 0 }}>Terminale SSH</h1>
        <button className="btn btn-danger" onClick={() => setConnected(false)}>Disconnetti</button>
      </div>
      <div 
        ref={terminalRef} 
        style={{ flex: 1, backgroundColor: '#1e1e1e', padding: '10px', borderRadius: '8px', overflow: 'hidden' }} 
      />
    </div>
  );
}
