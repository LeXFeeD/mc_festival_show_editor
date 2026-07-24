import type { AppEvent } from './types.ts';
import { getEffectColor } from './effects.ts';
import { updateEvent, removeEvent } from './state.ts';
import { formatTimeShort } from './audio.ts';

interface TimelineOptions {
  onSeek: (time: number) => void;
  onEditEvent: (event: AppEvent) => void;
}

const RULER_HEIGHT = 32;
const TRACK_HEIGHT = 48;
const MARKER_WIDTH = 3;
const LABEL_FONT = '10px Inter, monospace';
const RULER_FONT = '11px Inter, monospace';

let _canvas: HTMLCanvasElement;
let _ctx: CanvasRenderingContext2D;
let _events: AppEvent[] = [];
let _currentTime = 0;
let _duration = 0;
let _pixelsPerSecond = 80;
let _scrollOffset = 0;
let _options: TimelineOptions;
let _dragging: { id: string; startX: number; origTime: number } | null = null;
let _hoveredId: string | null = null;
let _animFrame: number | null = null;

export function initTimeline(canvas: HTMLCanvasElement, options: TimelineOptions) {
  _canvas = canvas;
  _ctx = canvas.getContext('2d')!;
  _options = options;

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  const wrapper = canvas.parentElement!;
  wrapper.addEventListener('scroll', () => {
    _scrollOffset = wrapper.scrollLeft;
    scheduleRender();
  });

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
}

export function setTimelineEvents(events: AppEvent[]) {
  _events = events;
  scheduleRender();
}

export function setPlaybackTime(time: number, duration: number) {
  _currentTime = time;
  _duration = duration;
  updateScrollForPlayhead();
  scheduleRender();
}

function updateScrollForPlayhead() {
  if (!_canvas) return;
  const wrapper = _canvas.parentElement!;
  const playX = _currentTime * _pixelsPerSecond;
  const viewLeft = wrapper.scrollLeft;
  const viewRight = viewLeft + wrapper.clientWidth;
  if (playX > viewRight - 80) {
    wrapper.scrollLeft = playX - 80;
  }
}

export function setZoom(pps: number) {
  _pixelsPerSecond = Math.max(20, Math.min(400, pps));
  resizeCanvas();
  scheduleRender();
}

export function getZoom(): number { return _pixelsPerSecond; }

function resizeCanvas() {
  if (!_canvas) return;
  const wrapper = _canvas.parentElement!;
  const totalWidth = Math.max(wrapper.clientWidth, (_duration + 10) * _pixelsPerSecond);
  _canvas.width = totalWidth;
  _canvas.height = wrapper.clientHeight || RULER_HEIGHT + TRACK_HEIGHT + 20;
  scheduleRender();
}

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

  // Background
  ctx.fillStyle = '#0d0d14';
  ctx.fillRect(0, 0, W, H);

  drawRuler(ctx, W);
  drawTrack(ctx, W, H);
  drawMarkers(ctx, H);
  drawPlayhead(ctx, H);
}

function drawRuler(ctx: CanvasRenderingContext2D, W: number) {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, RULER_HEIGHT);

  ctx.strokeStyle = '#2a2a44';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER_HEIGHT);
  ctx.lineTo(W, RULER_HEIGHT);
  ctx.stroke();

  ctx.font = RULER_FONT;
  ctx.fillStyle = '#6666aa';
  ctx.textAlign = 'center';

  const step = rulerStep();
  const startSec = 0;
  const endSec = W / _pixelsPerSecond;

  for (let t = Math.floor(startSec / step) * step; t <= endSec; t += step) {
    const x = t * _pixelsPerSecond;
    const isMajor = Math.round(t) % (step * 4) === 0 || step >= 5;

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
  return 10;
}

