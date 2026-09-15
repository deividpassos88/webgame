import * as THREE from 'three';
import {
  BOSS_SKILL_GEOMETRY,
  type BossSkillEvent,
} from '../entities/BossSkillController';

interface ActiveEffect {
  kind: 'warning' | 'impact';
  group: THREE.Group;
  age: number;
  duration: number;
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  impactLightIntensity?: number;
}

const WARNING_COLOR = 0xff1f16;
const IMPACT_DURATIONS: Readonly<Record<BossSkillEvent['skill'], number>> = {
  circle: 2.2,
  rectangle: 1.1,
  meteors: 1.3,
};

export class BossSkillEffects {
  private readonly active: ActiveEffect[] = [];
  // A luz permanece na cena, com intensidade zero quando não há impacto. Assim o
  // renderer não alterna a quantidade de PointLights e não recompila shaders na
  // primeira explosão de cada skill.
  private readonly impactLight = new THREE.PointLight(0xff4a10, 0, 40, 2);

  public constructor(private readonly scene: THREE.Scene) {
    this.impactLight.castShadow = false;
    this.scene.add(this.impactLight);
  }

  public get activeObjectCount(): number {
    return this.active.length;
  }

  public handle(event: BossSkillEvent): void {
    this.clear();
    if (event.type === 'telegraph') this.createTelegraph(event);
    else this.createImpact(event);
  }

