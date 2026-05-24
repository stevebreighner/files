const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseButton = document.getElementById('browseButton');
const refreshButton = document.getElementById('refreshButton');
const uploadButton = document.getElementById('uploadButton');
const uploadNameInput = document.getElementById('uploadNameInput');
const uploadExtLabel = document.getElementById('uploadExtLabel');
const statusEl = document.getElementById('status');
const otherFilesList = document.getElementById('otherFilesList');
const musicLibraryList = document.getElementById('musicLibraryList');
const musicLibraryPanel = document.getElementById('musicLibraryPanel');
const musicLibraryMeta = document.getElementById('musicLibraryMeta');
const otherFilesPanel = document.getElementById('otherFilesPanel');
const libraryHint = document.getElementById('libraryHint');

const audioPlayerBar = document.getElementById('audioPlayer');
const playerTrack = document.getElementById('playerTrack');
const playerPrev = document.getElementById('playerPrev');
const playerPlayPause = document.getElementById('playerPlayPause');
const playerNext = document.getElementById('playerNext');
const playerSeek = document.getElementById('playerSeek');
const playerTime = document.getElementById('playerTime');
const playerVolume = document.getElementById('playerVolume');

const player = new Audio();
const AUDIO_EXT = /\.(mp3|flac|wav|ogg|m4a)$/i;

let currentFile = null;
let currentButton = null;
let audioPlaylist = [];
const audioButtons = new Map();
const audioRows = new Map();
let isSeeking = false;
let libraryHasAudio = false;
let pendingUploadFiles = [];

function isAudio(name) {
  return AUDIO_EXT.test(name);
}

