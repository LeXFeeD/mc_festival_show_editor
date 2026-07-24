import type { AppEvent, StartTime } from './types.ts';
import { EFFECT_CATEGORIES, ALL_EFFECTS, getEffectColor } from './effects.ts';
import { getState, toggleFavorite, setStartTime, removeEvent as removeEventFromState } from './state.ts';
import { updateEventFromModal } from './eventList.ts';
import { calcFestivalTick, calcFestivalTime } from './state.ts';
import type { ParsedImportResult } from './exporter.ts';

type EffectClickCallback = (effect: string) => void;

let _onEffectClick: EffectClickCallback | null = null;
let _searchQuery = '';
let _showFavoritesOnly = false;
let _collapsedCategories: Set<string> = new Set();

export function initEffectsPanel(panel: HTMLElement, onEffectClick: EffectClickCallback) {
  _onEffectClick = onEffectClick;
  renderEffectsPanel(panel);
}

export function refreshEffectsPanel(panel: HTMLElement) {
  renderEffectsPanel(panel);
}

function renderEffectsPanel(panel: HTMLElement) {
  const state = getState();
  const favSet = new Set(state.favorites);

  const filteredCategories = EFFECT_CATEGORIES.map(cat => ({
    ...cat,
    effects: cat.effects.filter(effect => {
      const matchesSearch = !_searchQuery || effect.includes(_searchQuery.toLowerCase());
      const matchesFav = !_showFavoritesOnly || favSet.has(effect);
      return matchesSearch && matchesFav;
    }),
  })).filter(cat => cat.effects.length > 0);

  panel.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">Effects Library</span>
    </div>
    <div class="effects-search-row">
      <input type="text" id="effects-search" placeholder="Search effects..." value="${escHtml(_searchQuery)}" class="search-input" />
      <button class="btn-icon ${_showFavoritesOnly ? 'active' : ''}" id="toggle-favorites" title="Show Favorites">★</button>
    </div>
    <div class="effects-categories">
      ${filteredCategories.map(cat => renderCategory(cat.name, cat.type, cat.effects, favSet)).join('')}
      ${filteredCategories.length === 0 ? '<div class="empty-state">No effects found.</div>' : ''}
    </div>
  `;

  panel.querySelector('#effects-search')?.addEventListener('input', (e) => {
    _searchQuery = (e.target as HTMLInputElement).value;
    renderEffectsPanel(panel);
  });

  panel.querySelector('#toggle-favorites')?.addEventListener('click', () => {
    _showFavoritesOnly = !_showFavoritesOnly;
    renderEffectsPanel(panel);
  });

  panel.querySelectorAll('.category-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.category!;
      if (_collapsedCategories.has(name)) {
        _collapsedCategories.delete(name);
      } else {
        _collapsedCategories.add(name);
      }
      renderEffectsPanel(panel);
    });
  });

  panel.querySelectorAll('.effect-btn').forEach(btn => {
    const effect = (btn as HTMLElement).dataset.effect!;
    btn.addEventListener('click', () => _onEffectClick?.(effect));
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      toggleFavorite(effect);
      renderEffectsPanel(panel);
    });
  });
}

function renderCategory(
  name: string,
  _type: 'continuous' | 'impulse',
  effects: string[],
  favSet: Set<string>
): string {
  const collapsed = _collapsedCategories.has(name);
  return `
    <div class="effect-category">
      <button class="category-toggle" data-category="${escHtml(name)}">
        <span class="category-arrow">${collapsed ? '▶' : '▼'}</span>
        <span class="category-name">${escHtml(name)}</span>
        <span class="category-count">${effects.length}</span>
      </button>
      ${collapsed ? '' : `
        <div class="effect-buttons">
          ${effects.map(effect => renderEffectBtn(effect, favSet.has(effect))).join('')}
        </div>
      `}
    </div>
  `;
}

function renderEffectBtn(effect: string, isFav: boolean): string {
  const color = getEffectColor(effect);
  const label = effect.replace(/_/g, ' ');
  return `
    <button class="effect-btn" data-effect="${escHtml(effect)}"
      style="--effect-color: ${color}"
      title="Click: record | Right-click: ${isFav ? 'remove favorite' : 'add favorite'}">
      ${isFav ? '<span class="fav-star">★</span>' : ''}
      <span class="effect-label">${escHtml(label)}</span>
    </button>
  `;
}

function escHtml(str: string): string {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Start Time ───────────────────────────────────────────────────────────────

export function initStartTimePanel(container: HTMLElement) {
  renderStartTimePanel(container);
}

export function refreshStartTimePanel(container: HTMLElement) {
  renderStartTimePanel(container);
}

function renderStartTimePanel(container: HTMLElement) {
  const state = getState();
  const st = state.startTime;
  const totalSec = st.hours * 3600 + st.minutes * 60 + st.seconds;
  const startTick = Math.round(totalSec * 20);

  container.innerHTML = `
    <div class="start-time-panel">
      <div class="start-time-label">Artist Festival Start</div>
      <div class="start-time-inputs">
        <div class="time-input-group">
          <input type="number" id="st-hours" class="time-input" min="0" max="23"
            value="${st.hours}" placeholder="HH" />
          <label>h</label>
        </div>
        <span class="time-sep">:</span>
        <div class="time-input-group">
          <input type="number" id="st-minutes" class="time-input" min="0" max="59"
            value="${st.minutes}" placeholder="MM" />
          <label>m</label>
        </div>
        <span class="time-sep">:</span>
        <div class="time-input-group">
          <input type="number" id="st-seconds" class="time-input" min="0" max="59"
            value="${st.seconds}" placeholder="SS" />
          <label>s</label>
        </div>
      </div>
      <div class="start-tick-display">
        Start Tick: <strong>${startTick.toLocaleString()}</strong>
      </div>
    </div>
  `;

  function readAndSave() {
    const h = parseInt((container.querySelector('#st-hours') as HTMLInputElement).value) || 0;
    const m = parseInt((container.querySelector('#st-minutes') as HTMLInputElement).value) || 0;
    const s = parseInt((container.querySelector('#st-seconds') as HTMLInputElement).value) || 0;
    const newSt: StartTime = { hours: h, minutes: m, seconds: s };
    setStartTime(newSt);
  }

  container.querySelectorAll('.time-input').forEach(input => {
    input.addEventListener('change', readAndSave);
    input.addEventListener('input', readAndSave);
  });
}

// ─── Edit Event Modal ─────────────────────────────────────────────────────────

export function showEditEventModal(event: AppEvent) {
  const existing = document.getElementById('edit-event-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'edit-event-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3>Edit Event</h3>
        <button class="btn-icon modal-close" id="close-edit-modal">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Playback Time (seconds)</label>
          <input type="number" id="edit-playback" step="0.001" min="0"
            value="${event.playbackTime.toFixed(3)}" class="form-input" />
        </div>
        <div class="form-group">
          <label>Effect</label>
          <select id="edit-effect" class="form-input">
            ${ALL_EFFECTS.map(e =>
              `<option value="${escHtml(e)}" ${e === event.effect ? 'selected' : ''}>${escHtml(e)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group tick-preview">
          <label>Calculated Tick</label>
          <div id="tick-preview" class="tick-display">${event.tick}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger" id="delete-event-btn">Delete</button>
        <div class="modal-footer-right">
          <button class="btn btn-ghost" id="cancel-edit-btn">Cancel</button>
          <button class="btn btn-primary" id="save-edit-btn">Save</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const state = getState();
  const startTime = state.startTime;

  function updateTickPreview() {
    const pt = parseFloat((modal.querySelector('#edit-playback') as HTMLInputElement).value) || 0;
    const tick = calcFestivalTick(startTime, pt);
    const preview = modal.querySelector('#tick-preview')!;
    preview.textContent = String(tick);
  }

  modal.querySelector('#edit-playback')?.addEventListener('input', updateTickPreview);

  modal.querySelector('#close-edit-modal')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#cancel-edit-btn')?.addEventListener('click', () => modal.remove());

  modal.querySelector('#delete-event-btn')?.addEventListener('click', () => {
    if (confirm('Delete this event?')) {
      removeEventFromState(event.id);
      modal.remove();
    }
  });

  modal.querySelector('#save-edit-btn')?.addEventListener('click', () => {
    const pt = parseFloat((modal.querySelector('#edit-playback') as HTMLInputElement).value) || 0;
    const effect = (modal.querySelector('#edit-effect') as HTMLSelectElement).value;
    const tick = calcFestivalTick(startTime, pt);
    const festivalTime = calcFestivalTime(startTime, pt);
    updateEventFromModal(event.id, { playbackTime: pt, effect, tick, festivalTime });
    modal.remove();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// ─── Import .mcfunction Modal ─────────────────────────────────────────────────

export function showImportMcfunctionModal(result: ParsedImportResult, onConfirm: (events: AppEvent[], replace: boolean, skipNegative: boolean) => void) {
  const existing = document.getElementById('import-mc-modal');
  if (existing) existing.remove();

  const hasNegative = result.negativeCount > 0;
  const hasValid = result.events.length > 0;

  const modal = document.createElement('div');
  modal.id = 'import-mc-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="width:500px">
      <div class="modal-header">
        <h3>Import .mcfunction</h3>
        <button class="btn-icon modal-close" id="close-import-modal">✕</button>
      </div>
      <div class="modal-body">
        <div class="import-file-name">
          <span class="import-file-icon">📄</span>
          <span>${escHtml(result.fileName)}</span>
        </div>

        <div class="import-stats">
          <div class="import-stat">
            <div class="import-stat-value ${!hasValid ? 'stat-warn' : ''}">${result.events.length}</div>
            <div class="import-stat-label">Events found</div>
          </div>
          ${result.skippedLines > 0 ? `
          <div class="import-stat">
            <div class="import-stat-value stat-muted">${result.skippedLines}</div>
            <div class="import-stat-label">Lines skipped</div>
          </div>` : ''}
          ${hasNegative ? `
          <div class="import-stat">
            <div class="import-stat-value stat-warn">${result.negativeCount}</div>
            <div class="import-stat-label">Before artist start</div>
          </div>` : ''}
          ${result.events.length > 0 ? `
          <div class="import-stat">
            <div class="import-stat-value stat-accent">${result.events[0].tick}</div>
            <div class="import-stat-label">First tick</div>
          </div>
          <div class="import-stat">
            <div class="import-stat-value stat-accent">${result.events[result.events.length - 1].tick}</div>
            <div class="import-stat-label">Last tick</div>
          </div>` : ''}
        </div>

        ${hasNegative ? `
        <div class="import-warning">
          <strong>⚠ ${result.negativeCount} event${result.negativeCount > 1 ? 's' : ''} fall before your current artist start time.</strong>
          <br>These events will have a negative playback time. You may skip them or import all.
          <div class="import-negative-option" style="margin-top:10px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="skip-negative" checked />
              <span>Skip events before artist start time</span>
            </label>
          </div>
        </div>` : ''}

        ${!hasValid ? `<div class="import-warning">No valid <code>execute if score</code> lines found. Check the file format.</div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="cancel-import-btn">Cancel</button>
        <div class="modal-footer-right">
          <button class="btn btn-ghost" id="add-import-btn" ${!hasValid ? 'disabled' : ''}>Add to Existing</button>
          <button class="btn btn-primary" id="replace-import-btn" ${!hasValid ? 'disabled' : ''}>Replace All</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#close-import-modal')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#cancel-import-btn')?.addEventListener('click', () => modal.remove());

  function getSkipNegative(): boolean {
    return (modal.querySelector('#skip-negative') as HTMLInputElement | null)?.checked ?? false;
  }

  modal.querySelector('#add-import-btn')?.addEventListener('click', () => {
    onConfirm(result.events, false, getSkipNegative());
    modal.remove();
  });

  modal.querySelector('#replace-import-btn')?.addEventListener('click', () => {
    onConfirm(result.events, true, getSkipNegative());
    modal.remove();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}


