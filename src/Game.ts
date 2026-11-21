import * as THREE from 'three';
import { SynthAudio } from './audio/SynthAudio';
import { THEME_LIST, THEMES } from './config/themes';
import { InputManager } from './engine/InputManager';
import { SceneManager } from './engine/SceneManager';
import { ActivePowerUps, GameState, RunStats, ThemeId, TunnelTheme } from './types/game';
import { ObstacleManager } from './world/ObstacleManager';
import { PowerUpManager } from './world/PowerUpManager';
import { TUNNEL_RADIUS, TunnelGenerator } from './world/TunnelGenerator';

const BEST_SCORE_KEY = 'neon-tunnel-best-score';
const PLAYER_ORBIT_RADIUS = TUNNEL_RADIUS - 1.35;
const PLAYER_Z = 0;
const BASE_SPEED = 28;
const MAX_SPEED = 74;

function getRequiredEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing required DOM element: #${id}`);
  }
  return el as T;
}

export class Game {
  private readonly sceneManager: SceneManager;
  private readonly inputManager: InputManager;
  private readonly tunnel: TunnelGenerator;
  private readonly obstacles: ObstacleManager;
  private readonly powerUps: PowerUpManager;
  private readonly audio: SynthAudio;

  private readonly playerGroup = new THREE.Group();
  private readonly shipMaterial: THREE.MeshStandardMaterial;
  private readonly shieldBubble: THREE.Mesh;

  private state: GameState = 'menu';
  private currentTheme: TunnelTheme = THEMES['cyber-cyan'];
  private playerAngle = -Math.PI / 2;
  private elapsedTime = 0;
  private comboTimer = 0;
  private lastFrameTime = 0;
  private rafId = 0;

  private stats: RunStats = {
    score: 0,
    bestScore: this.loadBestScore(),
    distance: 0,
    nearMisses: 0,
    combo: 0,
    speedMultiplier: 1,
  };

  private readonly hudEl = getRequiredEl<HTMLDivElement>('hud');
  private readonly scoreValueEl = getRequiredEl<HTMLElement>('score-value');
  private readonly themeBadgeEl = getRequiredEl<HTMLElement>('theme-badge');
  private readonly comboDisplayEl = getRequiredEl<HTMLDivElement>('combo-display');
  private readonly speedValueEl = getRequiredEl<HTMLElement>('speed-value');
  private readonly powerupIndicatorsEl = getRequiredEl<HTMLDivElement>('powerup-indicators');
  private readonly multiplierValueEl = getRequiredEl<HTMLElement>('multiplier-value');
  private readonly muteBtnEl = getRequiredEl<HTMLButtonElement>('mute-btn');

  private readonly startScreenEl = getRequiredEl<HTMLDivElement>('start-screen');
  private readonly themeSelectorEl = getRequiredEl<HTMLDivElement>('theme-selector');
  private readonly bestScoreDisplayEl = getRequiredEl<HTMLElement>('best-score-display');
  private readonly startBtnEl = getRequiredEl<HTMLButtonElement>('start-btn');

  private readonly gameoverScreenEl = getRequiredEl<HTMLDivElement>('gameover-screen');
  private readonly finalScoreEl = getRequiredEl<HTMLElement>('final-score');
  private readonly finalBestEl = getRequiredEl<HTMLElement>('final-best');
  private readonly finalDistanceEl = getRequiredEl<HTMLElement>('final-distance');
  private readonly finalNearMissesEl = getRequiredEl<HTMLElement>('final-near-misses');
  private readonly restartBtnEl = getRequiredEl<HTMLButtonElement>('restart-btn');
  private readonly menuBtnEl = getRequiredEl<HTMLButtonElement>('menu-btn');