  public update(delta: number): void {
    const elapsed = Math.max(0, delta);
    for (let index = this.active.length - 1; index >= 0; index--) {
      const effect = this.active[index];
      effect.age += elapsed;
      if (effect.kind === 'warning') {
        this.updateWarning(effect);
        continue;
      }
      const progress = THREE.MathUtils.clamp(effect.age / effect.duration, 0, 1);
      effect.group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && mesh.userData.fireBlast) {
          mesh.scale.setScalar(1 + progress * 3);
        }
        if (mesh.isMesh && mesh.userData.fireParticle) {
          mesh.position.y += elapsed * (0.8 + mesh.userData.riseSpeed);
        }
      });
      effect.materials.forEach((material) => {
        if ('opacity' in material) {
          (material as THREE.Material & { opacity: number }).opacity = 1 - progress;
        }
      });
      this.impactLight.intensity =
        (1 - progress) * (effect.impactLightIntensity ?? 0);
      if (effect.age >= effect.duration) this.disposeAt(index);
    }
  }

  public clear(): void {
    for (let index = this.active.length - 1; index >= 0; index--) {
      this.disposeAt(index);
    }
  }

  private createTelegraph(event: BossSkillEvent): void {
    const effect = this.createEffect('warning', event.secondsUntilImpact);
    const material = new THREE.MeshBasicMaterial({
      color: WARNING_COLOR,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    effect.materials.add(material);

    if (event.skill === 'circle') {
      this.addGroundCircle(effect, event.target, BOSS_SKILL_GEOMETRY.circleRadius, material);
    } else if (event.skill === 'meteors') {
      const coreGeometry = new THREE.SphereGeometry(0.38, 10, 8);
      const glowGeometry = new THREE.SphereGeometry(0.62, 10, 8);
      const coreMaterial = material.clone();
      coreMaterial.color.setHex(0xffc21a);
      coreMaterial.opacity = 1;
      const glowMaterial = material.clone();
      glowMaterial.color.setHex(0xff4b0a);
      glowMaterial.opacity = 0.52;
      effect.geometries.add(coreGeometry);
      effect.geometries.add(glowGeometry);
      effect.materials.add(coreMaterial);
      effect.materials.add(glowMaterial);
      event.meteorPoints.forEach((point) => {
        this.addGroundCircle(effect, point, BOSS_SKILL_GEOMETRY.meteorRadius, material);
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        core.name = 'boss-meteor-core';
        core.position.set(point.x, 11, point.z);
        core.userData.groundY = point.y + 0.25;
        core.castShadow = false;
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.name = 'boss-meteor-fireball';
        glow.castShadow = false;
        core.add(glow);
        effect.group.add(core);
      });
      const smokeGeometry = new THREE.BufferGeometry();
      smokeGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(new Float32Array(event.meteorPoints.length * 2 * 3), 3)
      );
      const smokeMaterial = new THREE.PointsMaterial({
        color: 0x5c4b48,
        size: 0.72,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const smoke = new THREE.Points(smokeGeometry, smokeMaterial);
      smoke.name = 'boss-meteor-smoke';
      smoke.userData.meteorPoints = event.meteorPoints.map((point) => point.clone());
      effect.geometries.add(smokeGeometry);
      effect.materials.add(smokeMaterial);
      effect.group.add(smoke);
    } else {
      this.addGroundRectangle(
        effect,
        event.origin,
        event.target,
        BOSS_SKILL_GEOMETRY.rectangleWidth,
        BOSS_SKILL_GEOMETRY.rectangleLength,
        material
      );
    }

    this.scene.add(effect.group);
    this.active.push(effect);
  }

  private createImpact(event: BossSkillEvent): void {
    const effect = this.createEffect('impact', IMPACT_DURATIONS[event.skill]);
    const points = this.impactPoints(event);
    const coreGeometry = new THREE.SphereGeometry(0.2, 8, 6);
    const blastGeometry = new THREE.CircleGeometry(0.55, 20);
    const fireMaterial = new THREE.MeshBasicMaterial({
      color: 0xff7a0a,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const blastMaterial = new THREE.MeshBasicMaterial({
      color: 0xff2512,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    effect.geometries.add(coreGeometry);
    effect.geometries.add(blastGeometry);
    effect.materials.add(fireMaterial);
    effect.materials.add(blastMaterial);

    points.forEach((point, pointIndex) => {
      const blast = new THREE.Mesh(blastGeometry, blastMaterial);
      blast.name = 'boss-fire-blast';
      blast.rotation.x = -Math.PI / 2;
      blast.position.set(point.x, point.y + 0.08, point.z);
      blast.castShadow = false;
      blast.userData.fireBlast = true;
      effect.group.add(blast);
      const particleCount = event.skill === 'circle' ? 2 : 3;
      for (let particleIndex = 0; particleIndex < particleCount; particleIndex++) {
        const angle = (particleIndex / particleCount) * Math.PI * 2 + pointIndex * 0.37;
        const particle = new THREE.Mesh(coreGeometry, fireMaterial);
        particle.position.set(
          point.x + Math.cos(angle) * 0.35,
          point.y + 0.2 + particleIndex * 0.08,
          point.z + Math.sin(angle) * 0.35
        );
        particle.scale.setScalar(1 + (particleIndex % 2) * 0.45);
        particle.userData.fireParticle = true;
        particle.userData.riseSpeed = (particleIndex % 3) * 0.35;
        particle.castShadow = false;
        effect.group.add(particle);
      }
    });
    effect.impactLightIntensity = event.skill === 'circle' ? 7 : 4;
    this.impactLight.distance = event.skill === 'circle' ? 40 : 14;
    this.impactLight.position.copy(event.target).add(new THREE.Vector3(0, 1.2, 0));
    this.impactLight.intensity = effect.impactLightIntensity;

    this.scene.add(effect.group);
    this.active.push(effect);
  }

  private updateWarning(effect: ActiveEffect): void {
    const pulse = 0.2 + (Math.sin(effect.age * 7) + 1) * 0.08;
    effect.materials.forEach((material) => {
      if (
        material instanceof THREE.MeshBasicMaterial &&
        material.color.getHex() === WARNING_COLOR
      ) {
        (material as THREE.Material & { opacity: number }).opacity = pulse;
      }
    });
    const meteorProgress = THREE.MathUtils.clamp(
      effect.age / Math.max(effect.duration, 1e-9),
      0,
      1
    );
    effect.group.traverse((object) => {
      if (object.name !== 'boss-meteor-core') return;
      object.position.y = THREE.MathUtils.lerp(11, object.userData.groundY, meteorProgress);
      object.rotation.x += 0.08;
      object.rotation.z += 0.12;
    });
    const smoke = effect.group.getObjectByName('boss-meteor-smoke') as THREE.Points | undefined;
    if (smoke) {
      const positions = smoke.geometry.getAttribute('position') as THREE.BufferAttribute;
      const points = smoke.userData.meteorPoints as THREE.Vector3[];
      points.forEach((point, index) => {
        const coreY = THREE.MathUtils.lerp(11, point.y + 0.25, meteorProgress);
        for (let trail = 0; trail < 2; trail++) {
          const offset = index * 2 + trail;
          const sway = Math.sin(effect.age * 6 + index * 0.73 + trail) * 0.18;
          positions.setXYZ(
            offset,
            point.x + sway,
            coreY + 0.75 + trail * 0.72,
            point.z - sway * 0.6
          );
        }
      });
      positions.needsUpdate = true;
    }
  }

  private addGroundCircle(
    effect: ActiveEffect,
    point: THREE.Vector3,
    radius: number,
    material: THREE.Material
  ): void {
    const geometry = new THREE.CircleGeometry(radius, 40);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(point.x, point.y + 0.05, point.z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    effect.geometries.add(geometry);
    effect.group.add(mesh);
  }

  private addGroundRectangle(
    effect: ActiveEffect,
    origin: THREE.Vector3,
    target: THREE.Vector3,
    width: number,
    length: number,
    material: THREE.Material
  ): void {
    const direction = new THREE.Vector3().subVectors(target, origin);
    direction.y = 0;
    if (direction.lengthSq() < 1e-9) direction.set(0, 0, 1);
    direction.normalize();
    const geometry = new THREE.PlaneGeometry(width, length);
    const group = new THREE.Group();
    group.position.copy(origin).addScaledVector(direction, length * 0.5);
    group.position.y += 0.05;
    group.rotation.y = Math.atan2(direction.x, direction.z);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    effect.geometries.add(geometry);
    effect.group.add(group);
  }

  private impactPoints(event: BossSkillEvent): THREE.Vector3[] {
    if (event.skill === 'meteors') return event.meteorPoints.map((point) => point.clone());
    if (event.skill === 'circle') {
      const points = [event.target.clone()];
      for (const [count, radiusScale] of [[8, 0.42], [12, 0.82]] as const) {
        for (let index = 0; index < count; index++) {
          const angle = (index / count) * Math.PI * 2;
          points.push(event.target.clone().add(new THREE.Vector3(
            Math.cos(angle) * BOSS_SKILL_GEOMETRY.circleRadius * radiusScale,
            0,
            Math.sin(angle) * BOSS_SKILL_GEOMETRY.circleRadius * radiusScale
          )));
        }
      }
      return points;
    }
    const direction = new THREE.Vector3().subVectors(event.target, event.origin);
    direction.y = 0;
    if (direction.lengthSq() < 1e-9) direction.set(0, 0, 1);
    direction.normalize();
    const lateral = new THREE.Vector3(-direction.z, 0, direction.x);
    const points: THREE.Vector3[] = [];
    for (let row = 0; row < 8; row++) {
      for (const side of [-0.38, 0, 0.38]) {
        points.push(event.origin.clone()
          .addScaledVector(direction, (row / 7) * BOSS_SKILL_GEOMETRY.rectangleLength)
          .addScaledVector(lateral, side * BOSS_SKILL_GEOMETRY.rectangleWidth));
      }
    }
    return points;
  }

  private createEffect(kind: ActiveEffect['kind'], duration: number): ActiveEffect {
    return {
      kind,
      group: new THREE.Group(),
      age: 0,
      duration,
      geometries: new Set(),
      materials: new Set(),
    };
  }

  private disposeAt(index: number): void {
    const [effect] = this.active.splice(index, 1);
    if (effect.kind === 'impact') this.impactLight.intensity = 0;
    effect.group.removeFromParent();
    effect.geometries.forEach((geometry) => geometry.dispose());
    effect.materials.forEach((material) => material.dispose());
  }

}
