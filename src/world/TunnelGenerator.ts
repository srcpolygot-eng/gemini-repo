import * as THREE from 'three';
import type { TunnelTheme } from '../types/game';

export const TUNNEL_RADIUS = 6.2;
const RING_COUNT = 28;
const RING_SPACING = 6.5;
const RAIL_COUNT = 8;
const WARP_STREAK_COUNT = 160;

export class TunnelGenerator {
  private readonly group = new THREE.Group();
  private readonly rings: THREE.Mesh[] = [];
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly innerRingMaterial: THREE.MeshBasicMaterial;
  private readonly outerGlowMaterial: THREE.MeshBasicMaterial;
  private readonly railMaterial: THREE.MeshBasicMaterial;
  private readonly warpMaterial: THREE.LineBasicMaterial;
  private readonly warpGeo: THREE.BufferGeometry;
  private readonly warpPositions: Float32Array;
  private readonly warpData: Float32Array;
  private readonly tunnelLength = RING_COUNT * RING_SPACING;
  private elapsedTime = 0;

  constructor(scene: THREE.Scene, theme: TunnelTheme) {
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: theme.ringColorHex,
      transparent: true,
      opacity: 0.85,
    });

    this.innerRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.outerGlowMaterial = new THREE.MeshBasicMaterial({
      color: theme.ringColorHex,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.railMaterial = new THREE.MeshBasicMaterial({
      color: theme.railColorHex,
      transparent: true,
      opacity: 0.45,
    });

    const ringGeo = new THREE.TorusGeometry(TUNNEL_RADIUS, 0.055, 8, 24);
    const innerGeo = new THREE.TorusGeometry(TUNNEL_RADIUS - 0.03, 0.025, 6, 24);
    const outerGeo = new THREE.TorusGeometry(TUNNEL_RADIUS + 0.06, 0.14, 8, 24);

    for (let i = 0; i < RING_COUNT; i++) {
      const ring = new THREE.Mesh(ringGeo, this.ringMaterial);
      const innerMesh = new THREE.Mesh(innerGeo, this.innerRingMaterial);
      const outerMesh = new THREE.Mesh(outerGeo, this.outerGlowMaterial);
      ring.add(innerMesh);
      ring.add(outerMesh);

      ring.position.z = 10 - i * RING_SPACING;
      ring.rotation.z = (i * Math.PI) / 16;
      this.rings.push(ring);
      this.group.add(ring);
    }

    const railGeo = new THREE.BoxGeometry(0.06, 0.06, this.tunnelLength);
    for (let i = 0; i < RAIL_COUNT; i++) {
      const angle = (i / RAIL_COUNT) * Math.PI * 2;
      const rail = new THREE.Mesh(railGeo, this.railMaterial);
      rail.position.set(
        Math.cos(angle) * TUNNEL_RADIUS,
        Math.sin(angle) * TUNNEL_RADIUS,
        10 - this.tunnelLength / 2
      );
      this.group.add(rail);
    }

    this.warpPositions = new Float32Array(WARP_STREAK_COUNT * 6);
    this.warpData = new Float32Array(WARP_STREAK_COUNT * 4);
    for (let i = 0; i < WARP_STREAK_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = TUNNEL_RADIUS * (0.45 + Math.random() * 0.7);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const z = 12 - Math.random() * this.tunnelLength;
      const speedMult = 1.2 + Math.random() * 1.1;

      const dIdx = i * 4;
      this.warpData[dIdx] = x;
      this.warpData[dIdx + 1] = y;
      this.warpData[dIdx + 2] = z;
      this.warpData[dIdx + 3] = speedMult;

      const pIdx = i * 6;
      this.warpPositions[pIdx] = x;
      this.warpPositions[pIdx + 1] = y;
      this.warpPositions[pIdx + 2] = z;
      this.warpPositions[pIdx + 3] = x;
      this.warpPositions[pIdx + 4] = y;
      this.warpPositions[pIdx + 5] = z - 1.8;
    }

    this.warpGeo = new THREE.BufferGeometry();
    this.warpGeo.setAttribute('position', new THREE.BufferAttribute(this.warpPositions, 3));
    this.warpMaterial = new THREE.LineBasicMaterial({
      color: theme.ringColorHex,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const warpLines = new THREE.LineSegments(this.warpGeo, this.warpMaterial);
    this.group.add(warpLines);

    scene.add(this.group);
  }

  public applyTheme(theme: TunnelTheme): void {
    this.ringMaterial.color.setHex(theme.ringColorHex);
    this.outerGlowMaterial.color.setHex(theme.ringColorHex);
    this.railMaterial.color.setHex(theme.railColorHex);
    this.warpMaterial.color.setHex(theme.ringColorHex);
  }

  public update(speed: number, dt: number): void {
    this.elapsedTime += dt;
    const speedRatio = THREE.MathUtils.clamp((speed - 20) / 50, 0, 1);

    this.outerGlowMaterial.opacity = 0.28 + speedRatio * 0.16 + Math.sin(this.elapsedTime * 5.5) * 0.04;

    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      ring.position.z += speed * dt;
      ring.rotation.z += dt * (0.28 + speedRatio * 0.25);

      const pulse = 1 + Math.sin(this.elapsedTime * (4.5 + speedRatio * 6) + i * 0.45) * (0.014 + speedRatio * 0.024);
      ring.scale.set(pulse, pulse, 1);

      if (ring.position.z > 12) {
        ring.position.z -= this.tunnelLength;
      }
    }

    const streakLength = 1.0 + speed * 0.075;
    for (let i = 0; i < WARP_STREAK_COUNT; i++) {
      const dIdx = i * 4;
      let x = this.warpData[dIdx];
      let y = this.warpData[dIdx + 1];
      let z = this.warpData[dIdx + 2] + speed * this.warpData[dIdx + 3] * dt;

      if (z > 12) {
        z -= this.tunnelLength;
        const angle = Math.random() * Math.PI * 2;
        const radius = TUNNEL_RADIUS * (0.45 + Math.random() * 0.7);
        x = Math.cos(angle) * radius;
        y = Math.sin(angle) * radius;
        this.warpData[dIdx] = x;
        this.warpData[dIdx + 1] = y;
      }
      this.warpData[dIdx + 2] = z;

      const pIdx = i * 6;
      this.warpPositions[pIdx] = x;
      this.warpPositions[pIdx + 1] = y;
      this.warpPositions[pIdx + 2] = z;
      this.warpPositions[pIdx + 3] = x;
      this.warpPositions[pIdx + 4] = y;
      this.warpPositions[pIdx + 5] = z - streakLength;
    }
    (this.warpGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
