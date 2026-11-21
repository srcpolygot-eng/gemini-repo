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
  private readonly edgeMaterial: THREE.LineBasicMaterial;
  private obstacles: ObstacleInstance[] = [];
  private spawnTimer = 0;

  constructor(scene: THREE.Scene, theme: TunnelTheme) {
    this.scene = scene;
    this.material = new THREE.MeshStandardMaterial({
      color: theme.obstacleColorHex,
      emissive: theme.obstacleEmissiveHex,
      emissiveIntensity: 0.95,
      roughness: 0.22,
      metalness: 0.45,
    });
    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(theme.obstacleEmissiveHex).lerp(new THREE.Color(0xffffff), 0.65),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    this.scene.add(this.group);
  }

  public applyTheme(theme: TunnelTheme): void {
    this.material.color.setHex(theme.obstacleColorHex);
    this.material.emissive.setHex(theme.obstacleEmissiveHex);
    this.edgeMaterial.color.setHex(theme.obstacleEmissiveHex).lerp(new THREE.Color(0xffffff), 0.65);
  }

  public reset(): void {
    for (const obstacle of this.obstacles) {
      this.group.remove(obstacle.mesh);
      this.disposeMesh(obstacle.mesh);
    }
    this.obstacles = [];
    this.spawnTimer = 0.25;
  }

  private addOutline(mesh: THREE.Mesh, geometry: THREE.BufferGeometry, thresholdAngle = 15): void {
    const edgesGeo = new THREE.EdgesGeometry(geometry, thresholdAngle);
    const outline = new THREE.LineSegments(edgesGeo, this.edgeMaterial);
    outline.scale.setScalar(1.012);
    mesh.add(outline);
  }

  private disposeMesh(mesh: THREE.Object3D): void {
    for (const child of mesh.children) {
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
      }
    }
    if (mesh instanceof THREE.Mesh) { mesh.geometry.dispose(); }
  }

  private spawnObstacle(difficulty: number): void {
    const roll = Math.random();
    const kind: ObstacleKind = roll < 0.45 ? 'cube' : roll < 0.78 ? 'bar' : 'arc';
    const angle = Math.random() * Math.PI * 2;
    let mesh: THREE.Mesh;
    let angularWidth = 0.34;
    let radialDepth = 0.95;

    if (kind === 'cube') {
      const size = 1.55 + Math.random() * 0.65;
      const geo = new THREE.BoxGeometry(size, size, size);
      mesh = new THREE.Mesh(geo, this.material);
      this.addOutline(mesh, geo, 15);
      mesh.position.set(
        Math.cos(angle) * ORBIT_RADIUS,
        Math.sin(angle) * ORBIT_RADIUS,
        SPAWN_Z
      );
      angularWidth = 0.36;
      radialDepth = size * 0.6;
    } else if (kind === 'bar') {
      const length = 3.8 + Math.random() * 1.4;
      const geo = new THREE.BoxGeometry(length, 1.05, 1.15);
      mesh = new THREE.Mesh(geo, this.material);
      this.addOutline(mesh, geo, 15);
      mesh.position.set(
        Math.cos(angle) * (ORBIT_RADIUS - 0.35),
        Math.sin(angle) * (ORBIT_RADIUS - 0.35),
        SPAWN_Z
      );
      mesh.rotation.z = angle + Math.PI / 2;
      angularWidth = 0.62;
      radialDepth = 0.9;
    } else {
      const arcSpan = Math.PI * (0.52 + Math.min(0.28, difficulty * 0.2));
      const geo = new THREE.TorusGeometry(ORBIT_RADIUS, 0.55, 8, 22, arcSpan);
      mesh = new THREE.Mesh(geo, this.material);
      this.addOutline(mesh, geo, 20);
      mesh.position.set(0, 0, SPAWN_Z);
      mesh.rotation.z = angle - arcSpan / 2;
      angularWidth = arcSpan / 2 + 0.12;
      radialDepth = 0.85;
    }

    mesh.userData.spinSpeed = (Math.random() - 0.5) * (0.4 + difficulty * 1.3); this.group.add(mesh);
    this.obstacles.push({
      mesh,
      kind,
      angle,
      angularWidth,
      radialDepth,
      z: SPAWN_Z,
      
      passed: false,
      nearMissChecked: false,
    });
  }

  public update(
    speed: number,
    dt: number,
    difficulty: number,
    playerAngle: number,
    playerRadius: number,
    shieldActive: boolean
  ): ObstacleUpdateResult {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnObstacle(difficulty);
      const baseInterval = Math.max(0.27, 0.78 - difficulty * 0.44);
      this.spawnTimer = baseInterval * (0.85 + Math.random() * 0.35);
    }

    let hit = false;
    let nearMiss = false;
    let passedCount = 0;

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.z += speed * dt;
      obs.mesh.position.z = obs.z;

      if (obs.kind === 'cube') {
        obs.mesh.rotation.x += dt * 1.3;
        obs.mesh.rotation.y += dt * 1.1;
      } else if (obs.kind === 'arc') {
        obs.angle += ((obs.mesh.userData.spinSpeed as number) ?? 0) * dt;
        obs.mesh.rotation.z += ((obs.mesh.userData.spinSpeed as number) ?? 0) * dt;
      }

      if (Math.abs(obs.z) < 0.95) {
        const angleDiff = normalizeAngleDiff(playerAngle, obs.angle);
        const radialDiff = Math.abs(playerRadius - ORBIT_RADIUS);

        if (angleDiff < obs.angularWidth && radialDiff < obs.radialDepth) {
          if (shieldActive) {
            this.removeObstacle(i);
            passedCount += 1;
            continue;
          }
          hit = true;
        } else if (
          !obs.nearMissChecked &&
          angleDiff < obs.angularWidth + 0.34 &&
          radialDiff < obs.radialDepth + 0.6
        ) {
          obs.nearMissChecked = true;
          nearMiss = true;
        }
      }

      if (!obs.passed && obs.z > 1.2) {
        obs.passed = true;
        passedCount += 1;
      }

      if (obs.z > DESPAWN_Z) {
        this.removeObstacle(i);
      }
    }

    return { hit, nearMiss, passedCount };
  }

  private removeObstacle(index: number): void {
    const [removed] = this.obstacles.splice(index, 1);
    if (removed) {
      this.group.remove(removed.mesh);
      this.disposeMesh(removed.mesh);
    }
  }
}
