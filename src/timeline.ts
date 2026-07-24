import type { AppEvent } from './types.ts';
import { getEffectColor } from './effects.ts';
import { updateEvent, removeEvent } from './state.ts';
import { formatTimeShort } from './audio.ts';

interface TimelineOptions {
  onSeek: (time: number) => void;
  onEditEvent: (event: AppEvent) => void;
}

const RULER_HEIGHT = 32;
const LABEL_FONT = '10px Inter, monospace';
const RULER_FONT = '11px Inter, monospace';
const SCROLLBAR_H = 10;

let _canvas: HTMLCanvasElement;
let _ctx: CanvasRenderingContext2D;
let _scrollbarEl: HTMLElement;
let _scrollbarInnerEl: HTMLElement;
let _events: AppEvent[] = [];
let _currentTime = 0;
let _duration = 0;
let _pixelsPerSecond = 80;
let _scrollOffset = 0; // world pixels scrolled from the left
let _options: TimelineOptions;
let _dragging: { id: string; startWorldX: number; origTime: number } | null = null;
let _hoveredId: string | null = null;
let _animFrame: number | null = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initTimeline(canvas: HTMLCanvasElement, options: TimelineOptions) {
  _canvas = canvas;
  _ctx = canvas.getContext('2d')!;
  _options = options;

  const outer = canvas.parentElement!;
  _scrollbarEl = outer.querySelector('#timeline-scrollbar')!;
  _scrollbarInnerEl = outer.querySelector('#timeline-scrollbar-inner')!;

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  _scrollbarEl.addEventListener('scroll', () => {
    _scrollOffset = _scrollbarEl.scrollLeft;
    scheduleRender();
  });

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function setTimelineEvents(events: AppEvent[]) {
  _events = events;
  scheduleRender();
}

export function setPlaybackTime(time: number, duration: number) {
  _currentTime = time;
  _duration = duration;
  updateScrollbarWidth();
  autoScrollToPlayhead();
  scheduleRender();
}

export function setZoom(pps: number) {
  _pixelsPerSecond = Math.max(20, Math.min(600, pps));
  updateScrollbarWidth();
  scheduleRender();
}

export function getZoom(): number { return _pixelsPerSecond; }

// ─── Coordinate helpers ───────────────────────────────────────────────────────
function canvasXToTime(canvasX: number): number {
  return (canvasX + _scrollOffset) / _pixelsPerSecond;
}

function timeToCanvasX(time: number): number {
  return time * _pixelsPerSecond - _scrollOffset;
}

// ─── Resize / Scrollbar ───────────────────────────────────────────────────────
function resizeCanvas() {
  if (!_canvas) return;
  const outer = _canvas.parentElement!;
  const w = outer.clientWidth || 600;
  const h = (outer.clientHeight || (RULER_HEIGHT + 120)) - SCROLLBAR_H;
  _canvas.width = w;
  _canvas.height = h;
  updateScrollbarWidth();
  scheduleRender();
}

function updateScrollbarWidth() {
  if (!_scrollbarInnerEl || !_canvas) return;
  const totalPx = Math.max(
    _canvas.width,
    (_duration + 10) * _pixelsPerSecond
  );
  _scrollbarInnerEl.style.width = totalPx + 'px';
}

function autoScrollToPlayhead() {
  if (!_canvas) return;
  const playX = _currentTime * _pixelsPerSecond;
  const viewLeft = _scrollOffset;
  const viewRight = viewLeft + _canvas.width;
  if (playX > viewRight - 80) {
    const target = playX - 80;
    _scrollbarEl.scrollLeft = target;
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
function scheduleRender() {
  if (_animFrame !== null) cancelAnimationFrame(_animFrame);
  _animFrame = requestAnimationFrame(render);
}

function render() {
  _animFrame = null;
  if (!_ctx) return;
  const W = _canvas.width;
  const H = _canvas.height;
  const ctx = _ctx;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d0d14';
  ctx.fillRect(0, 0, W, H);

  drawRuler(ctx, W, H);
  drawTrack(ctx, W, H);
  drawMarkers(ctx, W, H);
  drawPlayhead(ctx, H);
}

function drawRuler(ctx: CanvasRenderingContext2D, W: number, _H: number) {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, RULER_HEIGHT);

  ctx.strokeStyle = '#2a2a44';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER_HEIGHT);
  ctx.lineTo(W, RULER_HEIGHT);
  ctx.stroke();

  ctx.font = RULER_FONT;
  ctx.textAlign = 'center';

  const step = rulerStep();
  const startSec = _scrollOffset / _pixelsPerSecond;
  const endSec = (_scrollOffset + W) / _pixelsPerSecond;

  for (let t = Math.floor(startSec / step) * step; t <= endSec + step; t += step) {
    const x = timeToCanvasX(t);
    if (x < -2 || x > W + 2) continue;
    const isMajor = step >= 5 || Math.round(t / step) % 4 === 0;

    ctx.strokeStyle = isMajor ? '#3a3a5e' : '#222238';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, RULER_HEIGHT - (isMajor ? 16 : 8));
    ctx.lineTo(x, RULER_HEIGHT);
    ctx.stroke();

    if (isMajor) {
      ctx.fillStyle = '#8888bb';
      ctx.fillText(formatTimeShort(t), x, RULER_HEIGHT - 18);
    }
  }
}

