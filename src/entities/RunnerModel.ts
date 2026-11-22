import * as THREE from 'three';
import type { TunnelTheme } from '../types/game';

export class RunnerModel {
  public readonly group: THREE.Group;

  private readonly shipRoot: THREE.Group;
  private readonly shieldMesh: THREE.Mesh;
  private readonly afterburnerCones: THREE.Mesh[] = [];
  private readonly engineRings: THREE.Mesh[] = [];

  private readonly hullMaterial: THREE.MeshStandardMaterial;
  private readonly armorMaterial: THREE.MeshStandardMaterial;
  private readonly canopyMaterial: THREE.MeshStandardMaterial;
  private readonly neonTrimMaterial: THREE.LineBasicMaterial;
  private readonly emissiveAccentMaterial: THREE.MeshStandardMaterial;
  private readonly thrusterMaterial: THREE.MeshBasicMaterial;
  private readonly shieldMaterial: THREE.MeshBasicMaterial;

  private elapsedTime = 0;
  private currentRoll = 0;

  constructor(initialTheme?: TunnelTheme) {
    this.group = new THREE.Group();
    this.shipRoot = new THREE.Group();
    this.group.add(this.shipRoot);

    this.hullMaterial = new THREE.MeshStandardMaterial({
      color: 0x161b28,
      metalness: 0.75,
      roughness: 0.28,
    });

    this.armorMaterial = new THREE.MeshStandardMaterial({
      color: 0x242c3d,
      metalness: 0.85,
      roughness: 0.22,
    });

    this.canopyMaterial = new THREE.MeshStandardMaterial({
      color: 0x091624,
      emissive: 0x003344,
      emissiveIntensity: 0.35,
      metalness: 0.95,
      roughness: 0.08,
      transparent: true,
      opacity: 0.82,
    });

    this.neonTrimMaterial = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.92,
    });

    this.emissiveAccentMaterial = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.6,
      metalness: 0.3,
      roughness: 0.2,
    });

    this.thrusterMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.shieldMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.buildFuselage();
    this.buildCanopy();
    this.buildWingsAndTail();
    this.buildThrusters();
    this.shieldMesh = this.buildShield();

    if (initialTheme) {
      this.applyTheme(initialTheme);
    }
  }

  private addWireframeTrim(geometry: THREE.BufferGeometry, parent: THREE.Object3D, thresholdAngle = 22): void {
    const edges = new THREE.EdgesGeometry(geometry, thresholdAngle);
    const lines = new THREE.LineSegments(edges, this.neonTrimMaterial);
    parent.add(lines);
  }

  private buildFuselage(): void {
    // Tapered nose cone pointing along -Z
    const noseGeo = new THREE.ConeGeometry(0.28, 1.35, 6);
    noseGeo.rotateX(-Math.PI / 2);
    noseGeo.scale(1.15, 0.55, 1);
    const noseMesh = new THREE.Mesh(noseGeo, this.armorMaterial);
    noseMesh.position.set(0, 0.02, -1.35);
    this.addWireframeTrim(noseGeo, noseMesh, 18);
    this.shipRoot.add(noseMesh);

    // Armored main hull
    const hullGeo = new THREE.BoxGeometry(0.68, 0.34, 1.55);
    const hullMesh = new THREE.Mesh(hullGeo, this.hullMaterial);
    hullMesh.position.set(0, 0, -0.05);
    this.addWireframeTrim(hullGeo, hullMesh, 15);
    this.shipRoot.add(hullMesh);

    // Dorsal spine ridge
    const spineGeo = new THREE.BoxGeometry(0.22, 0.16, 1.2);
    const spineMesh = new THREE.Mesh(spineGeo, this.armorMaterial);
    spineMesh.position.set(0, 0.21, 0.08);
    this.addWireframeTrim(spineGeo, spineMesh, 15);
    this.shipRoot.add(spineMesh);

    // Rear engine housing
    const housingGeo = new THREE.BoxGeometry(0.84, 0.38, 0.65);
    const housingMesh = new THREE.Mesh(housingGeo, this.armorMaterial);
    housingMesh.position.set(0, 0.01, 0.85);
    this.addWireframeTrim(housingGeo, housingMesh, 15);
    this.shipRoot.add(housingMesh);
  }

  private buildCanopy(): void {
    const canopyGeo = new THREE.CylinderGeometry(0.14, 0.22, 0.85, 6);
    canopyGeo.rotateX(Math.PI / 2);
    canopyGeo.scale(1.0, 0.72, 1.0);

    const canopyMesh = new THREE.Mesh(canopyGeo, this.canopyMaterial);
    canopyMesh.position.set(0, 0.22, -0.35);
    this.addWireframeTrim(canopyGeo, canopyMesh, 15);
    this.shipRoot.add(canopyMesh);
  }

  private buildWingsAndTail(): void {
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0.28, -0.35);
    wingShape.lineTo(1.55, 0.55);
    wingShape.lineTo(1.42, 0.85);
    wingShape.lineTo(0.32, 0.72);
    wingShape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 1,
    });
    wingGeo.rotateX(Math.PI / 2);

    for (const side of [-1, 1] as const) {
      const wing = new THREE.Mesh(wingGeo, this.hullMaterial);
      wing.scale.x = side;
      wing.position.set(0, 0.01, 0.12);
      this.addWireframeTrim(wingGeo, wing, 20);
      this.shipRoot.add(wing);

      // Wingtip nav / laser pod
      const podGeo = new THREE.CylinderGeometry(0.055, 0.075, 0.62, 8);
      podGeo.rotateX(Math.PI / 2);
      const pod = new THREE.Mesh(podGeo, this.armorMaterial);
      pod.position.set(side * 1.52, 0.02, 0.74);
      this.shipRoot.add(pod);

      const tipGeo = new THREE.SphereGeometry(0.055, 8, 8);
      const tip = new THREE.Mesh(tipGeo, this.emissiveAccentMaterial);
      tip.position.set(side * 1.52, 0.02, 0.41);
      this.shipRoot.add(tip);

      // Angled vertical tail fin
      const finGeo = new THREE.BoxGeometry(0.05, 0.46, 0.56);
      const fin = new THREE.Mesh(finGeo, this.armorMaterial);
      fin.position.set(side * 0.42, 0.34, 0.78);
      fin.rotation.z = -side * 0.28;
      this.addWireframeTrim(finGeo, fin, 15);
      this.shipRoot.add(fin);
    }
  }

  private buildThrusters(): void {
    const nozzleGeo = new THREE.CylinderGeometry(0.13, 0.17, 0.28, 12);
    nozzleGeo.rotateX(Math.PI / 2);

    const ringGeo = new THREE.TorusGeometry(0.14, 0.022, 8, 20);
    const flameGeo = new THREE.ConeGeometry(0.125, 0.85, 12);
    flameGeo.rotateX(Math.PI / 2);
    flameGeo.translate(0, 0, 0.42);

    for (const side of [-1, 1] as const) {
      const x = side * 0.24;
      const nozzle = new THREE.Mesh(nozzleGeo, this.armorMaterial);
      nozzle.position.set(x, 0.01, 1.24);
      this.shipRoot.add(nozzle);

      const ring = new THREE.Mesh(ringGeo, this.emissiveAccentMaterial);
      ring.position.set(x, 0.01, 1.38);
      this.engineRings.push(ring);
      this.shipRoot.add(ring);

      const flame = new THREE.Mesh(flameGeo, this.thrusterMaterial);
      flame.position.set(x, 0.01, 1.38);
      this.afterburnerCones.push(flame);
      this.shipRoot.add(flame);
    }
  }

  private buildShield(): THREE.Mesh {
    const shieldGeo = new THREE.IcosahedronGeometry(1.75, 2);
    const shield = new THREE.Mesh(shieldGeo, this.shieldMaterial);
    shield.scale.set(1.05, 0.58, 1.18);
    shield.visible = false;
    this.group.add(shield);
    return shield;
  }

  public applyTheme(theme: TunnelTheme): void {
    this.neonTrimMaterial.color.setHex(theme.playerColorHex);
    this.emissiveAccentMaterial.color.setHex(theme.playerColorHex);
    this.emissiveAccentMaterial.emissive.setHex(theme.playerColorHex);
    this.thrusterMaterial.color.setHex(theme.ringColorHex);
    this.shieldMaterial.color.setHex(theme.playerColorHex);
    this.canopyMaterial.emissive.setHex(theme.railColorHex);
  }

  public update(dt: number, steerInput: number, speedRatio: number): void {
    this.elapsedTime += dt;

    // Smooth banking roll
    const targetRoll = -THREE.MathUtils.clamp(steerInput, -1, 1) * 0.42;
    this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, targetRoll, Math.min(1, dt * 10));
    this.shipRoot.rotation.z = this.currentRoll;

    // Subtle hover bobbing
    this.shipRoot.position.y = Math.sin(this.elapsedTime * 4.2) * 0.045;

    // Afterburner flame flicker and speed-based scale
    const clampedSpeed = THREE.MathUtils.clamp(speedRatio, 0, 1.5);
    const flicker = 0.88 + Math.sin(this.elapsedTime * 55) * 0.08 + Math.cos(this.elapsedTime * 37) * 0.06;
    const flameLength = (0.75 + clampedSpeed * 0.95) * flicker;
    const flameRadius = 0.85 + clampedSpeed * 0.25;

    for (const cone of this.afterburnerCones) {
      cone.scale.set(flameRadius, flameRadius, flameLength);
    }

    const ringPulse = 1 + Math.sin(this.elapsedTime * 18) * 0.04;
    for (const ring of this.engineRings) {
      ring.scale.setScalar(ringPulse);
    }

    // Rotate active energy shield dome
    if (this.shieldMesh.visible) {
      this.shieldMesh.rotation.y += dt * 1.1;
      this.shieldMesh.rotation.x = Math.sin(this.elapsedTime * 1.5) * 0.12;
    }
  }

  public setShieldVisible(visible: boolean): void {
    this.shieldMesh.visible = visible;
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }
}
