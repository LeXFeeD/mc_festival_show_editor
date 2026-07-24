import type { EffectCategory } from './types.ts';

export const EFFECT_CATEGORIES: EffectCategory[] = [
  {
    name: 'Continuous Effects',
    type: 'continuous',
    effects: [
      'dj_booth_lights_on', 'dj_booth_lights_off',
      'main_light_on', 'main_light_off',
      'logo_light_on', 'logo_light_off',
      'led_laser_all_bottom', 'led_laser_all_left', 'led_laser_all_right', 'led_laser_all_top',
      'led_laser_off', 'led_laser_on',
      'foh_on', 'foh_off',
      'co2_on', 'co2_off',
      'blue_flame_on', 'blue_flame_off',
      'scene_fire_on', 'scene_fire_off',
      'roof_fire_on', 'roof_fire_off',
      'blue_flame_lasers_on', 'blue_flame_lasers_off',
      'confetti_on', 'confetti_off',
      'square_laser_left_on', 'square_laser_left_off',
      'square_laser_right_on', 'square_laser_right_off',
      'square_laser_all_on', 'square_laser_all_off',
      'beacons_on', 'beacons_off',
    ],
  },
  {
    name: 'Impulse Effects',
    type: 'impulse',
    effects: [
      'lightning_bolts',
      'fireworks_roof',
      'bass_particle',
      'end_crystal_lasers',
      'fireworks_dj_booth',
      'blue_fireworks_roof',
      'white_sphere_fireworks_roof',
    ],
  },
];

export const ALL_EFFECTS: string[] = EFFECT_CATEGORIES.flatMap(c => c.effects);

export function getEffectType(effect: string): 'continuous' | 'impulse' {
  const cat = EFFECT_CATEGORIES.find(c => c.effects.includes(effect));
  return cat?.type ?? 'impulse';
}

export function getEffectColor(effect: string): string {
  const type = getEffectType(effect);
  if (type === 'impulse') return '#ff9500';
  if (effect.endsWith('_on')) return '#00cc66';
  if (effect.endsWith('_off')) return '#cc3300';
  return '#0088cc';
}
