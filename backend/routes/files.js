const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const archiver = require('archiver');
const tar = require('tar');
const extractZip = require('extract-zip');
const os = require('os');

// Get correct home dir (support Docker host mapping)
const getHomeDir = () => {
  if (process.env.HOST_HOMEDIR) return process.env.HOST_HOMEDIR;
  const sysHome = os.homedir();
  // If running in docker as root, fallback to /home instead of /root
  return sysHome === '/root' ? '/home' : sysHome;
};

// Helper to safely resolve paths
const resolvePath = (reqPath) => {
  if (!reqPath || reqPath === '~') return getHomeDir();
  if (reqPath.startsWith('~/') || reqPath.startsWith('~\\')) {
    return path.resolve(getHomeDir(), reqPath.slice(2));
  }
  // Note: in a real production environment, you'd want to jail this path
  // to a specific root (e.g., /data) to prevent escaping. 
  // For CasaOS MVP we allow browsing the whole system like the user requested.
  return path.resolve(reqPath);
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const targetPath = resolvePath(req.query.path);
    // Validate path exists
    if (!fs.existsSync(targetPath)) {
      return cb(new Error('Target directory does not exist'));
    }
    cb(null, targetPath);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: storage });

// GET /api/files/list - List files in a directory
router.get('/list', (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path);
    
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const files = fs.readdirSync(targetPath);
    const fileDetails = files.map(filename => {
      const filePath = path.join(targetPath, filename);
      try {
        const fileStats = fs.statSync(filePath);
        return {
          name: filename,
          path: filePath,
          isDir: fileStats.isDirectory(),
          size: fileStats.size,
          modifiedAt: fileStats.mtime,
          mode: fileStats.mode
        };
      } catch (e) {
        // Handle broken symlinks or permission denied
        return {
          name: filename,
          path: filePath,
          isDir: false,
          size: 0,
          error: e.message
        };
      }
    });

    // Sort: directories first, then alphabetically
    fileDetails.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      path: targetPath,
      parent: path.dirname(targetPath) !== targetPath ? path.dirname(targetPath) : null,
      files: fileDetails,
      homedir: getHomeDir()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/files/read - Read file content (text or image stream)
router.get('/read', (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path);
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stats = fs.statSync(targetPath);
    if (stats.isDirectory()) {
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        res.status(500).send({ error: err.message });
      });

      res.attachment(`${path.basename(targetPath)}.zip`);
      archive.pipe(res);
      archive.directory(targetPath, false);
      archive.finalize();
      return;
    }

    res.sendFile(targetPath);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/write - Save text file content
router.post('/write', (req, res) => {
  try {
    const { path: targetPath, content } = req.body;
    const resolvedPath = resolvePath(targetPath);
    
    fs.writeFileSync(resolvedPath, content || '');
    res.json({ success: true, message: 'File saved successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/upload - Upload files to directory
router.post('/upload', upload.array('files'), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    res.json({ success: true, message: 'Files uploaded successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/create - Create a new file or directory
router.post('/create', (req, res) => {
  try {
    const { path: targetPath, isDir } = req.body;
    const resolvedPath = resolvePath(targetPath);

    if (fs.existsSync(resolvedPath)) {
      return res.status(400).json({ error: 'Path already exists' });
    }

    if (isDir) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    } else {
      fs.writeFileSync(resolvedPath, '');
    }

    res.json({ success: true, message: `${isDir ? 'Directory' : 'File'} created successfully` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/delete - Delete file or directory recursively
router.post('/delete', (req, res) => {
  try {
    const { path: targetPath } = req.body;
    const resolvedPath = resolvePath(targetPath);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    fs.rmSync(resolvedPath, { recursive: true, force: true });
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/rename - Rename file or directory
router.post('/rename', (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    const resolvedOld = resolvePath(oldPath);
    const resolvedNew = resolvePath(newPath);

    if (!fs.existsSync(resolvedOld)) {
      return res.status(404).json({ error: 'Source not found' });
    }
    if (fs.existsSync(resolvedNew)) {
      return res.status(400).json({ error: 'Destination already exists' });
    }

    fs.renameSync(resolvedOld, resolvedNew);
    res.json({ success: true, message: 'Renamed successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/copy - Copy file or directory
router.post('/copy', (req, res) => {
  try {
    const { source, dest } = req.body;
    const resolvedSource = resolvePath(source);
    const resolvedDest = resolvePath(dest);

    if (!fs.existsSync(resolvedSource)) {
      return res.status(404).json({ error: 'Source not found' });
    }

    fs.cpSync(resolvedSource, resolvedDest, { recursive: true });
    res.json({ success: true, message: 'Copied successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/move - Move file or directory
router.post('/move', (req, res) => {
  try {
    const { source, dest } = req.body;
    const resolvedSource = resolvePath(source);
    const resolvedDest = resolvePath(dest);

    if (!fs.existsSync(resolvedSource)) {
      return res.status(404).json({ error: 'Source not found' });
    }

    fs.renameSync(resolvedSource, resolvedDest);
    res.json({ success: true, message: 'Moved successfully' });
  } catch (e) {
    // Fallback if cross-device link error
    try {
      fs.cpSync(resolvedSource, resolvedDest, { recursive: true });
      fs.rmSync(resolvedSource, { recursive: true, force: true });
      res.json({ success: true, message: 'Moved successfully (via copy/delete)' });
    } catch (e2) {
      res.status(500).json({ error: e.message });
    }
  }
});

// POST /api/files/chmod - Change permissions (mostly UNIX)
router.post('/chmod', (req, res) => {
  try {
    const { path: targetPath, mode } = req.body;
    const resolvedPath = resolvePath(targetPath);
    
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    // mode is passed as octal string like "0755" or number 493
    fs.chmodSync(resolvedPath, parseInt(mode, 8));
    res.json({ success: true, message: 'Permissions updated' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/archive - Compress selected items into a ZIP
router.post('/archive', (req, res) => {
  const { items, destination, archiveName } = req.body;
  
  if (!items || !items.length) return res.status(400).json({ error: 'No items selected' });
  
  const destPath = resolvePath(path.join(destination, archiveName));
  const output = fs.createWriteStream(destPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    res.json({ success: true, message: 'Archive created', size: archive.pointer() });
  });

  archive.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  archive.pipe(output);

  items.forEach(item => {
    const resolvedItem = resolvePath(item);
    if (!fs.existsSync(resolvedItem)) return;

    const stats = fs.statSync(resolvedItem);
    if (stats.isDirectory()) {
      archive.directory(resolvedItem, path.basename(resolvedItem));
    } else {
      archive.file(resolvedItem, { name: path.basename(resolvedItem) });
    }
  });

  archive.finalize();
});

// POST /api/files/extract - Extract a ZIP or TAR
router.post('/extract', async (req, res) => {
  try {
    const { path: archivePath, destination } = req.body;
    const resolvedArchive = resolvePath(archivePath);
    const resolvedDest = resolvePath(destination);

    if (!fs.existsSync(resolvedArchive)) {
      return res.status(404).json({ error: 'Archive not found' });
    }

    if (resolvedArchive.endsWith('.zip')) {
      await extractZip(resolvedArchive, { dir: resolvedDest });
      res.json({ success: true, message: 'ZIP extracted successfully' });
    } else if (resolvedArchive.endsWith('.tar') || resolvedArchive.endsWith('.tar.gz')) {
      tar.x({
        file: resolvedArchive,
        cwd: resolvedDest,
        sync: true
      });
      res.json({ success: true, message: 'TAR extracted successfully' });
    } else {
      res.status(400).json({ error: 'Unsupported archive format' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
