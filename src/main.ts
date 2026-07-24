import './style.css';
import {
  getState, subscribe, undo, redo, canUndo, canRedo,
  addEvent, clearEvents, generateId, calcFestivalTick, calcFestivalTime,
} from './state.ts';
import {
  initAudio, loadAudioFile, play, pause, stop, seek,
  getCurrentTime, getAudioState, isLoaded,
  formatTime,
} from './audio.ts';
import { initTimeline, setTimelineEvents, setPlaybackTime, setZoom, doubleClickEvent, deleteHovered } from './timeline.ts';
import { initEventList, setEventListData } from './eventList.ts';
import { initEffectsPanel, refreshEffectsPanel, initStartTimePanel, refreshStartTimePanel, showEditEventModal, showImportMcfunctionModal } from './ui.ts';
import { exportMcfunction, parseMcfunctionContent } from './exporter.ts';
import { autosave, loadFromStorage, exportProjectJSON, importProjectJSON } from './storage.ts';

// ─── Elements ────────────────────────────────────────────────────────────────
const elPlayPause    = document.getElementById('btn-play-pause')!;
const elStop         = document.getElementById('btn-stop')!;
const elCurrentTime  = document.getElementById('current-time') as HTMLInputElement;
const elDuration     = document.getElementById('total-duration')!;
const elSeekBar      = document.getElementById('seek-bar') as HTMLInputElement;
const elZoomSlider   = document.getElementById('zoom-slider') as HTMLInputElement;
const elZoomValue    = document.getElementById('zoom-value')!;
const elUndo         = document.getElementById('btn-undo')!;
const elRedo         = document.getElementById('btn-redo')!;
const elExport       = document.getElementById('btn-export')!;
const elExportJSON   = document.getElementById('btn-export-json')!;
const elImportJSON   = document.getElementById('btn-import-json')!;
const elAudioInput   = document.getElementById('audio-file-input') as HTMLInputElement;
const elImportAudio  = document.getElementById('btn-import-audio')!;
const elFileName     = document.getElementById('audio-file-name')!;
const elRecInd       = document.getElementById('recording-indicator')!;
const elJsonInput         = document.getElementById('json-file-input') as HTMLInputElement;
const elMcfunctionInput   = document.getElementById('mcfunction-file-input') as HTMLInputElement;
const elImportMcfunction  = document.getElementById('btn-import-mcfunction')!;
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
let _editingTime = false; // user is typing in the time input

initAudio({
  onLoaded(fileName, duration) {
    elFileName.textContent = fileName;
    elDuration.textContent = `/ ${formatTime(duration)}`;
    elSeekBar.max = String(Math.floor(duration * 1000));
    elSeekBar.value = '0';
    if (!_editingTime) elCurrentTime.value = formatTime(0);
    setPlaybackTime(0, duration);
    toast(`Loaded: ${fileName}`, 'info');
  },
  onTimeUpdate(current, duration) {
    if (!_seeking && !_editingTime) {
      elCurrentTime.value = formatTime(current);
      elCurrentTime.classList.remove('invalid');
    }
    if (!_seeking) elSeekBar.value = String(Math.floor(current * 1000));
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
  if (!_editingTime) elCurrentTime.value = formatTime(t);
});
elSeekBar.addEventListener('mouseup', () => {
  _seeking = false;
  seek(parseInt(elSeekBar.value) / 1000);
});

// ─── Time input (manual editing) ──────────────────────────────────────────────
elCurrentTime.addEventListener('focus', () => {
  _editingTime = true;
  elCurrentTime.select();
});

elCurrentTime.addEventListener('blur', () => {
  _editingTime = false;
  const t = parseTimeInput(elCurrentTime.value);
  if (t !== null && isLoaded()) {
    seek(t);
    elCurrentTime.classList.remove('invalid');
  } else {
    // Restore current time display if invalid
    elCurrentTime.value = formatTime(getCurrentTime());
    elCurrentTime.classList.remove('invalid');
  }
});

elCurrentTime.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    elCurrentTime.blur();
  } else if (e.key === 'Escape') {
    _editingTime = false;
    elCurrentTime.value = formatTime(getCurrentTime());
    elCurrentTime.classList.remove('invalid');
    elCurrentTime.blur();
  }
});

elCurrentTime.addEventListener('input', () => {
  const t = parseTimeInput(elCurrentTime.value);
  if (t !== null) {
    elCurrentTime.classList.remove('invalid');
  } else {
    elCurrentTime.classList.add('invalid');
  }
});

