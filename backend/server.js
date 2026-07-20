const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const jwt = require('jsonwebtoken');
const fs = require('fs');

// Setup global logger
const logDir = path.join(__dirname, 'data');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, 'casaos.log');
const prevLogFile = path.join(logDir, 'casaos.prev.log');

if (fs.existsSync(logFile)) {
  try {
    fs.renameSync(logFile, prevLogFile);
  } catch (e) {
    console.error('Error rotating logs:', e);
  }
}

const originalLog = console.log;
const originalError = console.error;

function formatLogMessage(level, args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => {
    if (arg instanceof Error) return arg.stack || arg.message;
    if (typeof arg === 'object') {
      try { return JSON.stringify(arg); } catch(e) { return String(arg); }
    }
    return String(arg);
  }).join(' ');
  return `[${timestamp}] [${level}] ${message}\n`;
}

console.log = function(...args) {
  originalLog.apply(console, args);
  try { fs.appendFileSync(logFile, formatLogMessage('INFO', args)); } catch(e) {}
};

console.error = function(...args) {
  originalError.apply(console, args);
  try { fs.appendFileSync(logFile, formatLogMessage('ERROR', args)); } catch(e) {}
};

// Initialize app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Environment variables
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'casaos';

app.use(cors());
app.use(express.json());

// Attach Socket.io to req
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Serve static frontend in production
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'data', 'uploads')));

// Basic Auth Route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Health check endpoint (no auth required, used for reconnection polling after self-update)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API Routes will be imported here
const systemRoutes = require('./routes/system');
const dockerRoutes = require('./routes/docker');
const filesRoutes = require('./routes/files');
app.use('/api/system', authenticateToken, systemRoutes);
app.use('/api/docker', authenticateToken, dockerRoutes);
app.use('/api/files', authenticateToken, filesRoutes);

const pty = require('node-pty');
const os = require('os');
const { initUpdater } = require('./services/updater');
const { initBroadcaster } = require('./services/broadcaster');

// Initialize the background updater
initUpdater(io);

// Initialize the websocket broadcaster
initBroadcaster(io);

// Socket.io for Terminal & real-time updates
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error("Authentication error"));
    socket.user = decoded;
    next();
  });
});

io.on('connection', (socket) => {
  // console.log('User connected:', socket.id); // Spamma i log ad ogni cambio pagina
  
  const { type, sshUser, sshHost } = socket.handshake.auth;
  
  if (type === 'terminal') {
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'ssh';
    const args = os.platform() === 'win32' ? [] : [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      `${sshUser || 'root'}@${sshHost || '127.0.1.1'}`
    ];
    
    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME || '/root',
      env: process.env
    });

    ptyProcess.on('data', function(data) {
      socket.emit('terminal.incomingData', data);
    });

    socket.on('terminal.keystroke', (data) => {
      ptyProcess.write(data);
    });
    
    socket.on('terminal.resize', (size) => {
      if (size && size.cols && size.rows) {
        ptyProcess.resize(size.cols, size.rows);
      }
    });

    socket.on('disconnect', () => {
      // console.log('Terminal user disconnected:', socket.id);
      ptyProcess.kill();
    });
  } else {
    socket.on('disconnect', () => {
      // console.log('User disconnected:', socket.id); // Spamma i log ad ogni cambio pagina
    });
  }
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
