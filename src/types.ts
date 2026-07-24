export interface AppEvent {
  id: string;
  playbackTime: number; // seconds from audio start
  festivalTime: number; // seconds from festival start
  tick: number;        // minecraft tick
  effect: string;
}

export interface StartTime {
  hours: number;
  minutes: number;
  seconds: number;
}

export interface AppState {
  events: AppEvent[];
  startTime: StartTime;
  favorites: string[];
  audioFileName: string;
}

export type SortColumn = 'playbackTime' | 'festivalTime' | 'tick' | 'effect';
export type SortDirection = 'asc' | 'desc';

export interface EffectCategory {
  name: string;
  type: 'continuous' | 'impulse';
  effects: string[];
}

export interface TimelineState {
  pixelsPerSecond: number;
  scrollOffset: number;
  duration: number;
}

export type StateChangeListener = (state: AppState) => void;
