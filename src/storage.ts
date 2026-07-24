import type { AppState } from './types.ts';
import { getState, loadState } from './state.ts';

const STORAGE_KEY = 'mc_festival_show_editor';
let _autosaveTimer: number | null = null;

export function autosave() {
  if (_autosaveTimer !== null) clearTimeout(_autosaveTimer);
  _autosaveTimer = window.setTimeout(() => {
    const state = getState();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full or unavailable
    }
  }, 800);
}

export function loadFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const state: AppState = JSON.parse(raw);
    loadState(state);
    return true;
  } catch {
    return false;
  }
}

export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportProjectJSON() {
  const state = getState();
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mc_festival_project.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function importProjectJSON(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const state: AppState = JSON.parse(reader.result as string);
        loadState(state);
        resolve();
      } catch {
        reject(new Error('Invalid project file'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}
