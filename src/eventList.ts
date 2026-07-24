import type { AppEvent, SortColumn, SortDirection } from './types.ts';
import { updateEvent, removeEvent } from './state.ts';
import { formatTime } from './audio.ts';
import { ALL_EFFECTS } from './effects.ts';
import { showEditEventModal } from './ui.ts';

let _container: HTMLElement;
let _events: AppEvent[] = [];
let _sortCol: SortColumn = 'tick';
let _sortDir: SortDirection = 'asc';

export function initEventList(container: HTMLElement) {
  _container = container;
  render();
}

export function setEventListData(events: AppEvent[]) {
  _events = events;
  render();
}

function sortedEvents(): AppEvent[] {
  return [..._events].sort((a, b) => {
    let va: number | string = a[_sortCol];
    let vb: number | string = b[_sortCol];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    const dir = _sortDir === 'asc' ? 1 : -1;
    return va < vb ? -dir : va > vb ? dir : 0;
  });
}

function formatFestivalTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function render() {
  const sorted = sortedEvents();

  _container.innerHTML = `
    <div class="event-list-header">
      <h3>Event List <span class="event-count">${_events.length} events</span></h3>
      <div class="event-list-actions">
        <button class="btn-ghost btn-sm" id="sort-by-tick">Sort by Tick</button>
        <button class="btn-ghost btn-sm danger" id="clear-events">Clear All</button>
      </div>
    </div>
    <div class="event-table-wrapper">
      <table class="event-table">
        <thead>
          <tr>
            <th class="sortable ${_sortCol==='playbackTime'?'active':''}" data-col="playbackTime">
              Playback <span class="sort-indicator">${sortIndicator('playbackTime')}</span>
            </th>
            <th class="sortable ${_sortCol==='festivalTime'?'active':''}" data-col="festivalTime">
              Festival Time <span class="sort-indicator">${sortIndicator('festivalTime')}</span>
            </th>
            <th class="sortable ${_sortCol==='tick'?'active':''}" data-col="tick">
              Tick <span class="sort-indicator">${sortIndicator('tick')}</span>
            </th>
            <th class="sortable ${_sortCol==='effect'?'active':''}" data-col="effect">
              Effect <span class="sort-indicator">${sortIndicator('effect')}</span>
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(ev => renderRow(ev)).join('')}
        </tbody>
      </table>
      ${sorted.length === 0 ? '<div class="empty-state">No events recorded yet. Play audio and click effects to record.</div>' : ''}
    </div>
  `;

  _container.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = (th as HTMLElement).dataset.col as SortColumn;
      if (_sortCol === col) {
        _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        _sortCol = col;
        _sortDir = 'asc';
      }
      render();
    });
  });

  _container.querySelector('#sort-by-tick')?.addEventListener('click', () => {
    _sortCol = 'tick';
    _sortDir = 'asc';
    render();
  });

  _container.querySelector('#clear-events')?.addEventListener('click', () => {
    if (sorted.length === 0) return;
    if (confirm(`Delete all ${sorted.length} events?`)) {
      for (const ev of _events) removeEvent(ev.id);
    }
  });

  _container.querySelectorAll('.btn-edit-event').forEach(btn => {
    const id = (btn as HTMLElement).dataset.id!;
    btn.addEventListener('click', () => {
      const ev = _events.find(e => e.id === id);
      if (ev) showEditEventModal(ev);
    });
  });

  _container.querySelectorAll('.btn-delete-event').forEach(btn => {
    const id = (btn as HTMLElement).dataset.id!;
    btn.addEventListener('click', () => {
      if (confirm('Delete this event?')) removeEvent(id);
    });
  });
}

function sortIndicator(col: SortColumn): string {
  if (_sortCol !== col) return '↕';
  return _sortDir === 'asc' ? '↑' : '↓';
}

function renderRow(ev: AppEvent): string {
  return `
    <tr class="event-row" data-id="${ev.id}">
      <td class="mono">${formatTime(ev.playbackTime)}</td>
      <td class="mono">${formatFestivalTime(ev.festivalTime)}</td>
      <td class="mono tick-cell">${ev.tick}</td>
      <td class="effect-cell">
        <span class="effect-badge" style="border-color:${getEffectColorCSS(ev.effect)}">
          ${ev.effect}
        </span>
      </td>
      <td class="actions-cell">
        <button class="btn-icon btn-edit-event" data-id="${ev.id}" title="Edit">✎</button>
        <button class="btn-icon btn-delete-event danger" data-id="${ev.id}" title="Delete">✕</button>
      </td>
    </tr>
  `;
}

function getEffectColorCSS(effect: string): string {
  if (effect.endsWith('_on')) return '#00cc66';
  if (effect.endsWith('_off')) return '#cc3300';
  return '#ff9500';
}

export function updateEventFromModal(id: string, patch: Partial<AppEvent>) {
  updateEvent(id, patch);
}

export { ALL_EFFECTS };