function trackUrl(filePath) {
  return `/download/${filePath.split('/').map(encodeURIComponent).join('/')}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return '0:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function getCurrentIndex() {
  return audioPlaylist.findIndex((track) => track.url === currentFile);
}

function getCurrentTrack() {
  const index = getCurrentIndex();
  return index >= 0 ? audioPlaylist[index] : null;
}

function syncRowButtons() {
  audioButtons.forEach((btn, url) => {
    btn.textContent = url === currentFile && !player.paused ? '⏸ Pause' : '▶ Play';
  });
}

function highlightActiveRow() {
  audioRows.forEach((row, url) => {
    row.classList.toggle('file-row--active', url === currentFile);
    row.classList.toggle('track-row--active', url === currentFile);
  });
}

function updatePlayerBar() {
  if (!audioPlayerBar) {
    return;
  }

  const showPlayer = libraryHasAudio || audioPlaylist.length > 0;
  audioPlayerBar.hidden = !showPlayer;

  const track = getCurrentTrack();
  const index = getCurrentIndex();

  if (playerTrack) {
    playerTrack.textContent = track ? track.name : 'Select a track below';
  }
  if (playerPlayPause) {
    playerPlayPause.textContent = track && !player.paused ? '⏸' : '▶';
  }
  if (playerPrev) {
    playerPrev.disabled = !track || index <= 0;
  }
  if (playerNext) {
    playerNext.disabled = !track || index < 0 || index >= audioPlaylist.length - 1;
  }
  if (playerSeek) {
    playerSeek.disabled = !track;
  }

  if (!track && playerTime && playerSeek) {
    playerTime.textContent = '0:00 / 0:00';
    playerSeek.value = 0;
  }
}

function resetPlayback() {
  currentFile = null;
  currentButton = null;
  syncRowButtons();
  highlightActiveRow();
  updatePlayerBar();
}

function setQueue(tracks) {
  audioPlaylist = tracks.map((track) => ({
    name: track.name,
    path: track.path,
    url: trackUrl(track.path)
  }));
  updatePlayerBar();
}

function playTrack(url, btn) {
  if (currentFile === url) {
    if (player.paused) {
      player.play();
    } else {
      player.pause();
    }
    syncRowButtons();
    updatePlayerBar();
    return;
  }

  if (currentButton) {
    currentButton.textContent = '▶ Play';
  }

  currentFile = url;
  currentButton = btn || audioButtons.get(url) || null;
  player.src = url;
  player.play();
  syncRowButtons();
  highlightActiveRow();
  updatePlayerBar();
}

function playTrackAtIndex(index) {
  if (index < 0 || index >= audioPlaylist.length) {
    resetPlayback();
    return;
  }

  const track = audioPlaylist[index];
  playTrack(track.url, audioButtons.get(track.url));
}

function playQueueFromStart(tracks) {
  if (!tracks.length) {
    return;
  }
  setQueue(tracks);
  playTrackAtIndex(0);
}

function playNextTrack() {
  const index = getCurrentIndex();
  if (index < 0 || index >= audioPlaylist.length - 1) {
    resetPlayback();
    return;
  }
  playTrackAtIndex(index + 1);
}

function playPrevTrack() {
  const index = getCurrentIndex();
  if (index <= 0) {
    return;
  }
  playTrackAtIndex(index - 1);
}

function togglePlayPause() {
  if (currentFile) {
    if (player.paused) {
      player.play();
    } else {
      player.pause();
    }
    syncRowButtons();
    updatePlayerBar();
    return;
  }

  if (audioPlaylist.length) {
    playTrackAtIndex(0);
  }
}

player.addEventListener('ended', playNextTrack);
player.addEventListener('play', () => {
  syncRowButtons();
  updatePlayerBar();
});
player.addEventListener('pause', () => {
  syncRowButtons();
  updatePlayerBar();
});
player.addEventListener('timeupdate', () => {
  if (isSeeking || !player.duration || !playerSeek || !playerTime) {
    return;
  }
  playerSeek.value = (player.currentTime / player.duration) * 100;
  playerTime.textContent = `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`;
});
player.addEventListener('loadedmetadata', () => {
  if (playerTime) {
    playerTime.textContent = `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`;
  }
});

function setStatus(message, type = 'info') {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message;
  statusEl.className = `drop-zone__status drop-zone__status--${type}`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(ms) {
  const date = new Date(ms);
  return date.toLocaleString();
}

function allTracksFromLibrary(library) {
  const albumTracks = (library.albums || []).flatMap((album) => album.tracks);
  const rootTracks = (library.files || []).filter((file) => isAudio(file.name));
  return [...albumTracks, ...rootTracks];
}

function trackStillExists(library, url) {
  return allTracksFromLibrary(library).some((track) => trackUrl(track.path) === url);
}

function splitFileName(filename) {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) {
    return { base: filename, ext: '' };
  }
  return { base: filename.slice(0, dot), ext: filename.slice(dot) };
}

function buildUploadFilename(file, customBase) {
  const { ext } = splitFileName(file.name);
  const trimmed = customBase.trim();
  if (!trimmed) {
    return file.name;
  }
  return `${trimmed}${ext}`;
}

function updateUploadNameFields(files) {
  if (!uploadNameInput || !uploadExtLabel) {
    return;
  }

  if (files.length === 1) {
    const { base, ext } = splitFileName(files[0].name);
    uploadNameInput.disabled = false;
    uploadNameInput.value = base;
    uploadExtLabel.textContent = ext;
    return;
  }

  uploadNameInput.disabled = files.length > 1;
  uploadExtLabel.textContent = files.length > 1 ? '(original names)' : '';
  if (files.length > 1) {
    uploadNameInput.value = '';
  }
}

function stageFilesForUpload(files) {
  pendingUploadFiles = files;
  updateUploadNameFields(files);

  if (!files.length) {
    setStatus('', 'info');
    return;
  }

  setStatus(
    `${files.length} file${files.length > 1 ? 's' : ''} ready — edit name if one file, then click Upload.`,
    'info'
  );
}

function createPlayButton(filePath) {
  const url = trackUrl(filePath);
  const btn = document.createElement('button');
  btn.className = 'button button--small';
  btn.textContent = '▶ Play';
  audioButtons.set(url, btn);
  return btn;
}

function expandAlbumItem(item) {
  const trackList = item.querySelector('.album-tracks');
  const toggle = item.querySelector('.album-toggle');
  if (!trackList || trackList.hidden === false) {
    return;
  }
  trackList.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  toggle.textContent = '▾';
  item.classList.add('album-item--open');
}

function createTrackRow(track, queueTracks, albumItem) {
  const url = trackUrl(track.path);
  const row = document.createElement('li');
  row.className = 'track-row';

  const info = document.createElement('div');
  info.className = 'track-info';

  const name = document.createElement('span');
  name.className = 'track-name';
  name.textContent = track.name;
  info.appendChild(name);
  row.appendChild(info);

  if (isAudio(track.name)) {
    audioRows.set(url, row);
    const btn = createPlayButton(track.path);
    btn.onclick = (event) => {
      event.stopPropagation();
      if (albumItem) {
        expandAlbumItem(albumItem);
      }
      setQueue(queueTracks);
      playTrack(url, btn);
    };
    row.appendChild(btn);
  }

  return row;
}

function createAlbumItem(album) {
  const item = document.createElement('li');
  item.className = 'album-item';

  const header = document.createElement('div');
  header.className = 'album-header';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'album-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.title = 'Expand album';
  toggle.textContent = '▸';

  const playAlbumBtn = document.createElement('button');
  playAlbumBtn.type = 'button';
  playAlbumBtn.className = 'album-name';
  playAlbumBtn.textContent = `${album.name} (${album.tracks.length} tracks)`;
  playAlbumBtn.title = 'Play album';
  playAlbumBtn.onclick = () => {
    expandAlbumItem(item);
    playQueueFromStart(album.tracks);
  };

  const trackList = document.createElement('ul');
  trackList.className = 'album-tracks';
  trackList.hidden = true;

  toggle.onclick = (event) => {
    event.stopPropagation();
    const expanded = trackList.hidden;
    trackList.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? '▾' : '▸';
    item.classList.toggle('album-item--open', expanded);
  };

  album.tracks.forEach((track) => {
    trackList.appendChild(createTrackRow(track, album.tracks, item));
  });

  header.appendChild(toggle);
  header.appendChild(playAlbumBtn);
  item.appendChild(header);
  item.appendChild(trackList);

  return item;
}

function createFileRow(file) {
  const fileIsAudio = isAudio(file.name);
  const url = trackUrl(file.path);

  const row = document.createElement('div');
  row.className = 'file-row';

  const info = document.createElement('div');
  info.className = 'file-info';

  const name = document.createElement('div');
  name.className = 'file-name';
  name.textContent = file.name;

  const meta = document.createElement('div');
  meta.className = 'file-meta';
  meta.textContent = `${formatBytes(file.size)} • ${formatDate(file.mtime)}`;
  info.appendChild(name);
  info.appendChild(meta);

  let action;
  if (fileIsAudio) {
    audioRows.set(url, row);
    const btn = createPlayButton(file.path);
    const looseAudio = [file];
    btn.onclick = (event) => {
      event.stopPropagation();
      setQueue(looseAudio);
      playTrack(url, btn);
    };
    action = btn;
  } else {
    action = document.createElement('a');
    action.className = 'button button--small';
    action.textContent = '⬇ Download';
    action.href = url;
    action.download = file.name;
  }

  row.appendChild(info);
  row.appendChild(action);

  return row;
}

function normalizeLibrary(data) {
  if (Array.isArray(data.albums)) {
    return {
      albums: data.albums,
      files: (data.files || []).map((file) => ({
        ...file,
        path: file.path || file.name
      }))
    };
  }

  return {
    albums: [],
    files: (data.files || []).map((file) => ({
      name: file.name,
      path: file.path || file.name,
      size: file.size,
      mtime: file.mtime
    }))
  };
}

function showLoadError(message) {
  const port = location.port || '3001';
  const appUrl = `${location.protocol}//${location.hostname}:${port}/`;
  const errorHtml = `
    <div class="files__error">
      <strong>Could not load library.</strong><br>
      ${message}<br><br>
      Use the running server, not the HTML file directly:<br>
      <a href="${appUrl}">${appUrl}</a>
    </div>`;

  if (otherFilesList) {
    otherFilesList.innerHTML = errorHtml;
  }
  if (musicLibraryList) {
    musicLibraryList.innerHTML = '';
  }
  if (musicLibraryPanel) {
    musicLibraryPanel.hidden = true;
  }
  if (libraryHint) {
    libraryHint.hidden = true;
  }
  libraryHasAudio = false;
  updatePlayerBar();
}

