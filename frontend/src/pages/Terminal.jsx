import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { io } from 'socket.io-client';

export default function TerminalPage() {
  const terminalRef = useRef(null);
  const socketRef = useRef(null);
  const termRef = useRef(null);

  useEffect(() => {
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
    termRef.current = term;

    const token = localStorage.getItem('token');
    
    socketRef.current = io(window.location.origin, {
      auth: { type: 'terminal', token, sshHost: '192.168.1.77', sshUser: 'orangepi' }
    });

    socketRef.current.on('connect', () => {
      term.writeln(`\x1b[32m*** Connecting to orangepi@192.168.1.77 via SSH ***\x1b[0m\r\n`);
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
      if (socketRef.current) {
        socketRef.current.emit('terminal.resize', { cols: term.cols, rows: term.rows });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h1 style={{ margin: 0 }}>Terminale SSH</h1>
        <span style={{ opacity: 0.7, fontSize: '0.9rem' }}>orangepi@192.168.1.77</span>
      </div>
      <div 
        ref={terminalRef} 
        style={{ flex: 1, backgroundColor: '#1e1e1e', padding: '10px', borderRadius: '8px', overflow: 'hidden' }} 
      />
    </div>
  );
}
