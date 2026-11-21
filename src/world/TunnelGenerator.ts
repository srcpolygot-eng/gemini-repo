import * as THREE from 'three';
import type { TunnelTheme } from '../types/game';

export const TUNNEL_RADIUS = 6.2;
const RING_COUNT = 28;
const RING_SPACING = 6.5;
const RAIL_COUNT = 8;

export class TunnelGenerator {
  private readonly group = new THREE.Group();
  private readonly rings: THREE.Mesh[] = [];
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly railMaterial: THREE.MeshBasicMaterial;
  private readonly tunnelLength = RING_COUNT * RING_SPACING;

  constructor(scene: THREE.Scene, theme: TunnelTheme) {
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: theme.ringColorHex,
      transparent: true,
      opacity: 0.78,
    });

    this.railMaterial = new THREE.MeshBasicMaterial({
      color: theme.railColorHex,
      transparent: true,
      opacity: 0.45,
    });

    const ringGeo = new THREE.TorusGeometry(TUNNEL_RADIUS, 0.055, 6, 16);
    for (let i = 0; i < RING_COUNT; i++) {
      const ring = new THREE.Mesh(ringGeo, this.ringMaterial);
      ring.position.z = 10 - i * RING_SPACING;
      ring.rotation.z = (i * Math.PI) / 16;
      this.rings.push(ring);
      this.group.add(ring);
    }

    const railGeo = new THREE.CylinderGeometry(0.035, 0.035, this.tunnelLength, 6);
    railGeo.rotateX(Math.PI / 2);

    for (let i = 0; i < RAIL_COUNT; i++) {
      const angle = (i / RAIL_COUNT) * Math.PI * 2;
      const rail = new THREE.Mesh(railGeo, this.railMaterial);
      rail.position.set(
        Math.cos(angle) * TUNNEL_RADIUS,
        Math.sin(angle) * TUNNEL_RADIUS,
        10 - this.tunnelLength * 0.5
      );
      this.group.add(rail);
    }

    scene.add(this.group);
  }

  public applyTheme(theme: TunnelTheme): void {
    this.ringMaterial.color.setHex(theme.ringColorHex);
    this.railMaterial.color.setHex(theme.railColorHex);
  }

  public update(speed: number, dt: number): void {
    const moveZ = speed * dt;
    for (const ring of this.rings) {
      ring.position.z += moveZ;
      ring.rotation.z += dt * 0.25;
      if (ring.position.z > 12) {
        ring.position.z -= this.tunnelLength;
      }
    }
  }

  public reset(): void {
    for (let i = 0; i < this.rings.length; i++) {
      this.rings[i].position.z = 10 - i * RING_SPACING;
    }
  }
}
