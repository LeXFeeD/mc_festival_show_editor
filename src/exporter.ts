import { getState, generateId } from './state.ts';
import type { AppEvent } from './types.ts';

export interface ParsedImportResult {
  events: AppEvent[];
  totalLines: number;
  skippedLines: number;
  negativeCount: number;
  fileName: string;
}

const MC_PATTERN = /^execute if score Timer show matches (\d+) run function festival:(.+)$/i;

export function parseMcfunctionContent(content: string, fileName: string): ParsedImportResult {
  const state = getState();
  const st = state.startTime;
  const startSeconds = st.hours * 3600 + st.minutes * 60 + st.seconds;

  const lines = content.split('\n');
  const events: AppEvent[] = [];
  let skippedLines = 0;
  let negativeCount = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(MC_PATTERN);
    if (!match) {
      skippedLines++;
      continue;
    }

    const tick = parseInt(match[1], 10);
    const effect = match[2].trim();
    const festivalTime = tick / 20;
    const playbackTime = festivalTime - startSeconds;

    if (playbackTime < 0) negativeCount++;

    events.push({ id: generateId(), tick, effect, festivalTime, playbackTime });
  }

  // Sort by tick ascending
  events.sort((a, b) => a.tick - b.tick);

  return { events, totalLines: lines.length, skippedLines, negativeCount, fileName };
}

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

  downloadText(lines.join('\n'), `${fileName}.mcfunction`, 'text/plain');
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
