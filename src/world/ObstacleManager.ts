import * as THREE from 'three';
import { ObstacleInstance, ObstacleKind, TunnelTheme } from '../types/game';
import { TUNNEL_RADIUS } from './TunnelGenerator';

const SPAWN_Z = -165;
const DESPAWN_Z = 12;
const ORBIT_RADIUS = TUNNEL_RADIUS - 1.35;

export interface ObstacleUpdateResult {
  hit: boolean;
  nearMiss: boolean;
  passedCount: number;
}

function normalizeAngleDiff(a: number, b: number): number {
  let diff = ((a - b + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}

export class ObstacleManager {
  private readonly scene: THREE.Scene;
  private readonly group = new THREE.Group();
  private readonly material: THREE.MeshStandardMaterial;
  private obstacles: ObstacleInstance[] = [];
  private spawnTimer = 0;

  constructor(scene: THREE.Scene, theme: TunnelTheme) {
    this.scene = scene;
    this.material = new THREE.MeshStandardMaterial({
      color: theme.obstacleColorHex,
      emissive: theme.obstacleEmissiveHex,
      emissiveIntensity: 0.95,
      roughness: 0.22,
      metalness: 0.55,
    });
    this.scene.add(this.group);
  }

  public applyTheme(theme: TunnelTheme): void {
    this.material.color.setHex(theme.obstacleColorHex);
    this.material.emissive.setHex(theme.obstacleEmissiveHex);
  }

  public reset(): void {
    for (const obs of this.obstacles) {
      this.group.remove(obs.mesh);
    }
    this.obstacles = [];
    this.spawnTimer = 0.6;
  }

  private spawnPattern(elapsedTime: number): void {
    const difficulty = Math.min(1, elapsedTime / 75);
    const kinds: ObstacleKind[] = ['cube', 'bar', 'arc'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const baseAngle = Math.random() * Math.PI * 2;

    this.createObstacle(kind, baseAngle, SPAWN_Z);

    if (difficulty > 0.35 && Math.random() < 0.35 + difficulty * 0.3) {
      const offset = Math.PI * (0.7 + Math.random() * 0.6);
      const secondKind: ObstacleKind = Math.random() < 0.6 ? 'cube' : 'bar';
      this.createObstacle(secondKind, baseAngle + offset, SPAWN_Z - 2.5);
    }
  }

  private createObstacle(kind: ObstacleKind, angle: number, z: number): void {
    let mesh: THREE.Object3D;
    let angularWidth: number;
    let radialDepth: number;

    if (kind === 'cube') {
      const geo = new THREE.BoxGeometry(1.15, 1.15, 1.35);
      const box = new THREE.Mesh(geo, this.material);
      box.position.set(Math.cos(angle) * ORBIT_RADIUS, Math.sin(angle) * ORBIT_RADIUS, z);
      box.rotation.z = angle;
      mesh = box;
      angularWidth = 0.34;
      radialDepth = 1.35;
    } else if (kind === 'bar') {
      const geo = new THREE.BoxGeometry(0.62, 2.35, 1.15);
      const bar = new THREE.Mesh(geo, this.material);
      bar.position.set(Math.cos(angle) * ORBIT_RADIUS, Math.sin(angle) * ORBIT_RADIUS, z);
      bar.rotation.z = angle + Math.PI / 2;
      mesh = bar;
      angularWidth = 0.56;
      radialDepth = 1.15;
    } else {
      const arcSpan = 0.78;
      const geo = new THREE.TorusGeometry(ORBIT_RADIUS, 0.34, 8, 18, arcSpan);
      const arc = new THREE.Mesh(geo, this.material);
      arc.position.set(0, 0, z);
      arc.rotation.z = angle - arcSpan * 0.5;
      mesh = arc;
      angularWidth = arcSpan;
      radialDepth = 1.1;
    }

    this.group.add(mesh);
    this.obstacles.push({
      mesh,
      kind,
      angle,
      angularWidth,
      radialDepth,
      z,
      passed: false,
      nearMissChecked: false,
    });
  }

  public update(
    speed: number,
    dt: number,
    elapsedTime: number,
    playerAngle: number,
    playerZ: number
  ): ObstacleUpdateResult {
    const moveZ = speed * dt;
    let hit = false;
    let nearMiss = false;
    let passedCount = 0;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnPattern(elapsedTime);
      const minInterval = Math.max(0.28, 0.78 - elapsedTime * 0.005);
      const maxInterval = Math.max(0.45, 1.12 - elapsedTime * 0.006);
      this.spawnTimer = minInterval + Math.random() * (maxInterval - minInterval);
    }

    const remaining: ObstacleInstance[] = [];

    for (const obs of this.obstacles) {
      obs.z += moveZ;
      obs.mesh.position.z = obs.z;

      if (obs.kind === 'cube') {
        obs.mesh.rotation.x += dt * 1.4;
      }

      if (!obs.passed && Math.abs(obs.z - playerZ) < obs.radialDepth * 0.5 + 0.55) {
        const diff = normalizeAngleDiff(playerAngle, obs.angle);
        const hitThreshold = obs.angularWidth * 0.5 + 0.12;
        const nearMissThreshold = obs.angularWidth * 0.5 + 0.42;

        if (diff < hitThreshold) {
          hit = true;
          obs.passed = true;
          obs.nearMissChecked = true;
        } else if (!obs.nearMissChecked && diff < nearMissThreshold) {
          obs.nearMissChecked = true;
          nearMiss = true;
        }
      }

      if (!obs.passed && obs.z > playerZ + 1.2) {
        obs.passed = true;
        passedCount += 1;
      }

      if (obs.z > DESPAWN_Z) {
        this.group.remove(obs.mesh);
      } else {
        remaining.push(obs);
      }
    }

    this.obstacles = remaining;
    return { hit, nearMiss, passedCount };
  }
}
