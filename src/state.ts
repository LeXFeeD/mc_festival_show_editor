import type { AppEvent, AppState, StartTime, StateChangeListener } from './types.ts';

const EMPTY_STATE: AppState = {
  events: [],
  startTime: { hours: 0, minutes: 0, seconds: 0 },
  favorites: [],
  audioFileName: '',
};

const MAX_UNDO = 50;

let _state: AppState = structuredClone(EMPTY_STATE);
let _undoStack: AppState[] = [];
let _redoStack: AppState[] = [];
const _listeners: StateChangeListener[] = [];

function snapshot() {
  _undoStack.push(structuredClone(_state));
  if (_undoStack.length > MAX_UNDO) _undoStack.shift();
  _redoStack = [];
}

function emit() {
  for (const fn of _listeners) fn(_state);
}

export function getState(): AppState {
  return _state;
}

export function subscribe(fn: StateChangeListener) {
  _listeners.push(fn);
}

export function loadState(state: AppState) {
  _state = structuredClone(state);
  _undoStack = [];
  _redoStack = [];
  emit();
}

export function undo() {
  if (_undoStack.length === 0) return;
  _redoStack.push(structuredClone(_state));
  _state = _undoStack.pop()!;
  emit();
}

export function redo() {
  if (_redoStack.length === 0) return;
  _undoStack.push(structuredClone(_state));
  _state = _redoStack.pop()!;
  emit();
}

export function canUndo() { return _undoStack.length > 0; }
export function canRedo() { return _redoStack.length > 0; }

export function addEvent(event: AppEvent) {
  snapshot();
  _state.events = [..._state.events, event];
  emit();
}

export function removeEvent(id: string) {
  snapshot();
  _state.events = _state.events.filter(e => e.id !== id);
  emit();
}

export function updateEvent(id: string, patch: Partial<AppEvent>) {
  snapshot();
  _state.events = _state.events.map(e => e.id === id ? { ...e, ...patch } : e);
  emit();
}

export function setStartTime(st: StartTime) {
  snapshot();
  _state.startTime = { ...st };
  emit();
}

export function toggleFavorite(effect: string) {
  snapshot();
  const idx = _state.favorites.indexOf(effect);
  if (idx === -1) {
    _state.favorites = [..._state.favorites, effect];
  } else {
    _state.favorites = _state.favorites.filter(f => f !== effect);
  }
  emit();
}

export function setAudioFileName(name: string) {
  _state.audioFileName = name;
  emit();
}

export function clearEvents() {
  snapshot();
  _state.events = [];
  emit();
}

export function startTimeToSeconds(st: StartTime): number {
  return st.hours * 3600 + st.minutes * 60 + st.seconds;
}

export function calcFestivalTick(startTime: StartTime, playbackSeconds: number): number {
  const startSec = startTimeToSeconds(startTime);
  return Math.round((startSec + playbackSeconds) * 20);
}

export function calcFestivalTime(startTime: StartTime, playbackSeconds: number): number {
  return startTimeToSeconds(startTime) + playbackSeconds;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