function parseTimeInput(str: string): number | null {
  str = str.trim();
  // HH:MM:SS.mmm  or  HH:MM:SS
  const m1 = str.match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/);
  if (m1) {
    const h = parseInt(m1[1]);
    const m = parseInt(m1[2]);
    const s = parseInt(m1[3]);
    const ms = m1[4] ? parseFloat('0.' + m1[4]) : 0;
    return h * 3600 + m * 60 + s + ms;
  }
  // MM:SS.mmm  or  MM:SS
  const m2 = str.match(/^(\d+):(\d{1,2})(?:[.,](\d+))?$/);
  if (m2) {
    const m = parseInt(m2[1]);
    const s = parseInt(m2[2]);
    const ms = m2[3] ? parseFloat('0.' + m2[3]) : 0;
    return m * 60 + s + ms;
  }
  // Plain seconds
  const n = parseFloat(str);
  if (!isNaN(n) && n >= 0) return n;
  return null;
}

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

// ─── Effects panel ────────────────────────────────────────────────────────────
initEffectsPanel(elEffectsPanel, (effect) => {
  recordEffect(effect);
  const btn = elEffectsPanel.querySelector(`[data-effect="${effect}"]`) as HTMLElement | null;
  if (btn) {
    btn.style.background = 'rgba(0,200,255,0.2)';
    setTimeout(() => { btn.style.background = ''; }, 300);
  }
});

// ─── Start time panel ─────────────────────────────────────────────────────────
initStartTimePanel(elStartTime);

// ─── Timeline ────────────────────────────────────────────────────────────────
initTimeline(elTimeline, {
  onSeek(time) { seek(time); },
  onEditEvent(event) { showEditEventModal(event); },
});

elTimeline.addEventListener('dblclick', (e) => {
  doubleClickEvent(e as MouseEvent);
});

// ─── Event list ───────────────────────────────────────────────────────────────
initEventList(elEventsContainer);

// ─── Undo / Redo ──────────────────────────────────────────────────────────────
function updateUndoRedoButtons() {
  (elUndo as HTMLButtonElement).style.opacity = canUndo() ? '1' : '0.4';
  (elRedo as HTMLButtonElement).style.opacity = canRedo() ? '1' : '0.4';
}

elUndo.addEventListener('click', () => { undo(); syncUI(true); });
elRedo.addEventListener('click', () => { redo(); syncUI(true); });

// ─── Export ───────────────────────────────────────────────────────────────────
elExport.addEventListener('click', () => exportMcfunction());
elExportJSON.addEventListener('click', () => { exportProjectJSON(); toast('Project exported as JSON', 'success'); });
elImportJSON.addEventListener('click', () => elJsonInput.click());

// ─── Import .mcfunction ───────────────────────────────────────────────────────
elImportMcfunction.addEventListener('click', () => elMcfunctionInput.click());
elMcfunctionInput.addEventListener('change', () => {
  const file = elMcfunctionInput.files?.[0];
  if (!file) return;
  elMcfunctionInput.value = '';
  const reader = new FileReader();
  reader.onload = () => {
    const content = reader.result as string;
    const result = parseMcfunctionContent(content, file.name);
    showImportMcfunctionModal(result, (events, replace, skipNegative) => {
      const toImport = skipNegative ? events.filter(e => e.playbackTime >= 0) : events;
      if (replace) clearEvents();
      for (const ev of toImport) addEvent(ev);
      const count = toImport.length;
      toast(`Imported ${count} event${count !== 1 ? 's' : ''}${replace ? ' (replaced existing)' : ''}`, 'success');
      syncUI(false);
    });
  };
  reader.onerror = () => toast('Could not read file', 'error');
  reader.readAsText(file);
});

elJsonInput.addEventListener('change', () => {
  const file = elJsonInput.files?.[0];
  if (!file) return;
  importProjectJSON(file)
    .then(() => { syncUI(true); toast('Project imported!', 'success'); })
    .catch((err: Error) => toast(err.message, 'error'));
});

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  const isInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

  if (e.code === 'Space' && !isInput) {
    e.preventDefault();
    if (!isLoaded()) return;
    getAudioState() === 'playing' ? pause() : play();
  }

  if ((e.key === 's' || e.key === 'S') && !isInput && !e.ctrlKey) stop();

  if (e.ctrlKey || e.metaKey) {
    switch (e.key) {
      case 'z': e.preventDefault(); undo(); syncUI(true); break;
      case 'y': e.preventDefault(); redo(); syncUI(true); break;
      case 'e': e.preventDefault(); exportMcfunction(); break;
      case 'o': e.preventDefault(); elAudioInput.click(); break;
      default: break;
    }
  }

  if (e.key === 'Delete' && !isInput) deleteHovered();
});

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg: string, type: 'info' | 'success' | 'error' = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container')!.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
const loaded = loadFromStorage();
syncUI(true);
if (loaded) toast('Project restored from autosave', 'info');
updateUndoRedoButtons();
