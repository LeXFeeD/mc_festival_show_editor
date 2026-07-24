import './style.css';
import {
  getState, subscribe, undo, redo, canUndo, canRedo,
  addEvent, generateId, calcFestivalTick, calcFestivalTime,
} from './state.ts';
import {
  initAudio, loadAudioFile, play, pause, stop, seek,
  getCurrentTime, getAudioState, isLoaded,
  formatTime,
} from './audio.ts';
import { initTimeline, setTimelineEvents, setPlaybackTime, setZoom, doubleClickEvent, deleteHovered } from './timeline.ts';
import { initEventList, setEventListData } from './eventList.ts';
import { initEffectsPanel, refreshEffectsPanel, initStartTimePanel, refreshStartTimePanel, showEditEventModal } from './ui.ts';
import { exportMcfunction } from './exporter.ts';
import { autosave, loadFromStorage, exportProjectJSON, importProjectJSON } from './storage.ts';

// ─── Elements ────────────────────────────────────────────────────────────────
const elPlayPause   = document.getElementById('btn-play-pause')!;
const elStop        = document.getElementById('btn-stop')!;
const elCurrentTime = document.getElementById('current-time')!;
const elDuration    = document.getElementById('total-duration')!;
const elSeekBar     = document.getElementById('seek-bar') as HTMLInputElement;
const elZoomSlider  = document.getElementById('zoom-slider') as HTMLInputElement;
const elZoomValue   = document.getElementById('zoom-value')!;
const elUndo        = document.getElementById('btn-undo')!;
const elRedo        = document.getElementById('btn-redo')!;
const elExport      = document.getElementById('btn-export')!;
const elExportJSON  = document.getElementById('btn-export-json')!;
const elImportJSON  = document.getElementById('btn-import-json')!;
const elAudioInput  = document.getElementById('audio-file-input') as HTMLInputElement;
const elImportAudio = document.getElementById('btn-import-audio')!;
const elFileName    = document.getElementById('audio-file-name')!;
const elRecInd      = document.getElementById('recording-indicator')!;
const elJsonInput   = document.getElementById('json-file-input') as HTMLInputElement;
const elEffectsPanel = document.getElementById('effects-panel')!;
const elStartTime    = document.getElementById('start-time-container')!;
const elTimeline     = document.getElementById('timeline-canvas') as HTMLCanvasElement;
const elEventsContainer = document.getElementById('events-container')!;

// ─── State sync ──────────────────────────────────────────────────────────────
function syncUI(reRenderEffects = false) {
  const state = getState();
  setTimelineEvents(state.events);
  setEventListData(state.events);
  refreshStartTimePanel(elStartTime);
  if (reRenderEffects) refreshEffectsPanel(elEffectsPanel);
  updateUndoRedoButtons();
  autosave();
}

subscribe(() => syncUI(false));

// ─── Audio player ─────────────────────────────────────────────────────────────
let _seeking = false;

initAudio({
  onLoaded(fileName, duration) {
    elFileName.textContent = fileName;
    elDuration.textContent = formatTime(duration);
    elSeekBar.max = String(Math.floor(duration * 1000));
    elSeekBar.value = '0';
    elCurrentTime.textContent = '00:00.000';
    setPlaybackTime(0, duration);
    toast(`Loaded: ${fileName}`, 'info');
  },
  onTimeUpdate(current, duration) {
    if (!_seeking) {
      elCurrentTime.textContent = formatTime(current);
      elSeekBar.value = String(Math.floor(current * 1000));
    }
    setPlaybackTime(current, duration);
  },
  onStateChange(state) {
    if (state === 'playing') {
      elPlayPause.innerHTML = '&#9646;&#9646;';
      elPlayPause.title = 'Pause (Space)';
      elRecInd.style.display = 'block';
    } else {
      elPlayPause.innerHTML = '&#9654;';
      elPlayPause.title = 'Play (Space)';
      elRecInd.style.display = 'none';
    }
  },
});

elImportAudio.addEventListener('click', () => elAudioInput.click());
elAudioInput.addEventListener('change', () => {
  const file = elAudioInput.files?.[0];
  if (file) loadAudioFile(file);
});

elPlayPause.addEventListener('click', () => {
  if (!isLoaded()) { toast('Load an audio file first', 'error'); return; }
  getAudioState() === 'playing' ? pause() : play();
});

elStop.addEventListener('click', stop);

elSeekBar.addEventListener('mousedown', () => { _seeking = true; });
elSeekBar.addEventListener('input', () => {
  const t = parseInt(elSeekBar.value) / 1000;
  elCurrentTime.textContent = formatTime(t);
});
elSeekBar.addEventListener('mouseup', () => {
  _seeking = false;
  seek(parseInt(elSeekBar.value) / 1000);
});

