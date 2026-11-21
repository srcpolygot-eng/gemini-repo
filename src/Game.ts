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
  private readonly inputManager: InputManager;
  private readonly tunnel: TunnelGenerator;
  private readonly obstacles: ObstacleManager;
  private readonly powerUps: PowerUpManager;
  private readonly audio: SynthAudio;

  private readonly playerGroup = new THREE.Group();
  private readonly shipMaterial: THREE.MeshStandardMaterial;
  private readonly cockpitMaterial: THREE.MeshBasicMaterial;
  private readonly shipEdgeMaterial: THREE.LineBasicMaterial;
  private readonly thrusterMaterial: THREE.MeshBasicMaterial;
  private readonly shieldMesh: THREE.Mesh;
  private thrusterLeft!: THREE.Mesh;
  private thrusterRight!: THREE.Mesh;

  private readonly sparkGeo: THREE.BufferGeometry;
  private readonly sparkPositions: Float32Array;
  private readonly sparkColors: Float32Array;
  private sparks: SparkParticle[] = [];

  private state: GameState = 'menu';
  private currentTheme: TunnelTheme = THEMES.cyberpunk;
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
    shieldRemaining: 0,
    multiplierRemaining: 0,
    slowMoRemaining: 0,
  };

  private readonly startOverlay: HTMLElement;
  private readonly pauseOverlay: HTMLElement;
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
  private readonly themeButtons: NodeListOf<HTMLButtonElement>;

  constructor(container: HTMLElement) {
    this.bestScore = Number(localStorage.getItem(BEST_SCORE_KEY) || '0') || 0;

    this.sceneManager = new SceneManager(container, this.currentTheme);
    this.inputManager = new InputManager();
    this.tunnel = new TunnelGenerator(this.sceneManager.scene, this.currentTheme);
    this.obstacles = new ObstacleManager(this.sceneManager.scene, this.currentTheme);
    this.powerUps = new PowerUpManager(this.sceneManager.scene);
    this.audio = new SynthAudio();

    this.shipMaterial = new THREE.MeshStandardMaterial({
      color: this.currentTheme.shipColorHex,
      emissive: this.currentTheme.shipEmissiveHex,
      emissiveIntensity: 0.75,
      roughness: 0.25,
      metalness: 0.7,
    });

    this.cockpitMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
    });

    this.shipEdgeMaterial = new THREE.LineBasicMaterial({
      color: this.currentTheme.ringColorHex,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });

    this.thrusterMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 20, 16),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
      })
    );
    this.shieldMesh.visible = false;

    this.buildPlayerShip();
    this.sceneManager.scene.add(this.playerGroup);

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

    this.startOverlay = getRequiredEl('start-overlay');
    this.pauseOverlay = getRequiredEl('pause-overlay');
    this.gameOverOverlay = getRequiredEl('gameover-overlay');
    this.hudEl = getRequiredEl('hud');
    this.scoreValueEl = getRequiredEl('hud-score');
    this.bestValueEl = getRequiredEl('hud-best');
    this.speedValueEl = getRequiredEl('hud-speed');
    this.comboValueEl = getRequiredEl('hud-combo');
    this.powerUpBadgesEl = getRequiredEl('hud-powerups');
    this.finalScoreEl = getRequiredEl('final-score');
    this.finalBestEl = getRequiredEl('final-best');
    this.finalDistanceEl = getRequiredEl('final-distance');
    this.finalNearMissEl = getRequiredEl('final-nearmiss');
    this.muteButton = getRequiredEl<HTMLButtonElement>('btn-mute');
    this.themeButtons = document.querySelectorAll<HTMLButtonElement>('[data-theme]');

    this.bindUiEvents();
    this.applyTheme('cyberpunk');
    this.updatePlayerPosition(0);
    this.updateHud();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private addShipEdge(mesh: THREE.Mesh, geo: THREE.BufferGeometry): void {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 18), this.shipEdgeMaterial);
    edges.scale.setScalar(1.015);
    mesh.add(edges);
  }

  private buildPlayerShip(): void {
    const bodyGeo = new THREE.ConeGeometry(0.32, 1.85, 6);
    bodyGeo.rotateX(-Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, this.shipMaterial);
    this.addShipEdge(body, bodyGeo);
    this.playerGroup.add(body);

    const cockpitGeo = new THREE.SphereGeometry(0.18, 12, 10);
    cockpitGeo.scale(0.85, 0.55, 1.9);
    const cockpit = new THREE.Mesh(cockpitGeo, this.cockpitMaterial);
    cockpit.position.set(0, 0.14, -0.2);
    this.playerGroup.add(cockpit);

    const noseGeo = new THREE.ConeGeometry(0.08, 0.36, 6);
    noseGeo.rotateX(-Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, this.cockpitMaterial);
    nose.position.set(0, 0, -1.04);
    this.playerGroup.add(nose);

    const wingGeo = new THREE.BoxGeometry(1.15, 0.05, 0.52);
    const leftWing = new THREE.Mesh(wingGeo, this.shipMaterial);
    leftWing.position.set(-0.58, -0.04, 0.24);
    leftWing.rotation.set(0, 0.48, 0.12);
    this.addShipEdge(leftWing, wingGeo);
    this.playerGroup.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, this.shipMaterial);
    rightWing.position.set(0.58, -0.04, 0.24);
    rightWing.rotation.set(0, -0.48, -0.12);
    this.addShipEdge(rightWing, wingGeo);
    this.playerGroup.add(rightWing);

    const finGeo = new THREE.BoxGeometry(0.05, 0.36, 0.36);
    const leftFin = new THREE.Mesh(finGeo, this.shipMaterial);
    leftFin.position.set(-0.24, 0.16, 0.58);
    leftFin.rotation.z = 0.25;
    this.addShipEdge(leftFin, finGeo);
    this.playerGroup.add(leftFin);

    const rightFin = new THREE.Mesh(finGeo, this.shipMaterial);
    rightFin.position.set(0.24, 0.16, 0.58);
    rightFin.rotation.z = -0.25;
    this.addShipEdge(rightFin, finGeo);
    this.playerGroup.add(rightFin);

    const thrusterGeo = new THREE.ConeGeometry(0.11, 0.52, 8);
    thrusterGeo.rotateX(Math.PI / 2);
    this.thrusterLeft = new THREE.Mesh(thrusterGeo, this.thrusterMaterial);
    this.thrusterLeft.position.set(-0.22, -0.02, 0.96);
    this.playerGroup.add(this.thrusterLeft);

    this.thrusterRight = new THREE.Mesh(thrusterGeo, this.thrusterMaterial);
    this.thrusterRight.position.set(0.22, -0.02, 0.96);
    this.playerGroup.add(this.thrusterRight);

    this.playerGroup.add(this.shieldMesh);
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
    getRequiredEl('btn-start').addEventListener('click', () => this.startRun());
    getRequiredEl('btn-restart').addEventListener('click', () => this.startRun());
    getRequiredEl('btn-resume').addEventListener('click', () => this.resumeRun());
    getRequiredEl('btn-quit').addEventListener('click', () => this.returnToMenu());

    this.muteButton.addEventListener('click', () => {
      this.muted = !this.muted;
      this.audio.setMuted(this.muted);
      this.muteButton.textContent = this.muted ? 'Audio: OFF' : 'Audio: ON';
    });

    this.themeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const themeId = btn.dataset.theme as ThemeId | undefined;
        if (themeId && THEMES[themeId]) {
          this.applyTheme(themeId);
        }
      });
    });

    window.addEventListener('keydown', this.handleGlobalKeyDown);
  }

  private handleGlobalKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' || event.code === 'KeyP') {
      if (this.state === 'playing') {
        this.pauseRun();
      } else if (this.state === 'paused') {
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
    this.shipMaterial.color.setHex(this.currentTheme.shipColorHex);
    this.shipMaterial.emissive.setHex(this.currentTheme.shipEmissiveHex);
    this.shipEdgeMaterial.color.setHex(this.currentTheme.ringColorHex);
    this.thrusterMaterial.color.setHex(this.currentTheme.ringColorHex);

    this.themeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === themeId);
    });
  }

  private startRun(): void {
    this.audio.unlock();
    this.audio.playStart();
    this.state = 'playing';
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
      shieldRemaining: 0,
      multiplierRemaining: 0,
      slowMoRemaining: 0,
    };

    this.obstacles.reset();
    this.powerUps.reset();
    this.startOverlay.classList.add('hidden');
    this.pauseOverlay.classList.add('hidden');
    this.gameOverOverlay.classList.add('hidden');
    this.hudEl.classList.remove('hidden');
    this.updateHud();
  }

  private pauseRun(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pauseOverlay.classList.remove('hidden');
  }

  private resumeRun(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.pauseOverlay.classList.add('hidden');
    this.lastFrameTime = performance.now();
  }

  private returnToMenu(): void {
    this.state = 'menu';
    this.obstacles.reset();
    this.powerUps.reset();
    this.pauseOverlay.classList.add('hidden');
    this.gameOverOverlay.classList.add('hidden');
    this.hudEl.classList.add('hidden');
    this.startOverlay.classList.remove('hidden');
  }

  private triggerGameOver(): void {
    this.state = 'gameover';
    this.audio.playCrash();
    this.sceneManager.triggerShake(0.65);

    const roundedScore = Math.floor(this.score);
    if (roundedScore > this.bestScore) {
      this.bestScore = roundedScore;
      localStorage.setItem(BEST_SCORE_KEY, String(this.bestScore));
    }

    const stats: RunStats = {
      score: roundedScore,
      bestScore: this.bestScore,
      distance: Math.floor(this.distance),
      nearMisses: this.nearMisses,
      maxSpeed: Math.round(this.speed),
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
    this.playerGroup.position.set(x, y, PLAYER_Z);
    this.playerGroup.rotation.z = this.playerAngle + Math.PI / 2 - steerInput * 0.36;
  }

  private updateActivePowerUps(dt: number): void {
    this.activePowerUps.shieldRemaining = Math.max(0, this.activePowerUps.shieldRemaining - dt);
    this.activePowerUps.multiplierRemaining = Math.max(0, this.activePowerUps.multiplierRemaining - dt);
    this.activePowerUps.slowMoRemaining = Math.max(0, this.activePowerUps.slowMoRemaining - dt);

    const shieldActive = this.activePowerUps.shieldRemaining > 0;
    this.shieldMesh.visible = shieldActive;
    if (shieldActive) {
      this.shieldMesh.rotation.y += dt * 2.5;
      this.shieldMesh.rotation.x += dt * 1.4;
    }

    const badges: string[] = [];
    if (shieldActive) badges.push(`SHIELD ${this.activePowerUps.shieldRemaining.toFixed(1)}s`);
    if (this.activePowerUps.multiplierRemaining > 0) {
      badges.push(`2X SCORE ${this.activePowerUps.multiplierRemaining.toFixed(1)}s`);
    }
    if (this.activePowerUps.slowMoRemaining > 0) {
      badges.push(`SLOW-MO ${this.activePowerUps.slowMoRemaining.toFixed(1)}s`);
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

    if (this.state === 'playing') {
      this.runTime += rawDt;
      this.updateActivePowerUps(rawDt);

      const timeScale = this.activePowerUps.slowMoRemaining > 0 ? 0.62 : 1;
      const dt = rawDt * timeScale;

      const difficulty = Math.min(1, this.runTime / 75);
      this.speed = Math.min(MAX_SPEED, BASE_SPEED + difficulty * (MAX_SPEED - BASE_SPEED));

      const steer = this.inputManager.getSteerAxis();
      this.playerAngle += steer * (2.85 + difficulty * 0.65) * rawDt;
      this.updatePlayerPosition(steer);

      const speedRatio = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
      const thrusterPulse = 0.85 + speedRatio * 0.75 + Math.sin(now * 0.04) * 0.18;
      this.thrusterLeft.scale.set(1, 1, thrusterPulse);
      this.thrusterRight.scale.set(1, 1, thrusterPulse);
      this.thrusterMaterial.opacity = 0.7 + speedRatio * 0.28;

      this.tunnel.update(this.speed, dt);
      const obsResult = this.obstacles.update(
        this.speed,
        dt,
        difficulty,
        this.playerAngle,
        PLAYER_ORBIT_RADIUS,
        this.activePowerUps.shieldRemaining > 0
      );

      if (obsResult.hit) {
        this.spawnSparkBurst(this.playerGroup.position, 0xff3366, 55, 1.65);
        this.triggerGameOver();
      } else {
        if (obsResult.nearMiss) {
          this.nearMisses += 1;
          this.combo = Math.min(8, this.combo + 1);
          this.comboTimer = 4.0;
          this.score += 120 * this.combo;
          this.audio.playNearMiss();
          this.sceneManager.triggerShake(0.14);
          this.spawnSparkBurst(this.playerGroup.position, 0x00f0ff, 22, 1.0);
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
          const pColor = collected === 'shield' ? 0x38bdf8 : collected === 'multiplier' ? 0xfacc15 : 0xa855f7;
          this.spawnSparkBurst(this.playerGroup.position, pColor, 28, 1.15);
          if (collected === 'shield') this.activePowerUps.shieldRemaining = 7.0;
          if (collected === 'multiplier') this.activePowerUps.multiplierRemaining = 8.0;
          if (collected === 'slowmo') this.activePowerUps.slowMoRemaining = 5.0;
        }

        const scoreMultiplier = this.activePowerUps.multiplierRemaining > 0 ? 2 : 1;
        this.distance += this.speed * dt;
        this.score += (this.speed * dt * 1.4 + obsResult.passedCount * 25) * this.combo * scoreMultiplier;

        const themeIndex = Math.floor(this.runTime / 28) % THEME_LIST.length;
        const targetTheme = THEME_LIST[themeIndex];
        if (targetTheme.id !== this.currentTheme.id) {
          this.applyTheme(targetTheme.id);
        }

        this.sceneManager.updateCamera(
          this.playerGroup.position.x,
          this.playerGroup.position.y,
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
      const idlePulse = 0.8 + Math.sin(now * 0.03) * 0.12;
      this.thrusterLeft.scale.set(1, 1, idlePulse);
      this.thrusterRight.scale.set(1, 1, idlePulse);
      this.sceneManager.updateCamera(this.playerGroup.position.x, this.playerGroup.position.y, 0, rawDt, 0);
    }

    this.sceneManager.render();
  };

  public dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', this.handleGlobalKeyDown);
    this.inputManager.dispose();
    this.sceneManager.dispose();
  }
}