function renderLibrary(library) {
  try {
    renderLibraryContent(library);
  } catch (error) {
    console.error('renderLibrary failed:', error);
    showLoadError(error.message || 'Failed to display library.');
  }
}

function renderLibraryContent(library) {
  const { albums, files } = normalizeLibrary(library);

  if (otherFilesList) {
    otherFilesList.innerHTML = '';
  }
  if (musicLibraryList) {
    musicLibraryList.innerHTML = '';
  }
  audioButtons.clear();
  audioRows.clear();

  const wasPlaying = currentFile;
  if (wasPlaying && !trackStillExists(library, wasPlaying)) {
    player.pause();
    player.removeAttribute('src');
    currentFile = null;
    currentButton = null;
    audioPlaylist = [];
  } else if (wasPlaying) {
    const track = allTracksFromLibrary(library).find((t) => trackUrl(t.path) === wasPlaying);
    if (track) {
      const album = albums.find((a) => a.tracks.some((t) => t.path === track.path));
      if (album) {
        setQueue(album.tracks);
      } else {
        setQueue([track]);
      }
    }
  }

  const trackCount = albums.reduce((sum, album) => sum + album.tracks.length, 0);

  if (musicLibraryPanel) {
    musicLibraryPanel.hidden = !albums.length;
  }

  if (musicLibraryMeta) {
    musicLibraryMeta.textContent = albums.length
      ? `${albums.length} albums · ${trackCount} tracks`
      : '';
  }

  if (otherFilesPanel) {
    otherFilesPanel.hidden = !files.length;
  }

  if (!albums.length && !files.length) {
    if (otherFilesList) {
      otherFilesList.innerHTML = '<div class="files__empty">No files yet. Upload above.</div>';
    }
    if (otherFilesPanel) {
      otherFilesPanel.hidden = false;
    }
    if (libraryHint) {
      libraryHint.hidden = true;
    }
    updatePlayerBar();
    return;
  }

  if (libraryHint) {
    libraryHint.hidden = !albums.length;
  }

  if (files.length && otherFilesList) {
    const filesWrap = document.createElement('div');
    filesWrap.className = 'files-flat';
    files.forEach((file) => filesWrap.appendChild(createFileRow(file)));
    otherFilesList.appendChild(filesWrap);
  } else if (otherFilesList) {
    otherFilesList.innerHTML = '<div class="files__empty">No other files yet.</div>';
  }

  if (albums.length && musicLibraryList) {
    const albumList = document.createElement('ul');
    albumList.className = 'album-list';
    albums.forEach((album) => albumList.appendChild(createAlbumItem(album)));
    musicLibraryList.appendChild(albumList);
  }

  libraryHasAudio =
    albums.some((a) => a.tracks.length) || files.some((f) => isAudio(f.name));

  syncRowButtons();
  highlightActiveRow();
  updatePlayerBar();
}

