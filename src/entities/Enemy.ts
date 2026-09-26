import * as THREE from 'three';
import type { RegularEnemyVisual } from '../waves/EnemyAssetStore';
import {
  ENEMY_ATTACK_DURATION,
  EnemyAnimationController,
} from './EnemyAnimationController';
import type { BossSkillKind } from './BossSkillController';
import { BOSS_FOLLOW_DISTANCE } from './BossCombatPolicy';
import type { EnemyAnimator } from './EnemyAnimator';
import type { VFXLightHandle, VFXLightPool } from '../vfx/VFXLightPool';
import {
  applyElementalStatus,
  getElementalSlowMultiplier,
  tickElementalStatus,
  type ElementalStatusState,
  type ElementalType,
} from '../combat/ElementalStatus';
import { MAGE_SHOCK_LIFT_METERS, MAGE_WATER_SLOW_MULTIPLIER } from '../combat/MageSkillImpact';
import {
  animatedModelGroundY,
  hasLyingBindPose,
} from '../waves/modelNormalizer';
const DEATH_BURN_DURATION = 0.65;
const DEATH_ASH_DURATION = 0.55;
const DEATH_TIME_EPSILON = 1e-9;
const FORMATION_STOP_DISTANCE = 0.18;
const FORMATION_START_DISTANCE = 0.45;
const REGULAR_PREFERRED_ATTACK_DISTANCE = 1.25;
const ARCHER_SHOT_RELEASE_PROGRESS = 0.82;
const ARCHER_CLOSE_DAMAGE_DISTANCE = 7;
const ARCHER_CLOSE_DAMAGE_BONUS = 0.45;
/** Each character hit shoves the body back and leaves it dizzy for this long. */
export const ENEMY_HIT_STAGGER_SECONDS = 0.3;
export const ENEMY_HIT_KNOCKBACK_METERS = 0.45;

/**
 * Shared soft-circle sprite for the freeze mist and smoke. Generated once from
 * raw bytes (no canvas/DOM), so frozen enemies also work in headless tests.
 */
let freezePuffTexture: THREE.Texture | null = null;

function getFreezePuffTexture(): THREE.Texture {
  if (freezePuffTexture) return freezePuffTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const alpha = THREE.MathUtils.clamp(1 - Math.sqrt(dx * dx + dy * dy) * 2, 0, 1);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  freezePuffTexture = texture;
  return texture;
}

export type EnemyDeathEffectStage = 'animation' | 'burn' | 'ash' | 'complete';

export interface EnemyOptions {
  position: THREE.Vector3;
  color?: number;
  scale?: number;
  hp?: number;
  damage?: number;
  detectionRange?: number;
  attackRange?: number;
  speed?: number;
  collisionRadius?: number;
  locomotionAnimationScale?: number;
  groundAnimatedModel?: boolean;
  /** A very small sink keeps animated footwear visually flush with the floor. */
  animatedGroundOffset?: number;
  isBoss?: boolean;
  /**
   * Temperamento: 'aggressive' persegue o player de longe e mais rápido,
   * 'passive' só reage quando o player chega perto.
   */
  temperament?: 'aggressive' | 'neutral' | 'passive';
  /** Drop ao morrer: recupera HP ou concede velocidade temporária ao player */
  dropOnDeath?: 'heal' | 'speed' | null;
  attackMode?: 'melee' | 'ranged';
  /**
   * Shared scene-level pool for the shock aura light. When provided, the aura
   * borrows a slot instead of adding its own light (which would recompile all
   * lit shaders). Without it, the aura keeps the historical per-enemy light.
   */
  shockLightPool?: VFXLightPool | null;
}

export interface EnemyRangedAttack {
  origin: THREE.Vector3;
  target: THREE.Vector3;
  damage: number;
  distance: number;
}

/** Buff ativo no jogador (dropado por inimigos) */
export interface ActiveBuff {
  kind: 'heal' | 'speed';
  /** Multiplicador de velocidade (speed) ou quantidade curada (heal) */
  amount: number;
  remaining: number;
}

export type EnemyAnimatorFactory = (
  model: THREE.Group,
  clips: readonly THREE.AnimationClip[]
) => EnemyAnimator;

/**
 * Inimigo placeholder (geometria procedural).
 * Quando os .glb dos inimigos/boss ficarem prontos, basta trocar
 * o método buildMesh() por um carregamento de GLTFLoader, mantendo
 * a mesma interface pública (update, takeDamage, etc).
 */
export class Enemy {
  public root = new THREE.Group();
  public hp: number;
  public maxHP: number;
  public damage: number;
  public detectionRange: number;
  public attackRange: number;
  public speed: number;
  public readonly collisionRadius: number;
  public isDead = false;
  public isBoss: boolean;
  public markedForRemoval = false;
  public deathEffectStage: EnemyDeathEffectStage = 'animation';
  public readonly temperament: 'aggressive' | 'neutral' | 'passive';
  public readonly dropOnDeath: 'heal' | 'speed' | null;
  public readonly attackMode: 'melee' | 'ranged';

  /** Indicador visual do drop (coroa dourada = heal, asa azul = speed) */
  private dropIcon: THREE.Mesh | null = null;

  /** Estado da patrulha aleatória */
  private patrolTarget: THREE.Vector3 | null = null;
  private patrolPause = 0;
  private patrolPhase: 'idle' | 'walking' = 'idle';

  private attackCooldown = 0;
  private attackCooldownTime = 1.4;
  private animator: EnemyAnimator | null = null;
  private activeAnimatedAttack: {
    elapsed: number;
    damageApplied: boolean;
  } | null = null;
  private animatedDeathDuration = 0;
  private hitFlashTime = 0;
  private readonly hitFlashBaseIntensities = new Map<
    THREE.MeshStandardMaterial,
    number
  >();
  private fadeMaterials: THREE.Material[] = [];
  private readonly ownedGeometries = new Set<THREE.BufferGeometry>();
  private deathTimer = 0;
  private readonly deathBasePosition = new THREE.Vector3();
  private readonly deathBaseScale = new THREE.Vector3(1, 1, 1);
  private readonly movementDirection = new THREE.Vector3();
  private deathBaseRotationZ = 0;
  private deathParticles: THREE.Points | null = null;
  private deathParticleMaterial: THREE.PointsMaterial | null = null;
  private deathParticleVelocities: Float32Array | null = null;
  private disposed = false;
  private meshGroup!: THREE.Group;
  private bossRing: THREE.Mesh | null = null;
  private idleBobOffset = Math.random() * Math.PI * 2;
  private bossMovementLocked = false;
  private formationPursuitActive = false;
  private elementalStatus: ElementalStatusState | null = null;
  private mageFreezeRemaining = 0;
  private mageSlowRemaining = 0;
  private mageLevitateRemaining = 0;
  private mageLevitateDuration = 0;
  private levitateElapsed = 0;
  private levitateGroundY = 0;
  private levitatePoseActive = false;
  private levitateUsesClip = false;
  private warriorKnockdownRemaining = 0;
  private warriorKnockdownUsesClip = false;
  private savedWarriorKnockdownRoll = 0;
  private savedMeshRoll = 0;
  private shockAura: THREE.Group | null = null;
  private readonly shockLightPool: VFXLightPool | null;
  private shockLightHandle: VFXLightHandle | null = null;
  private shockFallbackLight: THREE.PointLight | null = null;
  private freezeMist: THREE.Points | null = null;
  private freezeSmoke: THREE.Points | null = null;
  private freezeSmokeSpeeds: Float32Array | null = null;
  private readonly freezeTintOriginals = new Map<
    THREE.MeshStandardMaterial,
    { emissive: number; emissiveIntensity: number }
  >();
  private hitStaggerRemaining = 0;
  private hitReactionElapsed = 0;
  private hitUsesClip = false;
  private dizzyActive = false;
  private savedDizzyRoll = 0;
  private readonly groundAnimatedModel: boolean;
  private readonly animatedGroundOffset: number;
  private animatedModel: THREE.Group | null = null;

