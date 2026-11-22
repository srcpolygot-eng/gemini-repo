import type { ThemeId, TunnelTheme } from '../types/game';
import { cyberCyan } from './themes/cyberCyan';
import { synthwave } from './themes/synthwave';
import { toxicGrid } from './themes/toxicGrid';
import { solarFlare } from './themes/solarFlare';
import { voidViolet } from './themes/voidViolet';
import { crimsonPulse } from './themes/crimsonPulse';
import { arcticPrism } from './themes/arcticPrism';
import { goldRush } from './themes/goldRush';
import { emeraldVapor } from './themes/emeraldVapor';
import { plasmaCore } from './themes/plasmaCore';

export const THEMES: Record<ThemeId, TunnelTheme> = {
  'cyber-cyan': cyberCyan,
  synthwave,
  'toxic-grid': toxicGrid,
  'solar-flare': solarFlare,
  'void-violet': voidViolet,
  'crimson-pulse': crimsonPulse,
  'arctic-prism': arcticPrism,
  'gold-rush': goldRush,
  'emerald-vapor': emeraldVapor,
  'plasma-core': plasmaCore,
};

export const THEME_LIST: TunnelTheme[] = Object.values(THEMES);
