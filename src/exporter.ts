import { getState } from './state.ts';

export function exportMcfunction() {
  const state = getState();
  if (state.events.length === 0) {
    alert('No events to export.');
    return;
  }

  const artistName = prompt('Enter the artist name:', 'artist_name');
  if (artistName === null) return;

  const fileName = artistName.toLowerCase().replace(/\s+/g, '_') || 'show';
  const sorted = [...state.events].sort((a, b) => a.tick - b.tick);

  const lines = sorted.map(ev =>
    `execute if score Timer show matches ${ev.tick} run function festival:${ev.effect}`
  );

  const content = lines.join('\n');
  downloadText(content, `${fileName}.mcfunction`, 'text/plain');
}

export function exportJSON() {
  const state = getState();
  const json = JSON.stringify(state, null, 2);
  downloadText(json, 'mc_festival_project.json', 'application/json');
}

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