function drawTrack(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const y = RULER_HEIGHT;
  const h = H - y;

  // Main track background
  ctx.fillStyle = '#11111e';
  ctx.fillRect(0, y, W, h);

  // Alternating beat guides if zoomed in enough
  if (_pixelsPerSecond >= 40) {
    const step = rulerStep();
    for (let t = 0; t <= W / _pixelsPerSecond; t += step) {
      const x = t * _pixelsPerSecond;
      ctx.fillStyle = Math.round(t / step) % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent';
      ctx.fillRect(x, y, step * _pixelsPerSecond, h);
    }
  }

  // Duration end marker
  if (_duration > 0) {
    const endX = _duration * _pixelsPerSecond;
    ctx.fillStyle = 'rgba(255, 100, 50, 0.08)';
    ctx.fillRect(endX, y, W - endX, h);
    ctx.strokeStyle = '#cc4400';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(endX, y);
    ctx.lineTo(endX, y + h);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawMarkers(ctx: CanvasRenderingContext2D, H: number) {
  const trackY = RULER_HEIGHT + 4;
  const trackH = H - trackY - 4;

  for (const ev of _events) {
    const x = Math.round(ev.playbackTime * _pixelsPerSecond);
    const color = getEffectColor(ev.effect);
    const isHovered = ev.id === _hoveredId;
    const isDragging = _dragging?.id === ev.id;

    // Vertical line
    ctx.strokeStyle = isDragging ? '#ffffff' : (isHovered ? lighten(color) : color);
    ctx.lineWidth = isDragging ? 4 : (isHovered ? 3 : MARKER_WIDTH);
    ctx.beginPath();
    ctx.moveTo(x, trackY);
    ctx.lineTo(x, trackY + trackH);
    ctx.stroke();

    // Top diamond
    const diamondSize = 6;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(x, trackY);
    ctx.lineTo(x + diamondSize, trackY + diamondSize);
    ctx.lineTo(x, trackY + diamondSize * 2);
    ctx.lineTo(x - diamondSize, trackY + diamondSize);
    ctx.closePath();
    ctx.fill();

    // Label (on hover or if zoomed enough)
    if (isHovered || _pixelsPerSecond >= 60) {
      const label = ev.effect.length > 18 ? ev.effect.slice(0, 16) + '..' : ev.effect;
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'left';
      const textWidth = ctx.measureText(label).width;
      const labelX = x + 5;
      const labelY = trackY + 26;

      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(labelX - 2, labelY - 10, textWidth + 4, 13);

      ctx.fillStyle = isHovered ? '#ffffff' : color;
      ctx.fillText(label, labelX, labelY);
    }
  }
}

function drawPlayhead(ctx: CanvasRenderingContext2D, H: number) {
  if (_currentTime <= 0 && _duration <= 0) return;
  const x = Math.round(_currentTime * _pixelsPerSecond);

  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ff4444';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, H);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Triangle head
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

function getCanvasX(e: MouseEvent): number {
  const rect = _canvas.getBoundingClientRect();
  return e.clientX - rect.left + _scrollOffset;
}

function hitTest(canvasX: number): AppEvent | null {
  const HIT_RADIUS = 8;
  for (const ev of _events) {
    const x = ev.playbackTime * _pixelsPerSecond;
    if (Math.abs(canvasX - x) <= HIT_RADIUS) return ev;
  }
  return null;
}

function onMouseDown(e: MouseEvent) {
  const cx = getCanvasX(e);
  const hit = hitTest(cx);
  if (hit) {
    _dragging = { id: hit.id, startX: cx, origTime: hit.playbackTime };
    _canvas.style.cursor = 'grabbing';
  } else if (e.clientY - _canvas.getBoundingClientRect().top < RULER_HEIGHT) {
    // Click on ruler = seek
    const t = cx / _pixelsPerSecond;
    _options.onSeek(t);
  }
}

function onMouseMove(e: MouseEvent) {
  const cx = getCanvasX(e);
  if (_dragging) {
    const delta = (cx - _dragging.startX) / _pixelsPerSecond;
    const newTime = Math.max(0, _dragging.origTime + delta);
    const ev = _events.find(ev => ev.id === _dragging!.id);
    if (ev) {
      const tempEvents = _events.map(e2 =>
        e2.id === _dragging!.id ? { ...e2, playbackTime: newTime } : e2
      );
      _events = tempEvents;
      scheduleRender();
    }
  } else {
    const hit = hitTest(cx);
    const newHovered = hit?.id ?? null;
    if (newHovered !== _hoveredId) {
      _hoveredId = newHovered;
      _canvas.style.cursor = hit ? 'grab' : 'default';
      scheduleRender();
    }
  }
}

function onMouseUp(_e: MouseEvent) {
  if (_dragging) {
    const ev = _events.find(e => e.id === _dragging!.id);
    if (ev) {
      updateEvent(ev.id, { playbackTime: ev.playbackTime });
    }
    _dragging = null;
    _canvas.style.cursor = _hoveredId ? 'grab' : 'default';
  }
}

function onMouseLeave() {
  _hoveredId = null;
  _dragging = null;
  _canvas.style.cursor = 'default';
  scheduleRender();
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const delta = e.deltaY > 0 ? 0.85 : 1.15;
    setZoom(_pixelsPerSecond * delta);
  }
  // Horizontal scroll handled by native scroll on wrapper
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  const cx = getCanvasX(e);
  const hit = hitTest(cx);
  if (hit) {
    _options.onEditEvent(hit);
  }
}

export function doubleClickEvent(e: MouseEvent) {
  const cx = getCanvasX(e);
  const hit = hitTest(cx);
  if (hit) _options.onEditEvent(hit);
}

export function deleteHovered() {
  if (_hoveredId) {
    removeEvent(_hoveredId);
    _hoveredId = null;
  }
}
