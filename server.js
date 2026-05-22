const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const UPLOAD_DIR = path.join(__dirname, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function sanitizeFilename(name) {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safe || safe === '.' || safe === '..') {
    return 'file';
  }
  return safe;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = sanitizeFilename(file.originalname);
    const ext = path.extname(safe);
    const base = path.basename(safe, ext);
    let name = safe;
    let counter = 1;
    while (fs.existsSync(path.join(UPLOAD_DIR, name))) {
      name = `${base}__${counter}${ext}`;
      counter += 1;
    }
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/files', (_req, res) => {
  fs.readdir(UPLOAD_DIR, (err, entries) => {
    if (err) {
      res.status(500).json({ error: 'Failed to read uploads.' });
      return;
    }

    const files = entries
      .map((name) => {
        const fullPath = path.join(UPLOAD_DIR, name);
        try {
          const stats = fs.statSync(fullPath);
          if (!stats.isFile()) {
            return null;
          }
          return {
            name,
            size: stats.size,
            mtime: stats.mtimeMs
          };
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);

    res.json({ files });
  });
});

app.post('/api/upload', upload.array('files'), (req, res) => {
  const files = (req.files || []).map((file) => ({
    name: file.filename,
    size: file.size,
    mtime: Date.now()
  }));
  res.json({ uploaded: files });
});

app.get('/download/:name', (req, res) => {
  const requested = req.params.name || '';
  const safeName = path.basename(requested);
  const fullPath = path.join(UPLOAD_DIR, safeName);

  if (!fullPath.startsWith(UPLOAD_DIR)) {
    res.status(400).json({ error: 'Invalid file.' });
    return;
  }

  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }

  res.download(fullPath, safeName);
});

app.listen(PORT, HOST, () => {
  console.log(`File share running on http://${HOST}:${PORT}`);
});
