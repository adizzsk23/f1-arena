export type GraphicsPreset = 'low' | 'med' | 'high';

export interface PresetSettings {
  pixelRatioCap: number;
  antialias: boolean;
  bloom: boolean;
  shadows: boolean;
  fogFar: number;
}

export const PRESETS: Record<GraphicsPreset, PresetSettings> = {
  low: { pixelRatioCap: 1, antialias: false, bloom: false, shadows: false, fogFar: 1600 },
  med: { pixelRatioCap: 1.25, antialias: false, bloom: true, shadows: false, fogFar: 2600 },
  high: { pixelRatioCap: 2, antialias: true, bloom: true, shadows: true, fogFar: 4000 },
};
