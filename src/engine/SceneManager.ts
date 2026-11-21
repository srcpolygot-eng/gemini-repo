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
  private readonly playerLight: THREE.PointLight;
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.floor(width / 2), Math.floor(height / 2)),
      1.05,
      0.32,
      0.28
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    const ambient = new THREE.AmbientLight(0x28304a, 1.4);
    this.scene.add(ambient);

    this.keyLight = new THREE.PointLight(initialTheme.ringColorHex, 18, 90, 1.3);
    this.keyLight.position.set(0, 2, 4);
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.PointLight(initialTheme.obstacleColorHex, 14, 120, 1.2);
    this.rimLight.position.set(0, -3, -35);
    this.scene.add(this.rimLight);

    this.playerLight = new THREE.PointLight(initialTheme.ringColorHex, 5.5, 24, 1.4);
    this.playerLight.position.set(0, -4, 0.2);
    this.scene.add(this.playerLight);

    window.addEventListener('resize', this.handleResize);
  }

  public applyTheme(theme: TunnelTheme): void {
    this.scene.background = new THREE.Color(theme.backgroundHex);
    this.scene.fog = new THREE.FogExp2(theme.fogHex, 0.014);
    this.keyLight.color.setHex(theme.ringColorHex);
    this.rimLight.color.setHex(theme.obstacleColorHex);
    this.playerLight.color.setHex(theme.ringColorHex);
  }

  public triggerShake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  public updateCamera(playerX: number, playerY: number, steerInput: number, dt: number, speedRatio = 0): void {
    const targetX = playerX * 0.42;
    const targetY = playerY * 0.42 + 0.55;
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetX, Math.min(1, dt * 8));
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetY, Math.min(1, dt * 8));

    const targetFov = 74 + THREE.MathUtils.clamp(speedRatio, 0, 1) * 14;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 5));
      this.camera.updateProjectionMatrix();
    }

    this.playerLight.position.x = THREE.MathUtils.lerp(this.playerLight.position.x, playerX, Math.min(1, dt * 16));
    this.playerLight.position.y = THREE.MathUtils.lerp(this.playerLight.position.y, playerY, Math.min(1, dt * 16));
    this.playerLight.position.z = 0.2;
    this.playerLight.intensity = 5.5 + THREE.MathUtils.clamp(speedRatio, 0, 1) * 2.5;

    if (this.shakeIntensity > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.8);
    }

    this.camera.lookAt(playerX * 0.16, playerY * 0.16, -24);
    this.camera.rotation.z = THREE.MathUtils.lerp(this.camera.rotation.z, -steerInput * 0.055, Math.min(1, dt * 8));
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
    this.bloomPass.resolution.set(Math.floor(width / 2), Math.floor(height / 2));
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
