import * as THREE from 'three';
import { SynthAudio } from './audio/SynthAudio';
import { THEME_LIST, THEMES } from './config/themes';
import { InputManager } from './engine/InputManager';
import { RunnerModel } from './entities/RunnerModel';
import { SceneManager } from './engine/SceneManager';
import { ActivePowerUps, GameState, RunStats, ThemeId, TunnelTheme } from './types/game';
import { ObstacleManager } from './world/ObstacleManager';
import { PowerUpManager } from './world/PowerUpManager';
import { TUNNEL_RADIUS, TunnelGenerator } from './world/TunnelGenerator';

const BEST_SCORE_KEY = 'neon-tunnel-best-score';
const PLAYER_ORBIT_RADIUS = TUNNEL_RADIUS - 1.35;
const PLAYER_Z = 0;
const BASE_SPEED = 50;
const MAX_SPEED = 125;
const MAX_SPARKS = 180;

interface SparkParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  life: number;
  maxLife: number;
}

function getRequiredEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing required DOM element: #${id}`);
  }
  return el as T;
}

export class Game {
  private readonly sceneManager: SceneManager;
  private readonly input: InputManager;
  private readonly tunnel: TunnelGenerator;
  private readonly obstacles: ObstacleManager;
  private readonly powerUps: PowerUpManager;
  private readonly audio: SynthAudio;

  private runner: RunnerModel;

  private readonly sparkGeo: THREE.BufferGeometry;
  private readonly sparkPositions: Float32Array;
  private readonly sparkColors: Float32Array;
  private sparks: SparkParticle[] = [];

  private state: GameState = 'menu'; private paused = false; public start(): void { if (!this.rafId) { this.rafId = requestAnimationFrame(this.loop); } }
  private currentTheme: TunnelTheme = THEMES['cyber-cyan'];
  private playerAngle = -Math.PI / 2;
  private speed = BASE_SPEED;
  private score = 0;
  private bestScore = 0;
  private combo = 1;
  private comboTimer = 0;
  private nearMisses = 0;
  private distance = 0;
  private runTime = 0;
  private lastFrameTime = performance.now();
  private rafId = 0;
  private muted = false;

  private activePowerUps: ActivePowerUps = {
    shield: 0,
    double: 0,
    slowmo: 0,
  };

  private readonly startOverlay: HTMLElement;
  private readonly pauseOverlay: HTMLElement | null;
  private readonly gameOverOverlay: HTMLElement;
  private readonly hudEl: HTMLElement;
  private readonly scoreValueEl: HTMLElement;
  private readonly bestValueEl: HTMLElement;
  private readonly speedValueEl: HTMLElement;
  private readonly comboValueEl: HTMLElement;
  private readonly powerUpBadgesEl: HTMLElement;
  private readonly finalScoreEl: HTMLElement;
  private readonly finalBestEl: HTMLElement;
  private readonly finalDistanceEl: HTMLElement;
  private readonly finalNearMissEl: HTMLElement;
  private readonly muteButton: HTMLButtonElement;
  private themeButtons: HTMLButtonElement[] = [];