  constructor() {
    const container = getRequiredEl<HTMLDivElement>('app');
    this.sceneManager = new SceneManager(container, this.currentTheme);
    this.inputManager = new InputManager();
    this.tunnel = new TunnelGenerator(this.sceneManager.scene, this.currentTheme);
    this.obstacles = new ObstacleManager(this.sceneManager.scene, this.currentTheme);
    this.powerUps = new PowerUpManager(this.sceneManager.scene);
    this.audio = new SynthAudio();

    this.shipMaterial = new THREE.MeshStandardMaterial({
      color: this.currentTheme.playerColorHex,
      emissive: this.currentTheme.playerColorHex,
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.65,
    });

    this.shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 18, 18),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
      })
    );
    this.shieldBubble.visible = false;

    this.buildPlayerShip();
    this.buildThemeButtons();
    this.applyTheme(this.currentTheme.id);
    this.bindUI();
    this.updateBestScoreUI();
  }

  private loadBestScore(): number {
    try {
      const raw = localStorage.getItem(BEST_SCORE_KEY);
      const parsed = raw ? Number.parseInt(raw, 10) : 0;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  private saveBestScore(value: number): void {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(Math.floor(value)));
    } catch {
      // Ignore storage errors in restricted environments
    }
  }

  private buildPlayerShip(): void {
    const hull = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.35, 6), this.shipMaterial);
    hull.rotation.x = -Math.PI / 2;

    const wingGeo = new THREE.BoxGeometry(1.45, 0.08, 0.52);
    const wings = new THREE.Mesh(wingGeo, this.shipMaterial);
    wings.position.set(0, -0.04, 0.2);

    this.playerGroup.add(hull);
    this.playerGroup.add(wings);
    this.playerGroup.add(this.shieldBubble);
    this.sceneManager.scene.add(this.playerGroup);
    this.syncPlayerTransform(0);
  }

  private buildThemeButtons(): void {
    this.themeSelectorEl.innerHTML = '';
    for (const theme of THEME_LIST) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-card';
      btn.dataset.themeId = theme.id;
      btn.style.setProperty('--theme-accent', theme.accentCss);
      btn.innerHTML = `<span class="theme-dot"></span><span>${theme.name}</span>`;
      btn.addEventListener('click', () => {
        this.applyTheme(theme.id);
      });
      this.themeSelectorEl.appendChild(btn);
    }
  }

  private applyTheme(themeId: ThemeId): void {
    const theme = THEMES[themeId];
    this.currentTheme = theme;
    document.documentElement.style.setProperty('--accent', theme.accentCss);

    this.sceneManager.applyTheme(theme);
    this.tunnel.applyTheme(theme);
    this.obstacles.applyTheme(theme);

    this.shipMaterial.color.setHex(theme.playerColorHex);
    this.shipMaterial.emissive.setHex(theme.playerColorHex);
    this.themeBadgeEl.textContent = theme.name.toUpperCase();

    const cards = this.themeSelectorEl.querySelectorAll<HTMLButtonElement>('.theme-card');
    for (const card of cards) {
      card.classList.toggle('active', card.dataset.themeId === theme.id);
    }
  }

  private bindUI(): void {
    this.startBtnEl.addEventListener('click', () => this.startRun());
    this.restartBtnEl.addEventListener('click', () => this.startRun());
    this.menuBtnEl.addEventListener('click', () => this.showMenu());
    this.muteBtnEl.addEventListener('click', () => {
      const muted = this.audio.toggleMute();
      this.muteBtnEl.textContent = muted ? 'SFX: OFF' : 'SFX: ON';
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        const muted = this.audio.toggleMute();
        this.muteBtnEl.textContent = muted ? 'SFX: OFF' : 'SFX: ON';
      } else if ((e.code === 'Space' || e.code === 'Enter') && this.state !== 'playing') {
        e.preventDefault();
        this.startRun();
      }
    });
  }

  public start(): void {
    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private startRun(): void {
    this.audio.unlock();
    this.audio.startPulse();

    this.state = 'playing';
    this.playerAngle = -Math.PI / 2;
    this.elapsedTime = 0;
    this.comboTimer = 0;

    this.stats = {
      score: 0,
      bestScore: this.stats.bestScore,
      distance: 0,
      nearMisses: 0,
      combo: 0,
      speedMultiplier: 1,
    };

    this.obstacles.reset();
    this.powerUps.reset();
    this.shieldBubble.visible = false;

    this.startScreenEl.classList.add('hidden');
    this.gameoverScreenEl.classList.add('hidden');
    this.hudEl.classList.remove('hidden');
    this.updateHUD({ shield: 0, slowmo: 0, double: 0 });
  }

  private showMenu(): void {
    this.state = 'menu';
    this.audio.stopPulse();
    this.obstacles.reset();
    this.powerUps.reset();
    this.shieldBubble.visible = false;

    this.hudEl.classList.add('hidden');
    this.gameoverScreenEl.classList.add('hidden');
    this.startScreenEl.classList.remove('hidden');
    this.updateBestScoreUI();
  }

  private triggerGameOver(): void {
    this.state = 'gameover';
    this.audio.stopPulse();
    this.audio.playCrash();
    this.sceneManager.triggerShake(0.85);

    const finalScore = Math.floor(this.stats.score);
    if (finalScore > this.stats.bestScore) {
      this.stats.bestScore = finalScore;
      this.saveBestScore(finalScore);
    }

    this.finalScoreEl.textContent = String(finalScore);
    this.finalBestEl.textContent = String(this.stats.bestScore);
    this.finalDistanceEl.textContent = `${Math.floor(this.stats.distance)}m`;
    this.finalNearMissesEl.textContent = String(this.stats.nearMisses);

    this.hudEl.classList.add('hidden');
    this.gameoverScreenEl.classList.remove('hidden');
    this.updateBestScoreUI();
  }

  private updateBestScoreUI(): void {
    this.bestScoreDisplayEl.textContent = String(this.stats.bestScore);
  }

  private syncPlayerTransform(steerInput: number): void {
    const px = Math.cos(this.playerAngle) * PLAYER_ORBIT_RADIUS;
    const py = Math.sin(this.playerAngle) * PLAYER_ORBIT_RADIUS;
    this.playerGroup.position.set(px, py, PLAYER_Z);
    this.playerGroup.rotation.z = this.playerAngle + Math.PI / 2 - steerInput * 0.45;
  }

  private updateHUD(active: ActivePowerUps): void {
    const multiplier = active.double > 0 ? 2 : 1;
    this.scoreValueEl.textContent = String(Math.floor(this.stats.score));
    this.speedValueEl.textContent = `${this.stats.speedMultiplier.toFixed(1)}x`;
    this.multiplierValueEl.textContent = `${multiplier}x`;

    if (this.stats.combo > 1) {
      this.comboDisplayEl.textContent = `NEAR MISS x${this.stats.combo}`;
      this.comboDisplayEl.classList.remove('hidden');
    } else {
      this.comboDisplayEl.classList.add('hidden');
    }

    const pills: string[] = [];
    if (active.shield > 0) {
      pills.push(`<span class="powerup-pill shield">SHIELD ${active.shield.toFixed(1)}s</span>`);
    }
    if (active.slowmo > 0) {
      pills.push(`<span class="powerup-pill slowmo">SLOW-MO ${active.slowmo.toFixed(1)}s</span>`);
    }
    if (active.double > 0) {
      pills.push(`<span class="powerup-pill double">2X SCORE ${active.double.toFixed(1)}s</span>`);
    }
    this.powerupIndicatorsEl.innerHTML = pills.join('');
  }

  private readonly loop = (now: number): void => {
    const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    if (this.state === 'playing') {
      this.elapsedTime += rawDt;

      const active = this.powerUps.getActive();
      const rampSpeed = Math.min(MAX_SPEED, BASE_SPEED + this.elapsedTime * 0.65);
      const effectiveSpeed = active.slowmo > 0 ? rampSpeed * 0.58 : rampSpeed;
      this.stats.speedMultiplier = effectiveSpeed / BASE_SPEED;

      const steerInput = this.inputManager.getSteerInput();
      this.playerAngle += steerInput * 3.1 * rawDt;
      this.syncPlayerTransform(steerInput);

      this.tunnel.update(effectiveSpeed, rawDt,;

      const obsResult = this.obstacles.update(
        effectiveSpeed,
        rawDt,
        this.elapsedTime,
        this.playerAngle,
        PLAYER_Z
      );

      const collected = this.powerUps.update(
        effectiveSpeed,
        rawDt,
        this.playerAngle,
        PLAYER_Z
      );

      if (collected) {
        this.audio.playPowerUp();
      }

      const updatedActive = this.powerUps.getActive();
      this.shieldBubble.visible = updatedActive.shield > 0;
      if (this.shieldBubble.visible) {
        this.shieldBubble.rotation.y += rawDt * 2;
      }

      if (this.comboTimer > 0) {
        this.comboTimer -= rawDt;
        if (this.comboTimer <= 0) {
          this.stats.combo = 0;
        }
      }

      const scoreMult = updatedActive.double > 0 ? 2 : 1;

      if (obsResult.nearMiss) {
        this.stats.nearMisses += 1;
        this.stats.combo += 1;
        this.comboTimer = 3.2;
        this.stats.score += 50 * this.stats.combo * scoreMult;
        this.audio.playNearMiss(this.stats.combo);
      }

      if (obsResult.passedCount > 0) {
        this.stats.score += obsResult.passedCount * 15 * scoreMult;
      }

      this.stats.distance += effectiveSpeed * rawDt;
      this.stats.score += effectiveSpeed * rawDt * 0.6 * scoreMult;

      if (obsResult.hit) {
        if (this.powerUps.consumeShield()) {
          this.audio.playShieldBreak();
          this.sceneManager.triggerShake(0.45);
          this.shieldBubble.visible = false;
        } else {
          this.triggerGameOver();
        }
      }

      this.audio.updatePulse(rawDt, this.stats.speedMultiplier);
      this.sceneManager.updateCamera(
        this.playerGroup.position.x,
        this.playerGroup.position.y,
        steerInput,
        rawDt
      );

      if (this.state === 'playing') {
        this.updateHUD(this.powerUps.getActive());
      }
    } else {
      this.tunnel.update(14, rawDt);
      this.syncPlayerTransform(0);
      this.sceneManager.updateCamera(
        this.playerGroup.position.x,
        this.playerGroup.position.y,
        0,
        rawDt
      );
    }

    this.sceneManager.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  public dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.inputManager.dispose();
  }
}