// ─── Zoom ─────────────────────────────────────────────────────────────────────
elZoomSlider.addEventListener('input', () => {
  const z = parseInt(elZoomSlider.value);
  setZoom(z);
  elZoomValue.textContent = `${z}px/s`;
});

// ─── Effect recording ─────────────────────────────────────────────────────────
function recordEffect(effect: string) {
  const state = getState();
  const playbackTime = getCurrentTime();
  const tick = calcFestivalTick(state.startTime, playbackTime);
  const festivalTime = calcFestivalTime(state.startTime, playbackTime);

  addEvent({
    id: generateId(),
    playbackTime,
    festivalTime,
    tick,
    effect,
  });

  showRecordFlash(effect, tick);
}

function showRecordFlash(effect: string, tick: number) {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position:fixed; bottom:80px; right:20px; z-index:5000;
    background:#1a1a2c; border:1px solid #3a3a58; border-left:3px solid #00c8ff;
    border-radius:6px; padding:10px 16px; font-size:12px; color:#dde0f0;
    box-shadow:0 4px 24px rgba(0,0,0,0.6); pointer-events:none;
    animation: toastIn 150ms ease forwards;
  `;
  flash.innerHTML = `
    <div style="font-family:monospace;color:#00c8ff;font-size:11px">Tick ${tick}</div>
    <div style="font-family:monospace;font-size:13px;margin-top:2px">${effect}</div>
  `;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1500);
}

// ─── Effects panel init ───────────────────────────────────────────────────────
initEffectsPanel(elEffectsPanel, (effect) => {
  recordEffect(effect);
  // Flash the button
  const btn = elEffectsPanel.querySelector(`[data-effect="${effect}"]`) as HTMLElement | null;
  if (btn) {
    btn.style.background = 'rgba(0,200,255,0.2)';
    setTimeout(() => { btn.style.background = ''; }, 300);
  }
});

// ─── Start time panel ─────────────────────────────────────────────────────────
initStartTimePanel(elStartTime);

// ─── Timeline init ────────────────────────────────────────────────────────────
initTimeline(elTimeline, {
  onSeek(time) { seek(time); },
  onEditEvent(event) {
    showEditEventModal(event);
  },
});

elTimeline.addEventListener('dblclick', (e) => {
  doubleClickEvent(e as MouseEvent);
});

// ─── Event list init ──────────────────────────────────────────────────────────
initEventList(elEventsContainer);

// ─── Undo / Redo ──────────────────────────────────────────────────────────────
function updateUndoRedoButtons() {
  elUndo.toggleAttribute('disabled', !canUndo());
  elRedo.toggleAttribute('disabled', !canRedo());
  (elUndo as HTMLButtonElement).style.opacity = canUndo() ? '1' : '0.4';
  (elRedo as HTMLButtonElement).style.opacity = canRedo() ? '1' : '0.4';
}

elUndo.addEventListener('click', () => { undo(); syncUI(true); });
elRedo.addEventListener('click', () => { redo(); syncUI(true); });

// ─── Export ───────────────────────────────────────────────────────────────────
elExport.addEventListener('click', () => exportMcfunction());
elExportJSON.addEventListener('click', () => exportJSON());
elImportJSON.addEventListener('click', () => elJsonInput.click());
elJsonInput.addEventListener('change', () => {
  const file = elJsonInput.files?.[0];
  if (!file) return;
  importProjectJSON(file)
    .then(() => { syncUI(true); toast('Project imported!', 'success'); })
    .catch((err: Error) => toast(err.message, 'error'));
});

function exportJSON() {
  exportProjectJSON();
  toast('Project exported as JSON', 'success');
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  const inInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

  if (e.code === 'Space' && !inInput) {
    e.preventDefault();
    if (!isLoaded()) return;
    getAudioState() === 'playing' ? pause() : play();
  }

  if ((e.key === 's' || e.key === 'S') && !inInput && !e.ctrlKey) {
    stop();
  }

  if (e.ctrlKey || e.metaKey) {
    switch (e.key) {
      case 'z': e.preventDefault(); undo(); syncUI(true); break;
      case 'y': e.preventDefault(); redo(); syncUI(true); break;
      case 'e': e.preventDefault(); exportMcfunction(); break;
      case 'o': e.preventDefault(); elAudioInput.click(); break;
      default: break;
    }
  }

  if (e.key === 'Delete' && !inInput) {
    deleteHovered();
  }
});

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg: string, type: 'info' | 'success' | 'error' = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  const container = document.getElementById('toast-container')!;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── Load saved state ─────────────────────────────────────────────────────────
const loaded = loadFromStorage();
if (loaded) {
  syncUI(true);
  toast('Project restored from autosave', 'info');
} else {
  syncUI(true);
}

updateUndoRedoButtons();
