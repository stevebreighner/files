const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseButton = document.getElementById('browseButton');
const refreshButton = document.getElementById('refreshButton');
const statusEl = document.getElementById('status');
const fileList = document.getElementById('fileList');

function setStatus(message, type = 'info') {
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

async function fetchFiles() {
  try {
    const response = await fetch('/api/files');
    const data = await response.json();
    renderFiles(data.files || []);
  } catch (error) {
    renderFiles([]);
  }
}

function renderFiles(files) {
  fileList.innerHTML = '';
  if (!files.length) {
    fileList.innerHTML = '<div class="files__empty">No files yet.</div>';
    return;
  }

  files.forEach((file) => {
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

    const action = document.createElement('a');
    action.className = 'button button--small';
    action.href = `/download/${encodeURIComponent(file.name)}`;
    action.textContent = 'Download';

    row.appendChild(info);
    row.appendChild(action);
    fileList.appendChild(row);
  });
}

async function uploadFiles(files) {
  if (!files.length) {
    return;
  }

  setStatus(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`, 'info');

  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Upload failed');
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
  const files = Array.from(event.dataTransfer.files || []);
  uploadFiles(files);
}

browseButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => {
  const files = Array.from(event.target.files || []);
  uploadFiles(files);
  fileInput.value = '';
});

refreshButton.addEventListener('click', fetchFiles);

dropZone.addEventListener('dragover', handleDragOver);
dropZone.addEventListener('dragleave', handleDragLeave);
dropZone.addEventListener('drop', handleDrop);

document.addEventListener('DOMContentLoaded', () => {
  fetchFiles();
});

fetchFiles();
