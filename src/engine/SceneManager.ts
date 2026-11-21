import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { TunnelTheme } from '../types/game';

export class SceneManager {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly keyLight: THREE.PointLight;
  private readonly rimLight: THREE.PointLight;
  private readonly container: HTMLElement;
  private shakeIntensity = 0;

  constructor(container: HTMLElement, initialTheme: TunnelTheme) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(initialTheme.backgroundHex);
    this.scene.fog = new THREE.FogExp2(initialTheme.fogHex, 0.014);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(74, width / height, 0.1, 220);
    this.camera.position.set(0, 0.4, 5.5);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambientLight);

    this.keyLight = new THREE.PointLight(initialTheme.ringColorHex, 3.2, 60);
    this.keyLight.position.set(0, 2, 4);
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.PointLight(initialTheme.obstacleColorHex, 2.5, 90);
    this.rimLight.position.set(0, -2, -28);
    this.scene.add(this.rimLight);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.floor(width / 2), Math.floor(height / 2)),
      0.85,
      0.45,
      0.22
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', this.handleResize);
  }

  public applyTheme(theme: TunnelTheme): void {
    this.scene.background = new THREE.Color(theme.backgroundHex);
    this.scene.fog = new THREE.FogExp2(theme.fogHex, 0.014);
    this.keyLight.color.setHex(theme.ringColorHex);
    this.rimLight.color.setHex(theme.obstacleColorHex);
  }

  public triggerShake(amount: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, amount);
  }

  public updateCamera(playerX: number, playerY: number, steerInput: number, dt: number, speedRatio = 0): void {
    const targetX = playerX * 0.42;
    const targetY = playerY * 0.42 + 0.55;

    this.camera.position.x += (targetX - this.camera.position.x) * Math.min(1, dt * 8);
    this.camera.position.y += (targetY - this.camera.position.y) * Math.min(1, dt * 8);

    if (this.shakeIntensity > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= Math.pow(0.05, dt);
    } else {
      this.shakeIntensity = 0;
    }

    const targetRoll = -steerInput * 0.14;
    this.camera.rotation.z += (targetRoll - this.camera.rotation.z) * Math.min(1, dt * 7);
    this.camera.lookAt(playerX * 0.2, playerY * 0.2, -18); const targetFov = 74 + Math.min(1, Math.max(0, speedRatio)) * 28; this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6); this.camera.updateProjectionMatrix();
  }

  public render(): void {
    this.composer.render();
  }

  private handleResize = (): void => {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(Math.floor(width / 2), Math.floor(height / 2));
  };

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.composer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
