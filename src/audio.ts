export type AudioState = 'idle' | 'playing' | 'paused';

interface AudioCallbacks {
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onStateChange: (state: AudioState) => void;
  onLoaded: (fileName: string, duration: number) => void;
}

let _audio: HTMLAudioElement | null = null;
let _objectUrl: string | null = null;
let _callbacks: AudioCallbacks | null = null;
let _state: AudioState = 'idle';

function setState(s: AudioState) {
  _state = s;
  _callbacks?.onStateChange(s);
}

export function getAudioState(): AudioState { return _state; }
export function getCurrentTime(): number { return _audio?.currentTime ?? 0; }
export function getDuration(): number { return _audio?.duration ?? 0; }
export function isLoaded(): boolean { return _audio !== null && !isNaN(_audio.duration); }

export function initAudio(callbacks: AudioCallbacks) {
  _callbacks = callbacks;
}

export function loadAudioFile(file: File) {
  if (_audio) {
    _audio.pause();
    _audio.src = '';
  }
  if (_objectUrl) URL.revokeObjectURL(_objectUrl);

  _objectUrl = URL.createObjectURL(file);
  _audio = new Audio(_objectUrl);

  _audio.addEventListener('loadedmetadata', () => {
    _callbacks?.onLoaded(file.name, _audio!.duration);
    setState('idle');
  });

  _audio.addEventListener('timeupdate', () => {
    if (!_audio) return;
    _callbacks?.onTimeUpdate(_audio.currentTime, _audio.duration);
  });

  _audio.addEventListener('ended', () => {
    setState('idle');
  });
}

export function play() {
  if (!_audio || isNaN(_audio.duration)) return;
  _audio.play();
  setState('playing');
}

export function pause() {
  if (!_audio) return;
  _audio.pause();
  setState('paused');
}

export function stop() {
  if (!_audio) return;
  _audio.pause();
  _audio.currentTime = 0;
  setState('idle');
  _callbacks?.onTimeUpdate(0, _audio.duration);
}

export function seek(seconds: number) {
  if (!_audio || isNaN(_audio.duration)) return;
  _audio.currentTime = Math.max(0, Math.min(seconds, _audio.duration));
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function formatTimeShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
