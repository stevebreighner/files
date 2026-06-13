const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');
let fileConfig = {};
if (fs.existsSync(configPath)) {
  try {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.warn('Could not read config.json, using defaults.');
  }
}

const PORT = Number(process.env.PORT || fileConfig.port || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const LAN_HOST = process.env.LAN_HOST || fileConfig.lanHost || '192.168.0.27';
const PUBLIC_URL = process.env.PUBLIC_URL || `http://${LAN_HOST}:${PORT}`;

const app = express();
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MUSIC_DIR = 'music';

const AUDIO_EXT = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a']);
const AUDIO_PREF = ['.flac', '.mp3', '.wav', '.ogg', '.m4a'];

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function sanitizeFilename(name) {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safe || safe === '.' || safe === '..') {
    return 'file';
  }
  return safe;
}

function isAudioFile(name) {
  return AUDIO_EXT.has(path.extname(name).toLowerCase());
}

function resolveUploadPath(relative) {
  const normalized = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(UPLOAD_DIR, normalized);
  const uploadRoot = path.resolve(UPLOAD_DIR);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(uploadRoot + path.sep) && resolved !== uploadRoot) {
    return null;
  }
  return resolved;
}

function fileEntry(relativePath, name, stats) {
  return {
    name,
    path: relativePath.replace(/\\/g, '/'),
    size: stats.size,
    mtime: stats.mtimeMs
  };
}

function dedupeAudioTracks(tracks) {
  const byBase = new Map();

  for (const track of tracks) {
    const ext = path.extname(track.name).toLowerCase();
    const base = track.name.slice(0, -ext.length);
    const existing = byBase.get(base);
    if (!existing) {
      byBase.set(base, track);
      continue;
    }
    const existingExt = path.extname(existing.name).toLowerCase();
    if (AUDIO_PREF.indexOf(ext) < AUDIO_PREF.indexOf(existingExt)) {
      byBase.set(base, track);
    }
  }

  return Array.from(byBase.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
}

function scanMusicAlbums() {
  const musicPath = path.join(UPLOAD_DIR, MUSIC_DIR);
  if (!fs.existsSync(musicPath)) {
    return [];
  }

  const albums = [];

  for (const entry of fs.readdirSync(musicPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const albumDir = path.join(musicPath, entry.name);
    const tracks = [];

    for (const fileName of fs.readdirSync(albumDir)) {
      if (!isAudioFile(fileName)) {
        continue;
      }

      const fullPath = path.join(albumDir, fileName);
      let stats;
      try {
        stats = fs.statSync(fullPath);
      } catch (error) {
        continue;
      }
      if (!stats.isFile()) {
        continue;
      }

      const relativePath = path.join(MUSIC_DIR, entry.name, fileName);
      tracks.push(fileEntry(relativePath, fileName, stats));
    }

    if (!tracks.length) {
      continue;
    }

    albums.push({
      id: path.join(MUSIC_DIR, entry.name).replace(/\\/g, '/'),
      name: entry.name,
      tracks: dedupeAudioTracks(tracks)
    });
  }

  return albums.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}

function scanRootFiles() {
  const files = [];

  for (const entry of fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const fullPath = path.join(UPLOAD_DIR, entry.name);
    let stats;
    try {
      stats = fs.statSync(fullPath);
    } catch (error) {
      continue;
    }

    files.push(fileEntry(entry.name, entry.name, stats));
  }

  return files.sort((a, b) => b.mtime - a.mtime);
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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/info', (_req, res) => {
  res.json({
    publicUrl: PUBLIC_URL,
    port: PORT,
    lanHost: LAN_HOST
  });
});

app.get('/api/files', (_req, res) => {
  try {
    res.json({
      albums: scanMusicAlbums(),
      files: scanRootFiles()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read uploads.' });
  }
});

app.post('/api/upload', upload.array('files'), (req, res) => {
  const files = (req.files || []).map((file) => ({
    name: file.filename,
    path: file.filename,
    size: file.size,
    mtime: Date.now()
  }));
  res.json({ uploaded: files });
});

app.get(/^\/download\/(.+)$/, (req, res) => {
  const relative = decodeURIComponent(req.params[0]);
  const fullPath = resolveUploadPath(relative);

  if (!fullPath || !fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found.' });
  }

  const stats = fs.statSync(fullPath);
  if (!stats.isFile()) {
    return res.status(404).json({ error: 'File not found.' });
  }

  const ext = path.extname(fullPath).toLowerCase();
  const isAudio = AUDIO_EXT.has(ext);
  const downloadName = path.basename(fullPath);

  const contentType =
    ext === '.flac' ? 'audio/flac' :
    ext === '.mp3' ? 'audio/mpeg' :
    ext === '.wav' ? 'audio/wav' :
    ext === '.ogg' ? 'audio/ogg' :
    ext === '.m4a' ? 'audio/mp4' :
    'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  if (!isAudio) {
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  }

  fs.createReadStream(fullPath).pipe(res);
});


function listVideoFiles() {
  const exts = new Set(['.mp4', '.mov', '.webm', '.mkv']);
  const files = [];

  for (const entry of fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!exts.has(ext)) continue;

    files.push(entry.name);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

app.get('/videos', (req, res) => {
  const files = listVideoFiles();

  const items = files.map(f => `
    <li>
      <a href="/video?file=${encodeURIComponent(f)}">${f}</a>
    </li>
  `).join('');

  res.send(`
    <html>
      <head>
        <title>Videos</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; background:#111; color:#eee; padding:20px; }
          a { color:#6cf; text-decoration:none; }
          li { margin:10px 0; }
        </style>
      </head>
      <body>
        <h2>🎬 Videos</h2>
        <ul>${items}</ul>
      </body>
    </html>
  `);
});


app.get('/video', (req, res) => {
  const file = req.query.file;
  if (!file) return res.send("No file specified");

  const safe = path.basename(file);

  const src = `/download/${encodeURIComponent(safe)}`;

  res.send(`
    <html>
      <head>
        <title>${safe}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { margin:0; background:black; color:white; display:flex; flex-direction:column; align-items:center; }
          video { width:100%; max-width:1000px; margin-top:20px; }
          a { color:white; margin-top:10px; }
        </style>
      </head>
      <body>
        <a href="/videos">⬅ Back</a>
        <video controls autoplay>
          <source src="${src}">
        </video>
      </body>
    </html>
  `);
});

app.listen(PORT, HOST, () => {
  console.log(`File share listening on port ${PORT}`);
  console.log(`Open on this machine: http://127.0.0.1:${PORT}`);
  console.log(`Open on your network:  ${PUBLIC_URL}`);
});