  constructor(container?: HTMLElement) {
    this.bestScore = Number(localStorage.getItem(BEST_SCORE_KEY) || '0') || 0;

    this.sceneManager = new SceneManager(container ?? document.getElementById('app') ?? document.body, this.currentTheme);
    this.input = new InputManager();
    this.tunnel = new TunnelGenerator(this.sceneManager.scene, this.currentTheme);
    this.obstacles = new ObstacleManager(this.sceneManager.scene, this.currentTheme);
    this.powerUps = new PowerUpManager(this.sceneManager.scene);
    this.audio = new SynthAudio();

    this.runner = new RunnerModel(this.currentTheme);
    this.sceneManager.scene.add(this.runner.group);
    this.runner.setShieldVisible(false);

    this.sparkPositions = new Float32Array(MAX_SPARKS * 3);
    this.sparkColors = new Float32Array(MAX_SPARKS * 3);
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkColors, 3));
    const sparkMat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sparkPoints = new THREE.Points(this.sparkGeo, sparkMat);
    sparkPoints.frustumCulled = false;
    this.sceneManager.scene.add(sparkPoints);

    this.startOverlay = getRequiredEl('start-screen');
    this.pauseOverlay = document.getElementById('pause-overlay');
    this.gameOverOverlay = getRequiredEl('gameover-screen');
    this.hudEl = getRequiredEl('hud');
    this.scoreValueEl = getRequiredEl('score-value');
    this.bestValueEl = getRequiredEl('best-score-display');
    this.speedValueEl = getRequiredEl('speed-value');
    this.comboValueEl = getRequiredEl('combo-display');
    this.powerUpBadgesEl = getRequiredEl('powerup-indicators');
    this.finalScoreEl = getRequiredEl('final-score');
    this.finalBestEl = getRequiredEl('final-best');
    this.finalDistanceEl = getRequiredEl('final-distance');
    this.finalNearMissEl = getRequiredEl('final-near-misses');
    this.muteButton = getRequiredEl<HTMLButtonElement>('mute-btn');
    this.renderThemeSelector();
    this.bindUiEvents();
    const savedTheme = localStorage.getItem('neon_tunnel_theme') as ThemeId | null;
    this.applyTheme(savedTheme && THEMES[savedTheme] ? savedTheme : 'cyber-cyan');
  }

  private renderThemeSelector(): void {
    const container = document.getElementById('theme-selector');
    if (!container) return;
    container.innerHTML = '';
    const buttons: HTMLButtonElement[] = [];
    for (const theme of THEME_LIST) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-card';
      btn.dataset.theme = theme.id;
      const dot = document.createElement('span');
      dot.className = 'theme-dot';
      const colorHex = '#' + theme.playerColorHex.toString(16).padStart(6, '0');
      dot.style.backgroundColor = colorHex;
      dot.style.boxShadow = '0 0 10px ' + colorHex;
      const label = document.createElement('span');
      label.textContent = theme.name;
      btn.appendChild(dot);
      btn.appendChild(label);
      btn.addEventListener('click', () => {
        this.applyTheme(theme.id);
        localStorage.setItem('neon_tunnel_theme', theme.id);
      });
      container.appendChild(btn);
      buttons.push(btn);
    }
    this.themeButtons = buttons;
    this.updatePlayerPosition(0);
    this.updateHud();
  }

  
  private spawnSparkBurst(origin: THREE.Vector3, colorHex: number, count: number, speedScale = 1): void {
    const color = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      if (this.sparks.length >= MAX_SPARKS) {
        this.sparks.shift();
      }
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;
      const spd = (5 + Math.random() * 13) * speedScale;
      const maxLife = 0.32 + Math.random() * 0.35;
      this.sparks.push({
        x: origin.x,
        y: origin.y,
        z: origin.z,
        vx: Math.cos(theta) * Math.cos(phi) * spd,
        vy: Math.sin(theta) * Math.cos(phi) * spd,
        vz: (Math.sin(phi) * spd) + 8,
        r: color.r,
        g: color.g,
        b: color.b,
        life: maxLife,
        maxLife,
      });
    }
  }

  private updateSparks(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vx *= 0.96;
      s.vy *= 0.96;
    }

    this.sparkPositions.fill(0);
    this.sparkColors.fill(0);
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      const fade = Math.max(0, s.life / s.maxLife);
      const idx = i * 3;
      this.sparkPositions[idx] = s.x;
      this.sparkPositions[idx + 1] = s.y;
      this.sparkPositions[idx + 2] = s.z;
      this.sparkColors[idx] = s.r * fade;
      this.sparkColors[idx + 1] = s.g * fade;
      this.sparkColors[idx + 2] = s.b * fade;
    }
    (this.sparkGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.sparkGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.sparkGeo.setDrawRange(0, this.sparks.length);
  }

  private bindUiEvents(): void {
    getRequiredEl('start-btn').addEventListener('click', () => this.startRun());
    getRequiredEl('restart-btn').addEventListener('click', () => this.startRun());
    document.getElementById('btn-resume')?.addEventListener('click', () => this.resumeRun());
    getRequiredEl('menu-btn').addEventListener('click', () => this.returnToMenu());

    this.muteButton.addEventListener('click', () => {
      this.muted = !this.muted;
      this.audio.setMuted(this.muted);
      this.muteButton.textContent = this.muted ? 'Audio: OFF' : 'Audio: ON';
    });

    window.addEventListener('keydown', this.handleGlobalKeyDown);
  }

  private handleGlobalKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' || event.code === 'KeyP') {
      if (this.state === 'playing' && !this.paused) {
        this.pauseRun();
      } else if (this.paused) {
        this.resumeRun();
      }
      return;
    }

    if (event.code === 'Space' && (this.state === 'menu' || this.state === 'gameover')) {
      event.preventDefault();
      this.startRun();
    }
  };

  private applyTheme(themeId: ThemeId): void {
    this.currentTheme = THEMES[themeId];
    this.sceneManager.applyTheme(this.currentTheme);
    this.tunnel.applyTheme(this.currentTheme);
    this.obstacles.applyTheme(this.currentTheme);
    this.runner.applyTheme(this.currentTheme);

    this.themeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === themeId);
    });
  }

  private startRun(): void {
    // audio pulse
    this.audio.startPulse();
    this.state = 'playing'; this.paused = false;
    this.playerAngle = -Math.PI / 2;
    this.speed = BASE_SPEED;
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.nearMisses = 0;
    this.distance = 0;
    this.runTime = 0;
    this.sparks = [];
    this.activePowerUps = {
      shield: 0,
      double: 0,
      slowmo: 0,
    };

    this.obstacles.reset();
    this.powerUps.reset();
    this.startOverlay.classList.add('hidden');
    this.pauseOverlay?.classList.add('hidden');
    this.gameOverOverlay.classList.add('hidden');
    this.hudEl.classList.remove('hidden');
    this.updateHud();
  }

  private pauseRun(): void {
    if (this.state !== 'playing') return;
    this.paused = true; this.audio.stopPulse();
    this.pauseOverlay?.classList.remove('hidden');
  }

  private resumeRun(): void {
    if (!this.paused) return;
    this.state = 'playing'; this.paused = false;
    this.pauseOverlay?.classList.add('hidden');
    this.lastFrameTime = performance.now();
  }

  private returnToMenu(): void {
    this.state = 'menu'; this.paused = false; this.audio.stopPulse();
    this.obstacles.reset();
    this.powerUps.reset();
    this.pauseOverlay?.classList.add('hidden');
    this.gameOverOverlay.classList.add('hidden');
    this.hudEl.classList.add('hidden');
    this.startOverlay.classList.remove('hidden');
  }

  private triggerGameOver(): void {
    this.state = 'gameover'; this.paused = false; this.audio.stopPulse();
    this.audio.playCrash();
    this.sceneManager.triggerShake(0.65);

    const roundedScore = Math.floor(this.score);
    if (roundedScore > this.bestScore) {
      this.bestScore = roundedScore;
      localStorage.setItem(BEST_SCORE_KEY, String(this.bestScore));
    }

    const stats: RunStats = {
      combo: this.combo, 
      score: roundedScore,
      bestScore: this.bestScore,
      distance: Math.floor(this.distance),
      nearMisses: this.nearMisses,
      speedMultiplier: Number((this.speed / BASE_SPEED).toFixed(2)),
    };

    this.finalScoreEl.textContent = stats.score.toLocaleString();
    this.finalBestEl.textContent = stats.bestScore.toLocaleString();
    this.finalDistanceEl.textContent = `${stats.distance} m`;
    this.finalNearMissEl.textContent = String(stats.nearMisses);

    this.hudEl.classList.add('hidden');
    this.gameOverOverlay.classList.remove('hidden');
  }

  private updatePlayerPosition(steerInput: number): void {
    const x = Math.cos(this.playerAngle) * PLAYER_ORBIT_RADIUS;
    const y = Math.sin(this.playerAngle) * PLAYER_ORBIT_RADIUS;
    this.runner.group.position.set(x, y, PLAYER_Z);
    this.runner.group.rotation.z = this.playerAngle + Math.PI / 2 - steerInput * 0.36;
  }

  private updateActivePowerUps(dt: number): void {
    this.activePowerUps.shield = Math.max(0, this.activePowerUps.shield - dt);
    this.activePowerUps.double = Math.max(0, this.activePowerUps.double - dt);
    this.activePowerUps.slowmo = Math.max(0, this.activePowerUps.slowmo - dt);

    const shieldActive = this.activePowerUps.shield > 0;
    this.runner.setShieldVisible(this.activePowerUps.shield > 0);

    const badges: string[] = [];
    if (shieldActive) badges.push(`SHIELD ${this.activePowerUps.shield.toFixed(1)}s`);
    if (this.activePowerUps.double > 0) {
      badges.push(`2X SCORE ${this.activePowerUps.double.toFixed(1)}s`);
    }
    if (this.activePowerUps.slowmo > 0) {
      badges.push(`SLOW-MO ${this.activePowerUps.slowmo.toFixed(1)}s`);
    }
    this.powerUpBadgesEl.innerHTML = badges.map((b) => `<span class="badge">${b}</span>`).join('');
  }

  private updateHud(): void {
    this.scoreValueEl.textContent = Math.floor(this.score).toLocaleString();
    this.bestValueEl.textContent = this.bestScore.toLocaleString();
    this.speedValueEl.textContent = `${Math.round(this.speed)} u/s`;
    this.comboValueEl.textContent = `x${this.combo}`;
  }

  private loop = (now: number): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    this.updateSparks(rawDt);

    if (this.state === 'playing' && !this.paused) {
      this.runTime += rawDt;
      this.updateActivePowerUps(rawDt);

      const timeScale = this.activePowerUps.slowmo > 0 ? 0.62 : 1;
      const dt = rawDt * timeScale;

      const difficulty = Math.min(1, this.runTime / 75);
      this.speed = Math.min(MAX_SPEED, BASE_SPEED + difficulty * (MAX_SPEED - BASE_SPEED));

      const steer = this.input.getSteerInput();
      this.playerAngle += steer * (2.85 + difficulty * 0.65) * rawDt;
      this.updatePlayerPosition(steer);

      const speedRatio = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
      this.runner.update(rawDt, steer, speedRatio);

      this.tunnel.update(this.speed, dt);
      const obsResult = this.obstacles.update(
        this.speed,
        dt,
        difficulty,
        this.playerAngle,
        PLAYER_ORBIT_RADIUS,
        this.activePowerUps.shield > 0
      );

      if (obsResult.hit) {
        this.spawnSparkBurst(this.runner.group.position, 0xff3366, 55, 1.65);
        this.triggerGameOver();
      } else {
        if (obsResult.nearMiss) {
          this.nearMisses += 1;
          this.combo = Math.min(8, this.combo + 1);
          this.comboTimer = 4.0;
          this.score += 120 * this.combo;
          this.audio.playNearMiss(this.combo);
          this.sceneManager.triggerShake(0.14);
          this.spawnSparkBurst(this.runner.group.position, 0x00f0ff, 22, 1.0);
        }

        if (this.comboTimer > 0) {
          this.comboTimer -= rawDt;
          if (this.comboTimer <= 0) {
            this.combo = 1;
          }
        }

        const collected = this.powerUps.update(this.speed, dt, this.playerAngle, PLAYER_ORBIT_RADIUS);
        if (collected) {
          this.audio.playPowerUp();
          const pColor = collected === 'shield' ? 0x38bdf8 : collected === 'double' ? 0xfacc15 : 0xa855f7;
          this.spawnSparkBurst(this.runner.group.position, pColor, 28, 1.15);
          if (collected === 'shield') this.activePowerUps.shield = 7.0;
          if (collected === 'double') this.activePowerUps.double = 8.0;
          if (collected === 'slowmo') this.activePowerUps.slowmo = 5.0;
        }

        const scoreMultiplier = this.activePowerUps.double > 0 ? 2 : 1;
        this.distance += this.speed * dt;
        this.score += (this.speed * dt * 1.4 + obsResult.passedCount * 25) * this.combo * scoreMultiplier;

        const themeIndex = Math.floor(this.runTime / 28) % THEME_LIST.length;
        const targetTheme = THEME_LIST[themeIndex];
        if (targetTheme.id !== this.currentTheme.id) {
          this.applyTheme(targetTheme.id);
        }

        this.sceneManager.updateCamera(
          this.runner.group.position.x,
          this.runner.group.position.y,
          steer,
          rawDt,
          speedRatio
        );
        this.updateHud();
      }
    } else if (this.state === 'menu') {
      this.tunnel.update(28, rawDt);
      this.playerAngle = -Math.PI / 2 + Math.sin(now * 0.0012) * 0.35;
      this.updatePlayerPosition(Math.cos(now * 0.0012) * 0.4);
      this.runner.update(rawDt, Math.cos(now * 0.0012) * 0.4, 0.25);
      this.sceneManager.updateCamera(this.runner.group.position.x, this.runner.group.position.y, 0, rawDt, 0);
    }

    this.sceneManager.render();
  };

  public dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', this.handleGlobalKeyDown);
    this.input.dispose();
    this.sceneManager.dispose();
  }
}