async function fetchFiles() {
  if (!otherFilesList && !musicLibraryList) {
    return;
  }

  if (otherFilesList) {
    otherFilesList.innerHTML = '<div class="files__loading">Loading…</div>';
  }
  if (musicLibraryList) {
    musicLibraryList.innerHTML = '';
  }

  try {
    const response = await fetch('/api/files', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}. Is the server running?`);
    }

    const data = await response.json();
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response from server.');
    }

    if (!Array.isArray(data.albums) && !Array.isArray(data.files)) {
      throw new Error('Server is outdated. Restart from Desktop/file-share with: node server.js');
    }

    renderLibrary(data);
  } catch (error) {
    console.error('fetchFiles failed:', error);
    showLoadError(error.message || 'Network error.');
  }
}

async function uploadFiles(files) {
  if (!files.length) {
    setStatus('Choose or drop files first.', 'error');
    return;
  }

  const customBase = uploadNameInput ? uploadNameInput.value : '';
  setStatus(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`, 'info');

  const formData = new FormData();
  files.forEach((file) => {
    const uploadName =
      files.length === 1 ? buildUploadFilename(file, customBase) : file.name;
    formData.append('files', file, uploadName);
  });

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    pendingUploadFiles = [];
    if (fileInput) {
      fileInput.value = '';
    }
    if (uploadNameInput) {
      uploadNameInput.value = '';
      uploadNameInput.disabled = false;
    }
    if (uploadExtLabel) {
      uploadExtLabel.textContent = '';
    }

    setStatus('Upload complete.', 'success');
    await fetchFiles();
  } catch (error) {
    setStatus('Upload failed. Please try again.', 'error');
  }
}

function handleDragOver(event) {
  event.preventDefault();
  dropZone.classList.add('is-dragover');
}

function handleDragLeave() {
  dropZone.classList.remove('is-dragover');
}

function handleDrop(event) {
  event.preventDefault();
  dropZone.classList.remove('is-dragover');
  stageFilesForUpload(Array.from(event.dataTransfer.files || []));
}

function bindUi() {
  if (browseButton && fileInput) {
    browseButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (event) => {
      stageFilesForUpload(Array.from(event.target.files || []));
    });
  }

  if (uploadButton) {
    uploadButton.addEventListener('click', () => uploadFiles(pendingUploadFiles));
  }

  if (uploadNameInput) {
    uploadNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        uploadFiles(pendingUploadFiles);
      }
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', fetchFiles);
  }

  if (dropZone) {
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
  }

  if (playerPrev) {
    playerPrev.addEventListener('click', playPrevTrack);
  }
  if (playerNext) {
    playerNext.addEventListener('click', playNextTrack);
  }
  if (playerPlayPause) {
    playerPlayPause.addEventListener('click', togglePlayPause);
  }
  if (playerSeek) {
    playerSeek.addEventListener('input', () => {
      isSeeking = true;
      if (player.duration) {
        player.currentTime = (playerSeek.value / 100) * player.duration;
        if (playerTime) {
          playerTime.textContent = `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`;
        }
      }
    });
    playerSeek.addEventListener('change', () => {
      isSeeking = false;
    });
  }
  if (playerVolume) {
    playerVolume.addEventListener('input', () => {
      player.volume = playerVolume.value / 100;
    });
  }
}

async function loadPublicUrl() {
  const link = document.getElementById('publicUrl');
  if (!link) {
    return;
  }

  try {
    const response = await fetch('/api/info');
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (data.publicUrl) {
      link.href = data.publicUrl;
      link.textContent = data.publicUrl;
    }
  } catch (error) {
    // Keep default from HTML
  }
}

bindUi();
player.volume = 1;
loadPublicUrl();
fetchFiles();
