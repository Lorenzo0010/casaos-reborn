import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { io } from 'socket.io-client';

export default function TerminalPage() {
  const terminalRef = useRef(null);
  const socketRef = useRef(null);

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

    const token = localStorage.getItem('token');
    
    // Connect to websocket (using current window host)
    socketRef.current = io(window.location.origin, {
      auth: { token }
    });

    socketRef.current.on('connect', () => {
      term.writeln('\x1b[32m*** Connected to host terminal ***\x1b[0m');
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
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ marginBottom: '10px' }}>Host Terminal</h1>
      <div 
        ref={terminalRef} 
        style={{ flex: 1, backgroundColor: '#1e1e1e', padding: '10px', borderRadius: '8px', overflow: 'hidden' }} 
      />
    </div>
  );
}