  constructor(
    options: EnemyOptions,
    visual?: RegularEnemyVisual,
    createAnimator?: EnemyAnimatorFactory
  ) {
    this.hp = options.hp ?? 60;
    this.maxHP = this.hp;
    this.damage = options.damage ?? 8;
    this.detectionRange = options.detectionRange ?? 8;
    this.attackRange = options.attackRange ?? 1.5;
    this.speed = options.speed ?? 2.2;
    this.isBoss = options.isBoss ?? false;
    this.temperament = options.temperament ?? 'neutral';
    this.dropOnDeath = options.dropOnDeath ?? null;
    this.attackMode = options.attackMode ?? 'melee';
    this.groundAnimatedModel = options.groundAnimatedModel ?? false;
    this.animatedGroundOffset = options.animatedGroundOffset ?? 0;
    this.shockLightPool = options.shockLightPool ?? null;

    // temperamento ajusta detecção/velocidade
    if (this.temperament === 'aggressive') {
      this.detectionRange *= 1.6;
      this.speed *= 1.35;
    } else if (this.temperament === 'passive') {
      this.detectionRange *= 0.55;
      this.speed *= 0.8;
    }

    const bodyScale = options.scale ?? 1;
    this.collisionRadius = options.collisionRadius ?? 0.4 * bodyScale;
    this.root.position.copy(options.position);
    this.root.userData.isEnemyRoot = true;
    this.root.userData.enemyBodyScale = bodyScale;
    if (visual) {
      this.buildAnimatedMesh(visual.model, bodyScale, visual.animations);
      const animatorFactory = createAnimator ?? ((model, clips) =>
        new EnemyAnimationController(
          model,
          clips,
          options.locomotionAnimationScale ?? 1
        ));
      this.animator = animatorFactory(visual.model, visual.animations);
    } else {
      this.buildMesh(options.color ?? 0x8a1010, bodyScale);
    }
    const fadeMaterials = new Set<THREE.Material>();
    this.meshGroup.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => fadeMaterials.add(material));
    });
    this.fadeMaterials = [...fadeMaterials];
    this.captureHitFlashBaseIntensities(this.fadeMaterials);
    if (this.dropOnDeath) this.buildDropIcon();
  }

  public get animationState(): string | null {
    return this.animator?.state ?? null;
  }

  public get activeAnimationClip(): string | null {
    return this.animator?.activeClipName ?? null;
  }

  public playSkillAnimation(
    skill: BossSkillKind,
    secondsUntilImpact: number
  ): boolean {
    return this.animator?.scheduleSkill?.(skill, secondsUntilImpact) ?? false;
  }

  public playApproachJump(): number {
    return this.animator?.playApproachJump?.() ?? 0;
  }

  public setBossMovementLocked(locked: boolean): void {
    this.bossMovementLocked = locked;
  }

  /** Ícone flutuante sobre o inimigo mostrando o que ele dropa */
  private buildDropIcon() {
    const isHeal = this.dropOnDeath === 'heal';
    const geo = this.ownGeometry(new THREE.OctahedronGeometry(0.22));
    const mat = new THREE.MeshStandardMaterial({
      color: isHeal ? 0xff4466 : 0x44aaff,
      emissive: isHeal ? 0xaa1133 : 0x1166cc,
      emissiveIntensity: 1.2,
    });
    const icon = new THREE.Mesh(geo, mat);
    icon.position.y = 2.5;
    this.meshGroup.add(icon);
    this.dropIcon = icon;
    this.fadeMaterials.push(mat);
    this.captureHitFlashBaseIntensity(mat);
  }

  private buildMesh(color: number, scale: number) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      metalness: 0.2,
      emissive: new THREE.Color(color).multiplyScalar(0.15),
    });
    // corpo (cápsula)
    const bodyGeo = this.ownGeometry(
      new THREE.CapsuleGeometry(0.4 * scale, 0.9 * scale, 4, 8)
    );
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9 * scale;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // cabeça
    const headGeo = this.ownGeometry(new THREE.SphereGeometry(0.32 * scale, 8, 8));
    const headMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.8),
      roughness: 0.5,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.65 * scale;
    head.castShadow = true;
    group.add(head);

    // chifres
    const hornGeo = this.ownGeometry(new THREE.ConeGeometry(0.06 * scale, 0.3 * scale, 6));
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(hornGeo, hornMat);
      horn.position.set(0.18 * scale * side, 1.95 * scale, 0);
      horn.rotation.z = side * 0.3;
      group.add(horn);
    }

    // olhos brilhantes
    const eyeGeo = this.ownGeometry(new THREE.SphereGeometry(0.05 * scale, 6, 6));
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      emissive: 0xffaa00,
      emissiveIntensity: 2,
    });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(0.13 * scale * side, 1.68 * scale, 0.27 * scale);
      group.add(eye);
    }

    // O anel mantém a leitura do boss; a iluminação vem do GameLightingRig,
    // que já existe desde o início da cena e não altera o número de luzes.
    if (this.isBoss) {
      const ringGeo = this.ownGeometry(
        new THREE.RingGeometry(1.2 * scale, 1.4 * scale, 32)
      );
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff2200,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      group.add(ring);
      this.bossRing = ring;
    }

    this.root.add(group);
    this.meshGroup = group;
  }

  /**
   * Modelos exportados pelo Tripo (archer/guardião) têm bind pose "deitada":
   * o rig ancestral carrega uma rotação residual X90, e as animações mixamo
   * embutidas assumem esse espaço rotacionado (com a rotação mantida, o
   * personagem anima em pé). Nesses casos a Box3 da bind pose não representa a
   * altura real do personagem em pé, então aplicamos a pose do primeiro frame
   * do clip de idle com um mixer temporário antes de medir/normalizar.
   */
  private applyIdleFirstFramePose(
    model: THREE.Group,
    clips: readonly THREE.AnimationClip[]
  ): void {
    if (!hasLyingBindPose(model)) return;
    const idleClip =
      clips.find((clip) => clip.name === 'idle') ??
      clips.find((clip) => clip.name === 'mixamo.com') ??
      clips.find((clip) => clip.name === 'Character_output.fbx');
    if (!idleClip) return;
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(idleClip);
    action.play();
    // fadeIn(0) + update(0) aplicam o keyframe 0 com peso 1 imediatamente.
    mixer.update(0);
    mixer.stopAllAction();
    mixer.uncacheClip(idleClip);
    model.updateMatrixWorld(true);
  }

  private buildAnimatedMesh(
    model: THREE.Group,
    bodyScale: number,
    clips: readonly THREE.AnimationClip[] = []
  ): void {
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const sourceMaterials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const clonedMaterials = sourceMaterials.map((material) => {
        const clone = material.clone();
        if (
          clone instanceof THREE.MeshStandardMaterial &&
          clone.emissiveMap &&
          clone.emissive.r >= 0.99 &&
          clone.emissive.g >= 0.99 &&
          clone.emissive.b >= 0.99 &&
          clone.emissiveIntensity >= 0.99
        ) {
          clone.emissiveIntensity = 0;
        }
        return clone;
      });
      mesh.material = Array.isArray(mesh.material)
        ? clonedMaterials
        : clonedMaterials[0];
    });

    this.applyIdleFirstFramePose(model, clips);

    // Em three r161, Box3.setFromObject usa `object.boundingBox` em cache para
    // SkinnedMesh (calculado na bind pose) e nunca reflete a pose animada. Para
    // modelos com bind pose deitada medimos pela posição mundial dos bones,
    // que sempre acompanha a pose aplicada (idle no primeiro frame acima).
    model.updateMatrixWorld(true);
    const groundY = animatedModelGroundY(model);
    const bounds = new THREE.Box3().setFromObject(model);
    const bonesHeight = groundY !== null ? this.animatedModelBoneHeight(model, groundY) : 0;
    // Usa a maior altura confiável: bones (pose real) vs Box3. Para bind poses
    // em pé (monstro_normal), Box3 e bones concordam; para deitadas, bones dão
    // a altura real do personagem em pé e Box3 dá a "profundidade" deitada.
    const boxHeight = bounds.isEmpty() ? 0 : bounds.max.y - bounds.min.y;
    const initialHeight = Math.max(boxHeight, bonesHeight);
    if (initialHeight > 0) {
      model.scale.multiplyScalar((2.1 * bodyScale) / initialHeight);
      model.updateMatrixWorld(true);
      // Reancora usando a referência de chão dos bones (pose real) quando
      // disponível; senão usa a Box3 (comportamento histórico do normal).
      const groundedGroundY = animatedModelGroundY(model);
      const groundedBounds = new THREE.Box3().setFromObject(model);
      const groundedMinY = groundedGroundY ?? (groundedBounds.isEmpty() ? 0 : groundedBounds.min.y);
      model.position.y += this.animatedGroundOffset - groundedMinY;
    }

    const group = new THREE.Group();
    group.add(model);
    this.root.add(group);
    this.meshGroup = group;
    this.animatedModel = model;
  }

  private animatedModelBoneHeight(
    model: THREE.Group,
    groundY: number
  ): number {
    let maxY = -Infinity;
    const worldPosition = new THREE.Vector3();
    model.traverse((object) => {
      const skinnedMesh = object as THREE.SkinnedMesh;
      if (!skinnedMesh.isSkinnedMesh || !skinnedMesh.skeleton) return;
      for (const bone of skinnedMesh.skeleton.bones) {
        if (!bone.parent) continue;
        bone.getWorldPosition(worldPosition);
        maxY = Math.max(maxY, worldPosition.y);
      }
    });
    return Number.isFinite(maxY) ? maxY - groundY : 0;
  }

  private keepAnimatedModelGrounded(): void {
    if (!this.groundAnimatedModel || !this.animatedModel) return;
    this.animatedModel.updateMatrixWorld(true);
    const groundY = animatedModelGroundY(this.animatedModel);
    if (groundY === null) {
      const bounds = new THREE.Box3().setFromObject(this.animatedModel);
      if (!Number.isFinite(bounds.min.y)) return;
      this.animatedModel.position.y += this.root.position.y + this.animatedGroundOffset - bounds.min.y;
      return;
    }
    this.animatedModel.position.y += this.root.position.y + this.animatedGroundOffset - groundY;
  }

  public update(
    delta: number,
    playerPos: THREE.Vector3,
    onAttackPlayer: (dmg: number, distance: number) => void,
    surroundPosition?: THREE.Vector3,
    onElementalDamage?: (damage: number) => void,
    onRangedAttack?: (attack: EnemyRangedAttack) => void
  ) {
    this.animator?.update(delta);
    if (this.mageLevitateRemaining <= 0) this.keepAnimatedModelGrounded();
    if (!this.isDead && this.elementalStatus) {
      const tick = tickElementalStatus(this.elementalStatus, delta);
      this.elementalStatus = tick.status;
      if (tick.damage > 0) {
        this.takeDamage(tick.damage);
        onElementalDamage?.(tick.damage);
      }
    }
    if (this.isDead) {
      this.clearMageControlForDeath();
      this.updateDeath(delta);
      return;
    }

    this.tickMageControl(delta);
    this.tickHitStagger(delta);
    this.tickWarriorKnockdown(delta);
    if (this.warriorKnockdownRemaining > 0) {
      this.activeAnimatedAttack = null;
      return;
    }
    if (this.mageLevitateRemaining > 0) {
      this.activeAnimatedAttack = null;
      return;
    }

    if (this.hitFlashTime > 0) {
      this.hitFlashTime = Math.max(0, this.hitFlashTime - Math.max(0, delta));
      const flashBonus = this.hitFlashTime > 0 ? 2 : 0;
      this.hitFlashBaseIntensities.forEach((baseIntensity, material) => {
        material.emissiveIntensity = baseIntensity + flashBonus;
      });
    }

    this.updateFreezeVisuals(delta);
    if (this.isFrozenByIce) {
      this.activeAnimatedAttack = null;
      this.animator?.play('idle');
      return;
    }

    if (this.hitStaggerRemaining > 0) {
      this.activeAnimatedAttack = null;
      this.updateDizzyPose();
      return;
    }

    if (this.attackCooldown > 0) this.attackCooldown -= delta;

    const dist = this.root.position.distanceTo(playerPos);

    // idle bob apenas para os placeholders procedurais
    if (!this.animator) {
      this.meshGroup.position.y = Math.sin(performance.now() * 0.003 + this.idleBobOffset) * 0.05;
    }

    if (this.bossRing) {
      this.bossRing.rotation.z += delta * 0.3;
    }

    // ícone de drop gira e flutua
    if (this.dropIcon) {
      this.dropIcon.rotation.y += delta * 2.5;
      this.dropIcon.position.y = 2.5 + Math.sin(performance.now() * 0.004) * 0.12;
    }

    if (this.animator && this.activeAnimatedAttack) {
      if (dist > this.attackRange) {
        this.activeAnimatedAttack = null;
        this.animator.play('running');
      } else {
        this.faceAnimatedModel(playerPos);
        this.activeAnimatedAttack.elapsed += Math.max(0, delta);
        if (
          !this.activeAnimatedAttack.damageApplied &&
          this.activeAnimatedAttack.elapsed >= ENEMY_ATTACK_DURATION * (
            this.attackMode === 'ranged' ? ARCHER_SHOT_RELEASE_PROGRESS : 0.55
          )
        ) {
          this.activeAnimatedAttack.damageApplied = true;
          if (this.attackMode === 'ranged') {
            const damage = this.getArcherDamage(dist);
            const attack: EnemyRangedAttack = {
              origin: this.root.position.clone().add(new THREE.Vector3(0, 1.15, 0)),
              target: playerPos.clone().add(new THREE.Vector3(0, 1.05, 0)),
              damage,
              distance: dist,
            };
            if (onRangedAttack) onRangedAttack(attack);
            else onAttackPlayer(damage, dist);
          } else {
            onAttackPlayer(this.damage, dist);
          }
        }
        if (this.activeAnimatedAttack.elapsed < ENEMY_ATTACK_DURATION) return;
        this.activeAnimatedAttack = null;
      }
    }

    if (this.isBoss && dist > this.attackRange) {
      this.faceAnimatedModel(playerPos);
      if (!this.bossMovementLocked && dist > BOSS_FOLLOW_DISTANCE) {
        const direction = this.movementDirection.subVectors(
          playerPos,
          this.root.position
        );
        direction.y = 0;
        const remaining = Math.max(
          0,
          direction.length() - BOSS_FOLLOW_DISTANCE
        );
        if (remaining > 0) {
          direction.normalize();
          this.root.position.addScaledVector(
            direction,
            Math.min(remaining, this.speed * this.elementalSpeedMultiplier * Math.max(0, delta))
          );
          this.animator?.play('walking');
          this.meshGroup.rotation.y = Math.atan2(direction.x, direction.z);
          return;
        }
      }
      this.animator?.play('idle');
      return;
    }

    if (dist > this.detectionRange) {
      // Todos: fora de alcance de detecção. Primeiro vão ao centro,
      // depois patrulham aleatoriamente procurando o personagem.
      const centerDist = this.root.position.distanceTo(new THREE.Vector3(0, this.root.position.y, 0));
      if (centerDist > 1.5 && !this.patrolTarget) {
        this.animator?.play('walking');
        this.patrolToCenter(delta, this.temperament === 'passive' ? 0.45 : 0.8);
      } else if (!this.patrolTarget && centerDist <= 1.5) {
        this.animator?.play('idle');
        this.startRandomPatrol();
      } else if (this.patrolTarget) {
        this.animator?.play('walking');
        this.updatePatrol(delta);
      }
      return;
    }

    if (this.attackMode === 'ranged') {
      this.updateRangedCombat(delta, playerPos, dist, onAttackPlayer, onRangedAttack);
      return;
    }

    // Monstros normais primeiro fecham a distância de combate. Isso evita que
    // ataquem da borda do alcance configurado; bosses preservam a própria IA.
    const preferredAttackDistance = this.isBoss
      ? this.attackRange
      : Math.min(this.attackRange, REGULAR_PREFERRED_ATTACK_DISTANCE);
    if (dist <= preferredAttackDistance) {
      const dir = new THREE.Vector3().subVectors(playerPos, this.root.position);
      dir.y = 0;
      if (dir.lengthSq() > 0.0001) {
        this.meshGroup.rotation.y = Math.atan2(dir.x, dir.z);
      }
      if (this.attackCooldown <= 0) {
        this.attackCooldown = this.attackCooldownTime;
        if (this.animator?.playNextAttack()) {
          this.activeAnimatedAttack = { elapsed: 0, damageApplied: false };
        } else {
          onAttackPlayer(this.damage, dist);
          this.playLungeAnimation();
        }
      } else if (!this.activeAnimatedAttack) {
        this.animator?.play('idle');
      }
      return;
    }

    // Monstros comuns pressionam o jogador antes de ocupar uma vaga de formação.
    // Assim, a ameaça vem de perto e o cálculo de dano por distância continua
    // relevante; bosses mantêm a própria lógica especial acima.
    if (!this.isBoss) {
      this.formationPursuitActive = false;
      this.activeAnimatedAttack = null;
      this.animator?.play('running');
      const directionToPlayer = this.movementDirection.subVectors(playerPos, this.root.position);
      directionToPlayer.y = 0;
      if (directionToPlayer.lengthSq() > 1e-9) {
        directionToPlayer.normalize();
        this.root.position.addScaledVector(
          directionToPlayer,
          this.speed * this.elementalSpeedMultiplier * Math.max(0, delta)
        );
        this.meshGroup.rotation.y = Math.atan2(directionToPlayer.x, directionToPlayer.z);
      }
      return;
    }

    if (surroundPosition) {
      const formationDirection = this.movementDirection.subVectors(
        surroundPosition,
        this.root.position
      );
      formationDirection.y = 0;
      const formationDistance = formationDirection.length();
      if (this.formationPursuitActive) {
        if (formationDistance <= FORMATION_STOP_DISTANCE) {
          this.formationPursuitActive = false;
        }
      } else if (formationDistance >= FORMATION_START_DISTANCE) {
        this.formationPursuitActive = true;
      }
      if (this.formationPursuitActive && formationDistance > 1e-9) {
        this.activeAnimatedAttack = null;
        this.animator?.play('running');
        formationDirection.normalize();
        this.root.position.addScaledVector(
          formationDirection,
          Math.min(formationDistance, this.speed * this.elementalSpeedMultiplier * Math.max(0, delta))
        );
        this.meshGroup.rotation.y = Math.atan2(
          formationDirection.x,
          formationDirection.z
        );
        return;
      }
      if (dist > this.attackRange) {
        this.animator?.play('idle');
        this.faceAnimatedModel(playerPos);
        return;
      }
    }

    this.formationPursuitActive = false;

    if (dist <= this.detectionRange) {
      this.activeAnimatedAttack = null;
      this.animator?.play('running');
      const dir = new THREE.Vector3().subVectors(playerPos, this.root.position);
      dir.y = 0;
      dir.normalize();
      this.root.position.addScaledVector(dir, this.speed * this.elementalSpeedMultiplier * delta);
      this.meshGroup.rotation.y = Math.atan2(dir.x, dir.z);
    }
  }

  private updateRangedCombat(
    delta: number,
    playerPos: THREE.Vector3,
    distance: number,
    onAttackPlayer: (dmg: number, distance: number) => void,
    onRangedAttack?: (attack: EnemyRangedAttack) => void
  ): void {
    this.formationPursuitActive = false;
    if (distance <= this.attackRange) {
      this.faceAnimatedModel(playerPos);
      if (this.attackCooldown <= 0) {
        this.attackCooldown = this.attackCooldownTime + 0.35;
        if (this.animator?.playNextAttack()) {
          this.activeAnimatedAttack = { elapsed: 0, damageApplied: false };
          return;
        }
        const damage = this.getArcherDamage(distance);
        const attack: EnemyRangedAttack = {
          origin: this.root.position.clone().add(new THREE.Vector3(0, 1.15, 0)),
          target: playerPos.clone().add(new THREE.Vector3(0, 1.05, 0)),
          damage,
          distance,
        };
        if (onRangedAttack) onRangedAttack(attack);
        else onAttackPlayer(damage, distance);
      } else {
        this.animator?.play('idle');
      }
      return;
    }

    this.animator?.play('running');
    const direction = this.movementDirection.subVectors(playerPos, this.root.position);
    direction.y = 0;
    const remaining = Math.max(0, direction.length() - this.attackRange);
    if (remaining <= 0 || direction.lengthSq() <= 1e-9) return;
    direction.normalize();
    this.root.position.addScaledVector(
      direction,
      Math.min(remaining, this.speed * this.elementalSpeedMultiplier * Math.max(0, delta))
    );
    this.meshGroup.rotation.y = Math.atan2(direction.x, direction.z);
  }

  private getArcherDamage(distance: number): number {
    const proximity = THREE.MathUtils.clamp(
      1 - distance / ARCHER_CLOSE_DAMAGE_DISTANCE,
      0,
      1
    );
    return this.damage * (1 + proximity * ARCHER_CLOSE_DAMAGE_BONUS);
  }

  private faceAnimatedModel(point: THREE.Vector3): void {
    const direction = new THREE.Vector3().subVectors(point, this.root.position);
    direction.y = 0;
    if (direction.lengthSq() > 0.0001) {
      this.meshGroup.rotation.y = Math.atan2(direction.x, direction.z);
    }
  }

  private playLungeAnimation() {
    const original = this.meshGroup.position.z;
    const startTime = performance.now();
    const duration = 200;
    const animate = () => {
      const t = (performance.now() - startTime) / duration;
      if (t >= 1) {
        this.meshGroup.position.z = original;
        return;
      }
      this.meshGroup.position.z = original + Math.sin(t * Math.PI) * 0.15;
      requestAnimationFrame(animate);
    };
    animate();
  }

  /**
   * Todos os monstros caminham para o centro do cenário procurando o player.
   * Chegando lá, iniciam uma patrulha aleatória pelo cenário.
   * speedFactor: agressivos 0.8 (quase velocidade total), passivos 0.45.
   */
  private patrolToCenter(delta: number, speedFactor = 0.8): void {
    const center = new THREE.Vector3(0, this.root.position.y, 0);
    const dist = this.root.position.distanceTo(center);
    if (dist > 1.5) {
      const dir = new THREE.Vector3().subVectors(center, this.root.position);
      dir.y = 0;
      dir.normalize();
      this.root.position.addScaledVector(dir, this.speed * this.elementalSpeedMultiplier * speedFactor * delta);
      this.meshGroup.rotation.y = Math.atan2(dir.x, dir.z);
    } else {
      // chegou ao centro: inicia patrulha aleatória
      this.startRandomPatrol();
    }
  }

  /** Patrulha aleatória: escolhe pontos aleatórios do cenário e caminha até eles */
  private startRandomPatrol(): void {
    const half = 20;
    const x = THREE.MathUtils.randFloat(-half, half);
    const z = THREE.MathUtils.randFloat(-half, half);
    this.patrolTarget = new THREE.Vector3(x, this.root.position.y, z);
    this.patrolPhase = 'walking';
  }

  private updatePatrol(delta: number): void {
    if (!this.patrolTarget) return;
    const dist = this.root.position.distanceTo(this.patrolTarget);
    if (dist < 1) {
      // chegou: pequena pausa e escolhe outro ponto
      this.patrolPause -= delta;
      if (this.patrolPause <= 0) {
        this.startRandomPatrol();
        this.patrolPause = THREE.MathUtils.randFloat(1, 3);
      }
      return;
    }
    const dir = new THREE.Vector3().subVectors(this.patrolTarget, this.root.position);
    dir.y = 0;
    dir.normalize();
    this.root.position.addScaledVector(dir, this.speed * this.elementalSpeedMultiplier * 0.55 * delta);
    this.meshGroup.rotation.y = Math.atan2(dir.x, dir.z);
  }

  /**
   * Mage ice. Full lock for the requested window only — warrior ice stays on
   * the three-second elemental status.
   */
  public applyMageFreeze(seconds: number): void {
    if (this.isDead) return;
    const duration = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    if (duration <= 0) return;
    this.mageFreezeRemaining = Math.max(this.mageFreezeRemaining, duration);
    this.activeAnimatedAttack = null;
    this.ensureFreezeVisuals();
  }

  /** Mage water. The monster keeps moving and attacking, but slowly. */
  public applyMageSlow(seconds: number): void {
    if (this.isDead) return;
    const duration = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    if (duration <= 0) return;
    this.mageSlowRemaining = Math.max(this.mageSlowRemaining, duration);
  }

  /**
   * Mage shock. Lifts the body, holds a lying pose, and wraps it in lightning
   * until the timer ends. Movement and attacks are locked for the whole lift.
   */
  public applyMageShockLevitate(seconds: number): void {
    if (this.isDead) return;
    const duration = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    if (duration <= 0) return;
    if (this.mageLevitateRemaining <= 0) {
      this.levitateGroundY = this.root.position.y;
      this.levitateElapsed = 0;
      this.mageLevitateDuration = duration;
      this.beginLevitatePose();
    } else {
      this.mageLevitateDuration = Math.max(this.mageLevitateDuration, this.levitateElapsed + duration);
    }
    this.mageLevitateRemaining = Math.max(this.mageLevitateRemaining, duration);
    this.activeAnimatedAttack = null;
    this.ensureShockAura();
  }

  /** The Warrior jump landing keeps every nearby monster knocked down. */
  public applyWarriorKnockdown(seconds = 1.2): void {
    if (this.isDead) return;
    const duration = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    if (duration <= 0) return;
    if (this.warriorKnockdownRemaining <= 0) {
      this.warriorKnockdownUsesClip = this.animator?.holdLyingPose?.() ?? false;
      if (!this.warriorKnockdownUsesClip) {
        this.savedWarriorKnockdownRoll = this.meshGroup.rotation.z;
        this.meshGroup.rotation.order = 'YXZ';
        this.meshGroup.rotation.z = Math.PI / 2;
      }
    }
    this.warriorKnockdownRemaining = Math.max(this.warriorKnockdownRemaining, duration);
    this.activeAnimatedAttack = null;
    this.hitStaggerRemaining = 0;
    this.endHitReaction();
  }

  public get isWarriorKnockedDown(): boolean {
    return this.warriorKnockdownRemaining > 0;
  }

  public get resistsDisplacement(): boolean {
    return this.mageLevitateRemaining > 0
      || this.warriorKnockdownRemaining > 0
      || this.isFrozenByIce
      || this.hitStaggerRemaining > 0;
  }

  /** Body roll used when the model has no authored lying clip. */
  public get shockBodyRoll(): number {
    return this.meshGroup.rotation.z;
  }

  private tickMageControl(delta: number): void {
    const step = Math.max(0, delta);
    if (this.mageFreezeRemaining > 0) {
      this.mageFreezeRemaining = Math.max(0, this.mageFreezeRemaining - step);
    }
    if (this.mageSlowRemaining > 0) {
      this.mageSlowRemaining = Math.max(0, this.mageSlowRemaining - step);
    }
    if (this.mageLevitateRemaining <= 0) return;
    this.levitateElapsed += step;
    this.mageLevitateRemaining = Math.max(0, this.mageLevitateRemaining - step);
    const height = this.levitateHeight(this.levitateElapsed, this.mageLevitateDuration);
    this.root.position.y = this.levitateGroundY + height;
    this.updateShockAura();
    if (this.mageLevitateRemaining <= 0) this.endLevitatePose();
  }

  private tickWarriorKnockdown(delta: number): void {
    if (this.warriorKnockdownRemaining <= 0) return;
    this.warriorKnockdownRemaining = Math.max(
      0,
      this.warriorKnockdownRemaining - Math.max(0, delta)
    );
    if (this.warriorKnockdownRemaining > 0) return;
    if (this.warriorKnockdownUsesClip) {
      this.animator?.releaseLyingPose?.();
    } else {
      this.meshGroup.rotation.z = this.savedWarriorKnockdownRoll;
    }
    this.warriorKnockdownUsesClip = false;
  }

  private levitateHeight(elapsed: number, duration: number): number {
    const peak = MAGE_SHOCK_LIFT_METERS;
    const rise = 0.22;
    const fall = 0.2;
    const safeDuration = Math.max(fall + rise, duration);
    if (elapsed <= rise) return peak * THREE.MathUtils.smoothstep(elapsed, 0, rise);
    if (elapsed >= safeDuration - fall) {
      return peak * (1 - THREE.MathUtils.smoothstep(elapsed, safeDuration - fall, safeDuration));
    }
    return peak;
  }

  private beginLevitatePose(): void {
    this.levitatePoseActive = true;
    this.levitateUsesClip = this.animator?.holdLyingPose?.() ?? false;
    if (this.levitateUsesClip) return;
    this.savedMeshRoll = this.meshGroup.rotation.z;
    this.meshGroup.rotation.order = 'YXZ';
    this.meshGroup.rotation.z = Math.PI / 2;
  }

  private endLevitatePose(): void {
    if (!this.levitatePoseActive && this.mageLevitateRemaining <= 0 && !this.shockAura?.visible) {
      this.hideShockAura();
      return;
    }
    if (this.levitateUsesClip) this.animator?.releaseLyingPose?.();
    else if (this.levitatePoseActive) this.meshGroup.rotation.z = this.savedMeshRoll;
    this.levitateUsesClip = false;
    this.levitatePoseActive = false;
    this.root.position.y = this.levitateGroundY;
    this.hideShockAura();
  }

  private clearMageControlForDeath(): void {
    this.mageFreezeRemaining = 0;
    this.mageSlowRemaining = 0;
    this.mageLevitateRemaining = 0;
    const wasWarriorKnockedDown = this.warriorKnockdownRemaining > 0;
    this.warriorKnockdownRemaining = 0;
    if (this.warriorKnockdownUsesClip) this.animator?.releaseLyingPose?.();
    else if (wasWarriorKnockedDown) this.meshGroup.rotation.z = this.savedWarriorKnockdownRoll;
    this.warriorKnockdownUsesClip = false;
    this.hideFreezeVisuals();
    if (this.levitatePoseActive) this.endLevitatePose();
    else this.hideShockAura();
  }

  private ensureShockAura(): void {
    if (this.shockAura) {
      this.shockAura.visible = true;
      this.acquireShockLight();
      return;
    }
    const bodyScale = Number(this.root.userData.enemyBodyScale) || 1;
    const group = new THREE.Group();
    group.name = 'EnemyShockAura';
    for (let index = 0; index < 6; index += 1) {
      const geometry = this.ownGeometry(new THREE.BufferGeometry());
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
      const material = new THREE.LineBasicMaterial({
        color: index % 2 === 0 ? 0xf7fbff : 0x7ec8ff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const line = new THREE.Line(geometry, material);
      line.name = 'EnemyShockBolt';
      line.frustumCulled = false;
      group.add(line);
      this.fadeMaterials.push(material);
    }
    this.root.add(group);
    this.shockAura = group;
    this.acquireShockLight();
  }

  /**
   * The aura light is borrowed from the shared pool so shocking a monster
   * never changes the scene light count (which would recompile every lit
   * shader mid-fight). Without a pool it falls back to the historical
   * per-enemy light; with an exhausted pool the aura renders unlit.
   */
  private acquireShockLight(): void {
    if (this.shockLightHandle || !this.shockAura) return;
    const bodyScale = Number(this.root.userData.enemyBodyScale) || 1;
    const handle = this.shockLightPool?.acquire() ?? null;
    if (handle) {
      handle.light.color.set(0xb7e6ff);
      handle.light.distance = 3.4 * bodyScale;
      handle.light.intensity = 1.7;
      this.shockLightHandle = handle;
      this.positionShockLight();
      return;
    }
    if (!this.shockLightPool && !this.shockFallbackLight) {
      const light = new THREE.PointLight(0xb7e6ff, 1.7, 3.4 * bodyScale, 2);
      light.position.y = 0.9 * bodyScale;
      light.castShadow = false;
      this.shockAura.add(light);
      this.shockFallbackLight = light;
    }
  }

  private positionShockLight(): void {
    if (!this.shockLightHandle) return;
    const bodyScale = Number(this.root.userData.enemyBodyScale) || 1;
    this.shockLightHandle.light.position.set(
      this.root.position.x,
      this.root.position.y + 0.9 * bodyScale,
      this.root.position.z
    );
  }

  private releaseShockLight(): void {
    this.shockLightHandle?.release();
    this.shockLightHandle = null;
  }

  private updateShockAura(): void {
    if (!this.shockAura) return;
    this.shockAura.visible = true;
    this.positionShockLight();
    const bodyScale = Number(this.root.userData.enemyBodyScale) || 1;
    const time = performance.now() * 0.018;
    let lineIndex = 0;
    this.shockAura.traverse((object) => {
      const line = object as THREE.Line;
      if (!line.isLine) return;
      const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      const angle = lineIndex * 1.05 + time;
      const radius = (0.42 + (lineIndex % 3) * 0.14) * bodyScale;
      const height = (0.35 + (lineIndex % 4) * 0.28) * bodyScale;
      positions.setXYZ(0, Math.cos(angle) * radius, 0.12 * bodyScale, Math.sin(angle) * radius);
      positions.setXYZ(
        1,
        Math.cos(angle + 0.45) * (radius + 0.18 * bodyScale),
        height,
        Math.sin(angle + 0.7) * (radius + 0.18 * bodyScale)
      );
      positions.setXYZ(
        2,
        Math.cos(angle + 1.15) * radius * 0.72,
        height + 0.5 * bodyScale,
        Math.sin(angle + 0.25) * radius * 0.72
      );
      positions.setXYZ(
        3,
        Math.cos(angle + 1.8) * (radius + 0.06),
        0.18 * bodyScale,
        Math.sin(angle + 1.35) * (radius + 0.06)
      );
      positions.needsUpdate = true;
      const material = line.material as THREE.LineBasicMaterial;
      material.opacity = 0.5 + Math.abs(Math.sin(time * 3 + lineIndex)) * 0.45;
      lineIndex += 1;
    });
  }

  private hideShockAura(): void {
    if (!this.shockAura) return;
    this.shockAura.visible = false;
    this.releaseShockLight();
  }

  private applyHitKnockback(from: THREE.Vector3): void {
    const away = new THREE.Vector3().subVectors(this.root.position, from);
    away.y = 0;
    if (away.lengthSq() <= 1e-8) {
      const yaw = this.meshGroup.rotation.y;
      away.set(Math.sin(yaw), 0, Math.cos(yaw));
    }
    away.normalize();
    this.root.position.addScaledVector(away, ENEMY_HIT_KNOCKBACK_METERS);
    this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, -22, 22);
    this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, -22, 22);
  }

  private tickHitStagger(delta: number): void {
    if (this.hitStaggerRemaining <= 0) return;
    const elapsed = Math.max(0, delta);
    this.hitStaggerRemaining = Math.max(0, this.hitStaggerRemaining - elapsed);
    this.hitReactionElapsed = Math.min(
      ENEMY_HIT_STAGGER_SECONDS,
      this.hitReactionElapsed + elapsed
    );
    if (this.hitStaggerRemaining > 0) return;
    this.endHitReaction();
  }

  private beginDizzyPose(): void {
    if (this.dizzyActive || this.levitatePoseActive) return;
    this.savedDizzyRoll = this.meshGroup.rotation.z;
    this.dizzyActive = true;
  }

  private updateDizzyPose(): void {
    if (!this.dizzyActive || this.hitUsesClip || this.levitatePoseActive) return;
    // A single damped flinch is much cleaner than a high-frequency wobble of
    // the whole rig. This is especially important for monster_arch, whose GLB
    // has no authored hit clip and previously looked like it was vibrating.
    const progress = THREE.MathUtils.clamp(
      this.hitReactionElapsed / ENEMY_HIT_STAGGER_SECONDS,
      0,
      1
    );
    const flinch = Math.sin(progress * Math.PI) * 0.075;
    this.meshGroup.rotation.z = this.savedDizzyRoll + flinch;
  }

  private endHitReaction(): void {
    this.hitReactionElapsed = 0;
    if (this.hitUsesClip && !this.levitatePoseActive) this.animator?.releaseHit?.();
    this.hitUsesClip = false;
    if (this.dizzyActive && !this.levitatePoseActive) {
      this.meshGroup.rotation.z = this.savedDizzyRoll;
    }
    this.dizzyActive = false;
  }

  public applyElementalHit(element: ElementalType, damagePerSecond: number, durationSeconds?: number): void {
    if (this.isDead) return;
    this.elementalStatus = applyElementalStatus(
      this.elementalStatus,
      element,
      damagePerSecond,
      durationSeconds
    );
    if (element === 'ice') this.ensureFreezeVisuals();
  }

  private get isFrozenByIce(): boolean {
    return this.elementalStatus?.element === 'ice' || this.mageFreezeRemaining > 0;
  }

  private ensureFreezeVisuals(): void {
    if (this.freezeMist || this.freezeSmoke) return;
    const bodyScale = Number(this.root.userData.enemyBodyScale) || 1;
    this.freezeMist = this.buildFreezePuffs('EnemyIceMist', 0xffffff, 0.5 * bodyScale, 34, 0.45, 1.05);
    this.freezeSmoke = this.buildFreezePuffs('EnemyIceSmoke', 0xcdd6e0, 0.72 * bodyScale, 20, 0.85, 2);
  }

  /**
   * White mist / pale smoke cloud for the frozen body. Mist puffs orbit with
   * the points object; smoke puffs rise and loop (speeds kept for update).
   */
  private buildFreezePuffs(
    name: string,
    color: number,
    size: number,
    count: number,
    radius: number,
    height: number
  ): THREE.Points {
    const bodyScale = Number(this.root.userData.enemyBodyScale) || 1;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const spread = (0.35 + Math.random() * 0.65) * radius * bodyScale;
      positions[index * 3] = Math.cos(angle) * spread;
      positions[index * 3 + 1] = (0.1 + Math.random() * 0.9) * height * bodyScale;
      positions[index * 3 + 2] = Math.sin(angle) * spread;
    }
    const geometry = this.ownGeometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      map: getFreezePuffTexture(),
      color,
      size,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      toneMapped: false,
    });
    const points = new THREE.Points(geometry, material);
    points.name = name;
    points.frustumCulled = false;
    points.visible = false;
    this.root.add(points);
    this.fadeMaterials.push(material);
    if (name === 'EnemyIceSmoke') {
      const speeds = new Float32Array(count);
      for (let index = 0; index < count; index += 1) {
        speeds[index] = (0.45 + Math.random() * 0.6) * bodyScale;
      }
      this.freezeSmokeSpeeds = speeds;
    }
    return points;
  }

  private updateFreezeVisuals(delta: number): void {
    if (!this.freezeMist || !this.freezeSmoke) return;
    const active = this.isFrozenByIce && !this.isDead;
    this.freezeMist.visible = active;
    this.freezeSmoke.visible = active;
    if (!active) {
      this.restoreFreezeTint();
      return;
    }
    this.applyFreezeTint();
    const step = Math.max(0, delta);
    if (this.freezeMist) {
      this.freezeMist.rotation.y -= step * 0.9;
      const mistMaterial = this.freezeMist.material as THREE.PointsMaterial;
      mistMaterial.opacity = 0.38 + Math.sin(performance.now() * 0.009) * 0.08;
    }
    this.updateFreezeSmoke(step);
  }

  private updateFreezeSmoke(delta: number): void {
    if (!this.freezeSmoke || !this.freezeSmokeSpeeds || delta <= 0) return;
    const bodyScale = Number(this.root.userData.enemyBodyScale) || 1;
    const attribute = this.freezeSmoke.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = attribute.array as Float32Array;
    const top = 2 * bodyScale;
    for (let index = 0; index < this.freezeSmokeSpeeds.length; index += 1) {
      const offset = index * 3 + 1;
      positions[offset] += this.freezeSmokeSpeeds[index] * delta;
      if (positions[offset] > top) positions[offset] = 0.1 * bodyScale;
    }
    attribute.needsUpdate = true;
  }

  /** Tints the body ice-blue while frozen; originals are restored on release. */
  private applyFreezeTint(): void {
    for (const material of this.fadeMaterials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (!this.freezeTintOriginals.has(material)) {
        this.freezeTintOriginals.set(material, {
          emissive: material.emissive.getHex(),
          emissiveIntensity: this.hitFlashBaseIntensities.get(material) ?? material.emissiveIntensity,
        });
      }
      material.emissive.setHex(0x2a7fff);
      if (material.emissiveIntensity < 0.55) material.emissiveIntensity = 0.55;
    }
  }

  private restoreFreezeTint(): void {
    if (this.freezeTintOriginals.size === 0) return;
    this.freezeTintOriginals.forEach((original, material) => {
      material.emissive.setHex(original.emissive);
      material.emissiveIntensity = original.emissiveIntensity;
    });
    this.freezeTintOriginals.clear();
  }

  private hideFreezeVisuals(): void {
    if (this.freezeMist) this.freezeMist.visible = false;
    if (this.freezeSmoke) this.freezeSmoke.visible = false;
    this.restoreFreezeTint();
  }

  public get elementalSpeedMultiplier(): number {
    if (
      this.mageLevitateRemaining > 0
      || this.warriorKnockdownRemaining > 0
      || this.mageFreezeRemaining > 0
      || this.hitStaggerRemaining > 0
    ) {
      return 0;
    }
    if (this.mageSlowRemaining > 0) return MAGE_WATER_SLOW_MULTIPLIER;
    return getElementalSlowMultiplier(this.elementalStatus);
  }

  /**
   * A landed character hit. Pushes the monster back, plays a hit clip when the
   * model has one, and leaves it dizzy for 0.3s. Damage-over-time stays on
   * takeDamage so it does not stagger.
   */
  public receivePlayerHit(amount: number, from: THREE.Vector3): void {
    if (this.isDead || !(amount > 0)) return;
    if (!this.isWarriorKnockedDown) this.applyHitKnockback(from);
    const willDie = this.hp - amount <= 0;
    this.takeDamage(amount);
    if (willDie || this.isDead) return;
    this.hitStaggerRemaining = ENEMY_HIT_STAGGER_SECONDS;
    this.hitReactionElapsed = 0;
    this.activeAnimatedAttack = null;
    if (this.levitatePoseActive) return;
    this.hitUsesClip = this.animator?.playHit?.() ?? false;
    if (!this.hitUsesClip) {
      this.animator?.play('idle', 0.05);
      this.beginDizzyPose();
    }
  }

  public takeDamage(amount: number) {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.hitFlashTime = 0.15;
    if (this.hp <= 0) {
      if (this.levitatePoseActive) {
        this.root.position.y = this.levitateGroundY;
        this.endLevitatePose();
      }
      this.hitStaggerRemaining = 0;
      this.endHitReaction();
      this.isDead = true;
      this.activeAnimatedAttack = null;
      this.animatedDeathDuration = this.animator?.playDeath() ?? 0;
      this.deathTimer = 0;
      this.deathEffectStage = 'animation';
      this.deathBasePosition.copy(this.root.position);
      this.deathBaseScale.copy(this.root.scale);
      this.deathBaseRotationZ = this.root.rotation.z;
      this.createDeathParticles();
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseShockLight();
    const ownedSkeletons = new Set<THREE.Skeleton>();
    this.meshGroup.traverse((object) => {
      const skinnedMesh = object as THREE.SkinnedMesh;
      if (skinnedMesh.isSkinnedMesh) ownedSkeletons.add(skinnedMesh.skeleton);
    });
    ownedSkeletons.forEach((skeleton) => skeleton.dispose());
    this.ownedGeometries.forEach((geometry) => geometry.dispose());
    this.fadeMaterials.forEach((material) => material.dispose());
    this.deathParticleMaterial?.dispose();
    this.deathParticleMaterial = null;
    this.deathParticles = null;
    this.deathParticleVelocities = null;
    this.root.removeFromParent();
  }

  private updateDeath(delta: number): void {
    this.deathTimer += Math.max(0, delta);
    const afterAnimation = this.deathTimer - this.animatedDeathDuration;
    if (afterAnimation < 0) {
      this.deathEffectStage = 'animation';
      return;
    }
    const totalDuration = DEATH_BURN_DURATION + DEATH_ASH_DURATION;
    const progress = Math.min(1, Math.max(0, afterAnimation / totalDuration));
    this.deathEffectStage = afterAnimation + DEATH_TIME_EPSILON < DEATH_BURN_DURATION
      ? 'burn'
      : 'ash';
    this.applyDeathBurn(progress, delta);
    if (afterAnimation + DEATH_TIME_EPSILON >= totalDuration) {
      this.deathEffectStage = 'complete';
      this.markedForRemoval = true;
    }
  }

  private applyDeathBurn(progress: number, delta: number): void {
    this.root.position.copy(this.deathBasePosition);
    this.root.rotation.z = this.deathBaseRotationZ;
    this.root.scale.copy(this.deathBaseScale);
    const bodyOpacity = 1 - THREE.MathUtils.smoothstep(progress, 0.12, 1);
    this.fadeMaterials.forEach((material) => {
      material.transparent = true;
      material.depthWrite = false;
      material.opacity = bodyOpacity;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.setHex(0xff4a00);
        material.emissiveIntensity = 0.5 + Math.sin(progress * Math.PI) * 2.8;
      }
    });
    this.updateDeathParticles(delta, progress);
  }

  private createDeathParticles(): void {
    if (this.deathParticles) return;
    const count = 48;
    const bodyScale = Number(this.root.userData.enemyBodyScale) || 1;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const ember = new THREE.Color(0xff5a12);
    const ash = new THREE.Color(0x4a4540);
    for (let index = 0; index < count; index++) {
      const offset = index * 3;
      const angle = index * 2.399963;
      const radius = (0.12 + (index % 7) * 0.045) * bodyScale;
      positions[offset] = Math.cos(angle) * radius;
      positions[offset + 1] = (0.2 + ((index * 13) % count) / count * 1.7) * bodyScale;
      positions[offset + 2] = Math.sin(angle) * radius;
      velocities[offset] = Math.cos(angle) * (0.08 + (index % 3) * 0.025);
      velocities[offset + 1] = 0.35 + (index % 5) * 0.08;
      velocities[offset + 2] = Math.sin(angle) * (0.08 + (index % 4) * 0.02);
      const color = index % 3 === 0 ? ember : ash;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
    const geometry = this.ownGeometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.085 * bodyScale,
      transparent: true,
      opacity: 0,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(geometry, material);
    particles.frustumCulled = false;
    this.root.add(particles);
    this.deathParticles = particles;
    this.deathParticleMaterial = material;
    this.deathParticleVelocities = velocities;
  }

  private updateDeathParticles(delta: number, progress: number): void {
    if (!this.deathParticles || !this.deathParticleVelocities || !this.deathParticleMaterial) return;
    const attribute = this.deathParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = attribute.array as Float32Array;
    for (let index = 0; index < attribute.count; index++) {
      const offset = index * 3;
      positions[offset] += this.deathParticleVelocities[offset] * delta;
      positions[offset + 1] += this.deathParticleVelocities[offset + 1] * delta;
      positions[offset + 2] += this.deathParticleVelocities[offset + 2] * delta;
    }
    attribute.needsUpdate = true;
    this.deathParticleMaterial.opacity = Math.min(1, progress * 5) * (1 - progress);
  }

  private ownGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.ownedGeometries.add(geometry);
    return geometry;
  }

  private captureHitFlashBaseIntensities(materials: readonly THREE.Material[]): void {
    materials.forEach((material) => this.captureHitFlashBaseIntensity(material));
  }

  private captureHitFlashBaseIntensity(material: THREE.Material): void {
    if (material instanceof THREE.MeshStandardMaterial) {
      this.hitFlashBaseIntensities.set(material, material.emissiveIntensity);
    }
  }
}
