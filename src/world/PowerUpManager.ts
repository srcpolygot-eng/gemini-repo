import * as THREE from 'three';
import { ActivePowerUps, PowerUpInstance, PowerUpType } from '../types/game';
import { TUNNEL_RADIUS } from './TunnelGenerator';

const SPAWN_Z = -165;
const DESPAWN_Z = 12;
const ORBIT_RADIUS = TUNNEL_RADIUS - 1.35;

const POWERUP_COLORS: Record<PowerUpType, number> = {
  shield: 0x38bdf8,
  slowmo: 0xc084fc,
  double: 0xfacc15,
};

const POWERUP_DURATIONS: Record<PowerUpType, number> = {
  shield: 8,
  slowmo: 6,
  double: 10,
};

function normalizeAngleDiff(a: number, b: number): number {
  let diff = ((a - b + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}

export class PowerUpManager {
  private readonly scene: THREE.Scene;
  private readonly group = new THREE.Group();
  private pickups: PowerUpInstance[] = [];
  private spawnTimer = 5;
  private active: ActivePowerUps = {
    shield: 0,
    slowmo: 0,
    double: 0,
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.group);
  }

  public reset(): void {
    for (const item of this.pickups) {
      this.group.remove(item.mesh);
    }
    this.pickups = [];
    this.spawnTimer = 4.5;
    this.active = { shield: 0, slowmo: 0, double: 0 };
  }

  public getActive(): ActivePowerUps {
    return { ...this.active };
  }

  public consumeShield(): boolean {
    if (this.active.shield > 0) {
      this.active.shield = 0;
      return true;
    }
    return false;
  }

  private spawnPickup(): void {
    const types: PowerUpType[] = ['shield', 'slowmo', 'double'];
    const type = types[Math.floor(Math.random() * types.length)];
    const angle = Math.random() * Math.PI * 2;
    const color = POWERUP_COLORS[type];

    const meshGroup = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.2,
        roughness: 0.15,
        metalness: 0.4,
      })
    );
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.07, 8, 24),
      new THREE.MeshBasicMaterial({ color })
    );
    meshGroup.add(core);
    meshGroup.add(halo);
    meshGroup.position.set(
      Math.cos(angle) * ORBIT_RADIUS,
      Math.sin(angle) * ORBIT_RADIUS,
      SPAWN_Z
    );

    this.group.add(meshGroup);
    this.pickups.push({
      mesh: meshGroup,
      type,
      angle,
      z: SPAWN_Z,
      collected: false,
    });
  }

  public update(
    speed: number,
    dt: number,
    playerAngle: number,
    playerZ: number
  ): PowerUpType | null {
    this.active.shield = Math.max(0, this.active.shield - dt);
    this.active.slowmo = Math.max(0, this.active.slowmo - dt);
    this.active.double = Math.max(0, this.active.double - dt);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnPickup();
      this.spawnTimer = 6.5 + Math.random() * 5;
    }

    let collectedType: PowerUpType | null = null;
    const moveZ = speed * dt;
    const remaining: PowerUpInstance[] = [];

    for (const item of this.pickups) {
      item.z += moveZ;
      item.mesh.position.z = item.z;
      item.mesh.rotation.y += dt * 2.4;
      item.mesh.rotation.x += dt * 1.5;

      if (!item.collected && Math.abs(item.z - playerZ) < 1.35) {
        const diff = normalizeAngleDiff(playerAngle, item.angle);
        if (diff < 0.42) {
          item.collected = true;
          collectedType = item.type;
          this.active[item.type] = POWERUP_DURATIONS[item.type];
          this.group.remove(item.mesh);
          continue;
        }
      }

      if (item.z > DESPAWN_Z) {
        this.group.remove(item.mesh);
      } else {
        remaining.push(item);
      }
    }

    this.pickups = remaining;
    return collectedType;
  }
}
