import type * as THREE from 'three';

export type GameState = 'menu' | 'playing' | 'gameover';

export type ThemeId = 'cyber-cyan' | 'synthwave' | 'toxic-grid' | 'solar-flare';

export interface TunnelTheme {
  id: ThemeId;
  name: string;
  description: string;
  backgroundHex: number;
  fogHex: number;
  ringColorHex: number;
  railColorHex: number;
  obstacleColorHex: number;
  obstacleEmissiveHex: number;
  playerColorHex: number;
  accentCss: string;
  secondaryCss: string;
}

export type ObstacleKind = 'cube' | 'bar' | 'arc';

export interface ObstacleInstance {
  mesh: THREE.Object3D;
  kind: ObstacleKind;
  angle: number;
  angularWidth: number;
  radialDepth: number;
  z: number;
  passed: boolean;
  nearMissChecked: boolean;
}

export type PowerUpType = 'shield' | 'slowmo' | 'double';

export interface PowerUpInstance {
  mesh: THREE.Group;
  type: PowerUpType;
  angle: number;
  z: number;
  collected: boolean;
}

export interface ActivePowerUps {
  shield: number;
  slowmo: number;
  double: number;
}

export interface RunStats {
  score: number;
  bestScore: number;
  distance: number;
  nearMisses: number;
  combo: number;
  speedMultiplier: number;
}