function rulerStep(): number {
  if (_pixelsPerSecond >= 200) return 0.5;
  if (_pixelsPerSecond >= 80) return 1;
  if (_pixelsPerSecond >= 30) return 5;
  if (_pixelsPerSecond >= 10) return 10;
  return 30;
}

function drawTrack(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const y = RULER_HEIGHT;
  const h = H - y;

  ctx.fillStyle = '#11111e';
  ctx.fillRect(0, y, W, h);

  // Alternating beat shading
  if (_pixelsPerSecond >= 40) {
    const step = rulerStep();
    const startSec = _scrollOffset / _pixelsPerSecond;
    const endSec = (_scrollOffset + W) / _pixelsPerSecond;
    for (let t = Math.floor(startSec / step) * step; t <= endSec + step; t += step) {
      if (Math.round(t / step) % 2 === 0) {
        const x = timeToCanvasX(t);
        const w = step * _pixelsPerSecond;
        ctx.fillStyle = 'rgba(255,255,255,0.012)';
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  // Duration end marker
  if (_duration > 0) {
    const endX = timeToCanvasX(_duration);
    if (endX > 0 && endX < W) {
      ctx.fillStyle = 'rgba(255, 100, 50, 0.06)';
      ctx.fillRect(endX, y, W - endX, h);
      ctx.strokeStyle = '#cc4400';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(endX, y);
      ctx.lineTo(endX, H);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawMarkers(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const trackY = RULER_HEIGHT + 4;
  const trackH = H - trackY - 4;

  for (const ev of _events) {
    const x = Math.round(timeToCanvasX(ev.playbackTime));
    if (x < -20 || x > W + 20) continue;

    const color = getEffectColor(ev.effect);
    const isHovered = ev.id === _hoveredId;
    const isDragging = _dragging?.id === ev.id;

    ctx.strokeStyle = isDragging ? '#ffffff' : (isHovered ? lighten(color) : color);
    ctx.lineWidth = isDragging ? 4 : (isHovered ? 3 : 2);
    ctx.beginPath();
    ctx.moveTo(x, trackY);
    ctx.lineTo(x, trackY + trackH);
    ctx.stroke();

    // Diamond head
    const d = 5;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(x, trackY);
    ctx.lineTo(x + d, trackY + d);
    ctx.lineTo(x, trackY + d * 2);
    ctx.lineTo(x - d, trackY + d);
    ctx.closePath();
    ctx.fill();

    // Label
    if (isHovered || _pixelsPerSecond >= 60) {
      const label = ev.effect.length > 18 ? ev.effect.slice(0, 16) + '..' : ev.effect;
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'left';
      const tw = ctx.measureText(label).width;
      const lx = Math.min(x + 5, W - tw - 6);
      const ly = trackY + 26;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(lx - 2, ly - 10, tw + 4, 13);
      ctx.fillStyle = isHovered ? '#ffffff' : color;
      ctx.fillText(label, lx, ly);
    }
  }
}

function drawPlayhead(ctx: CanvasRenderingContext2D, H: number) {
  const x = Math.round(timeToCanvasX(_currentTime));
  if (x < 0 || x > _canvas.width) return;

  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ff4444';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, H);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#ff4444';
  ctx.beginPath();
  ctx.moveTo(x - 6, 0);
  ctx.lineTo(x + 6, 0);
  ctx.lineTo(x, 12);
  ctx.closePath();
  ctx.fill();
}

function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + 60);
  const g = Math.min(255, ((n >> 8) & 0xff) + 60);
  const b = Math.min(255, (n & 0xff) + 60);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// ─── Mouse interaction ────────────────────────────────────────────────────────
function getCanvasX(e: MouseEvent): number {
  const rect = _canvas.getBoundingClientRect();
  return e.clientX - rect.left;
}

function hitTest(canvasX: number): AppEvent | null {
  const worldX = canvasX + _scrollOffset;
  const HIT = 8;
  for (const ev of _events) {
    const markerWorldX = ev.playbackTime * _pixelsPerSecond;
    if (Math.abs(worldX - markerWorldX) <= HIT) return ev;
  }
  return null;
}

function onMouseDown(e: MouseEvent) {
  e.preventDefault();
  const canvasX = getCanvasX(e);
  const hit = hitTest(canvasX);
  if (hit) {
    const worldX = canvasX + _scrollOffset;
    _dragging = { id: hit.id, startWorldX: worldX, origTime: hit.playbackTime };
    _canvas.style.cursor = 'grabbing';
  } else {
    // Click anywhere (not on a marker) = seek
    const t = canvasXToTime(canvasX);
    if (t >= 0) _options.onSeek(t);
  }
}

function onMouseMove(e: MouseEvent) {
  const canvasX = getCanvasX(e);
  if (_dragging) {
    const worldX = canvasX + _scrollOffset;
    const delta = (worldX - _dragging.startWorldX) / _pixelsPerSecond;
    const newTime = Math.max(0, _dragging.origTime + delta);
    _events = _events.map(ev =>
      ev.id === _dragging!.id ? { ...ev, playbackTime: newTime } : ev
    );
    scheduleRender();
  } else {
    const hit = hitTest(canvasX);
    const newId = hit?.id ?? null;
    if (newId !== _hoveredId) {
      _hoveredId = newId;
      _canvas.style.cursor = hit ? 'grab' : 'default';
      scheduleRender();
    }
  }
}

function onMouseUp(_e: MouseEvent) {
  if (_dragging) {
    const ev = _events.find(e => e.id === _dragging!.id);
    if (ev) updateEvent(ev.id, { playbackTime: ev.playbackTime });
    _dragging = null;
    _canvas.style.cursor = _hoveredId ? 'grab' : 'default';
    scheduleRender();
  }
}

function onMouseLeave() {
  if (!_dragging) {
    _hoveredId = null;
    _canvas.style.cursor = 'default';
    scheduleRender();
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const mouseCanvasX = getCanvasX(e);
    const mouseWorldX = mouseCanvasX + _scrollOffset;
    const delta = e.deltaY > 0 ? 0.85 : 1.15;
    const newPPS = Math.max(20, Math.min(600, _pixelsPerSecond * delta));

    // Zoom toward mouse position
    const newScrollOffset = mouseWorldX * (newPPS / _pixelsPerSecond) - mouseCanvasX;

    _pixelsPerSecond = newPPS;
    _scrollOffset = Math.max(0, newScrollOffset);
    _scrollbarEl.scrollLeft = _scrollOffset;
    updateScrollbarWidth();
    scheduleRender();
  } else {
    // Horizontal scroll
    const amount = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    _scrollbarEl.scrollLeft += amount;
  }
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  const hit = hitTest(getCanvasX(e));
  if (hit) _options.onEditEvent(hit);
}

export function doubleClickEvent(e: MouseEvent) {
  const hit = hitTest(getCanvasX(e));
  if (hit) _options.onEditEvent(hit);
}

export function deleteHovered() {
  if (_hoveredId) {
    removeEvent(_hoveredId);
    _hoveredId = null;
    scheduleRender();
  }
}
