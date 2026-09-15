import * as THREE from 'three';
import { CharacterAssetStore } from '../characters/CharacterAssetStore';
import {
  resolveCharacterClips,
  resolveWarriorAttackClips,
} from '../characters/CharacterAnimations';
import type { RuntimeWarriorBudgetReport } from '../characters/RuntimeWarriorBudget';
import {
  getCharacterDefinition,
  WARRIOR_ATTACK_IDS,
  type CharacterAnimationState,
  type CharacterId,
  type WarriorAttackId,
} from '../characters/CharacterCatalog';
import { Logger } from '../utils/Logger';
import {
  canAcceptPlayerInput,
  cappedMovementStep,
  resolveDamageReaction,
  resolveLocomotionState,
} from './PlayerLocomotion';
import { approachMovementSpeed, groundPlaneDistance } from './PlayerMovement';
import { PlayerAnimationPreview } from './PlayerAnimationPreview';
import {
  WeaponEquipment,
} from '../equipment/WeaponAttachment';
import type {
  EquipmentId,
  WeaponDefinition,
} from '../equipment/EquipmentCatalog';
import {
  SWORD_COMBO_STAGES,
  SwordComboController,
  type SwordComboEvent,
} from '../combat/SwordComboController';
import { WarriorAttackController } from '../combat/WarriorAttackController';
import {
  getWarriorSkill,
  type WarriorSkillId,
} from '../combat/WarriorSkillCatalog';
import { getEffectiveTargetDistance } from '../combat/DistanceDamage';

const BASIC_ACTION_INVULNERABILITY_SECONDS = 0.7;
const SKILL_ACTION_INVULNERABILITY_SECONDS = 1.5;
const POST_HIT_INVULNERABILITY_SECONDS = 0.4;
const DASH_DISTANCE = 5.4;
const DASH_SPEED = 30;
const DASH_COOLDOWN_SECONDS = 0.85;
const DASH_INVULNERABILITY_SECONDS = 0.3;

export type PlayerState = CharacterAnimationState;

export interface MissingAnimationsInfo {
  missing: string[];
  foundClipNames: string[];
  isCritical: boolean;
}

export interface WarriorSkillHitEvent {
  readonly attackId: WarriorSkillId;
  readonly hitIndex: number;
  readonly origin: THREE.Vector3;
  readonly forward: THREE.Vector3;
}

export class Player {
  public root = new THREE.Group();
  public mixer!: THREE.AnimationMixer;
  public state: PlayerState = 'idle';

  private actions: Partial<Record<PlayerState, THREE.AnimationAction>> = {};
  private comboActions: THREE.AnimationAction[] = [];
  private warriorAttackActions: Partial<Record<WarriorAttackId, THREE.AnimationAction>> = {};
  private currentAction: THREE.AnimationAction | null = null;
  private animationPreview = new PlayerAnimationPreview();
  private readonly comboController = new SwordComboController();
  private readonly skillAttackController = new WarriorAttackController();
  private readonly comboHitTargets = new Set<THREE.Object3D>();
  private readonly moveDirection = new THREE.Vector3();
  private readonly faceDirection = new THREE.Vector3();
  private readonly dashDirection = new THREE.Vector3();

  public moveTarget: THREE.Vector3 | null = null;
  public attackTargetEnemy: THREE.Object3D | null = null;
  public speed = 4.5;
  public currentMoveSpeed = 0;
  public rotationSpeed = 10;

  public maxHP = 100;
  public hp = 100;
  public maxMana = 50;
  public mana = 50;
  public attackDamage = 18;
  public attackRange = 2.2;
  /** Multiplicador temporário de velocidade (buff de mini-boss). */
  public speedMultiplier = 1;
  public isDead = false;
  private adminImmortal = false;

  private attackCooldown = 0;
  public attackCooldownTime = 0.9;
  /** Segundos de invulnerabilidade restantes após tomar hit (anti-stunlock) */
  private hitInvulnerability = 0;
  /** Invulnerabilidade concedida pela ação aceita, independente do anti-stunlock. */
  private actionInvulnerability = 0;
  private actionInvulnerabilityFresh = false;
  private isSwinging = false;
  private isHitReacting = false;
  private emptyHandAttackPreview = false;
  private attackSequenceCursor = 0;
  private playedComboStages = 0;
  private dashDistanceRemaining = 0;
  private dashCooldown = 0;
  private onAttackHitCallback: ((target: THREE.Object3D) => void) | null = null;
  private onWarriorSkillHitCallback: ((event: WarriorSkillHitEvent) => void) | null = null;

  private loaded = false;
  private keyboardMoving = false;
  private inputLocked = false;
  private characterModel: THREE.Group | null = null;
  private embeddedSword: THREE.Object3D | null = null;
  private weaponEquipment = new WeaponEquipment();
  public missingAnimationsInfo: MissingAnimationsInfo = {
    missing: [],
    foundClipNames: [],
    isCritical: false,
  };

  constructor(
    private readonly characterId: CharacterId,
    private readonly assets: CharacterAssetStore
  ) {
    this.root.userData.isPlayer = true;
  }

  public async load(): Promise<void> {
    const definition = getCharacterDefinition(this.characterId);
    Logger.info('Player', `Preparando personagem: ${definition.name}`);
    const model = this.assets.createModel(this.characterId);
    this.characterModel = model;
    model.scale.setScalar(definition.gameScale);
    this.embeddedSword = model.getObjectByName('sword') ?? null;
    if (this.embeddedSword) this.embeddedSword.visible = false;

    let meshCount = 0;
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (this.characterId === 'paladin') {
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          const cloned = materials.map((material) => {
            const copy = material.clone();
            if (copy instanceof THREE.MeshStandardMaterial) {
              copy.emissive.setHex(0xffffff);
              copy.emissiveMap = copy.map;
              copy.emissiveIntensity = 0.45;
            }
            return copy;
          });
          mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
        }
        meshCount++;
      }
    });
    Logger.debug('Player', `Meshes encontradas no modelo: ${meshCount}`);

    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);

    const nativeClips = this.assets.getAnimations(this.characterId);
    const clipNames = nativeClips.map((clip) => clip.name);
    const clips = resolveCharacterClips(this.characterId, this.assets);
    const warriorAttackClips = resolveWarriorAttackClips(this.characterId, this.assets);
    const idleClip = clips.idle;
    const runClip = clips.running;
    const attackClip = clips.attacking;
    const hitClip = clips.hit;
    const deadClip = clips.dead;

    Logger.info(
      'Player',
      `${definition.name}: ${nativeClips.length} clipes nativos; ` +
        `${Object.keys(clips).length} estados resolvidos.`
    );

    const missing: string[] = [];
    if (!idleClip) missing.push('idle');
    if (!runClip) missing.push('running');
    if (!attackClip) missing.push('attacking');
    if (!hitClip) missing.push('hit');
    if (!deadClip) missing.push('dead');

    this.setupAction('idle', idleClip, THREE.LoopRepeat);
    this.setupAction('running', runClip, THREE.LoopRepeat);
    this.setupComboActions(
      attackClip,
      definition.animationTimeScale?.attacking ?? 1,
      warriorAttackClips
    );
    this.setupAction('hit', hitClip, THREE.LoopOnce);
    this.setupAction('dead', deadClip, THREE.LoopOnce);

    const isCritical = !idleClip;
    if (isCritical) {
      Logger.error(
        'Player',
        `Animação obrigatória "idle" não encontrada para ${definition.name}.`
      );
    }

    if (missing.length > 0) {
      Logger.warn('Player', `Animações faltando: [${missing.join(', ')}]`);
    } else {
      Logger.info('Player', 'Todas as 5 animações foram mapeadas com sucesso.');
    }

    this.missingAnimationsInfo = { missing, foundClipNames: clipNames, isCritical };

    this.mixer.addEventListener('finished', (e) => this.onAnimationFinished(e as any));

    this.loaded = true;
    this.playState('idle');
    Logger.info('Player', `${definition.name} pronto para uso.`);
  }

  /** Release player-owned VFX resources; the authored GLB remains asset-store owned. */
  public dispose(): void {
    this.cancelCombo(false);
  }

  private setupComboActions(
    clip: THREE.AnimationClip | undefined,
    previewTimeScale: number,
    warriorClips: Partial<Record<WarriorAttackId, THREE.AnimationClip>>
  ): void {
    this.comboActions = [];
    this.warriorAttackActions = {};

    for (const attackId of WARRIOR_ATTACK_IDS) {
      const attackClip = warriorClips[attackId];
      if (!attackClip) continue;
      const action = this.mixer.clipAction(attackClip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.setEffectiveTimeScale(previewTimeScale);
      action.stop();
      this.warriorAttackActions[attackId] = action;
    }

    if (clip) {
      for (let stage = 0; stage < SWORD_COMBO_STAGES.length; stage += 1) {
        const stageClip = clip.clone();
        stageClip.name = `${clip.name}:combo:${stage}`;
        const action = this.mixer.clipAction(stageClip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.setEffectiveTimeScale(previewTimeScale);
        action.stop();
        this.comboActions.push(action);
      }
    }
    this.actions.attacking =
      this.warriorAttackActions.ataque_basico ?? this.comboActions[0];
  }

  private setupAction(
    state: PlayerState,
    clip: THREE.AnimationClip | undefined,
    loop: THREE.AnimationActionLoopStyles,
    timeScale = 1
  ) {
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    action.setEffectiveTimeScale(timeScale);
    action.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
    if (loop === THREE.LoopOnce) action.clampWhenFinished = true;
    this.actions[state] = action;
  }

  private onAnimationFinished(e: { action: THREE.AnimationAction }) {
    const finishedState = (Object.keys(this.actions) as PlayerState[]).find(
      (state) => this.actions[state] === e.action
    );
    if (finishedState && !this.isSwinging) {
      if (finishedState === 'attacking' && this.emptyHandAttackPreview) {
        this.emptyHandAttackPreview = false;
        this.playState('idle', 0.15);
        return;
      }
      const nextState = this.animationPreview.finish(finishedState);
      if (nextState) {
        this.playState(nextState);
        return;
      }
    }

    if (e.action === this.actions.hit) {
      this.isHitReacting = false;
      const locomotion = this.getLocomotionState();
      this.playState(locomotion ?? 'idle', 0.15);
    }
  }

  private playState(state: PlayerState, fadeDuration = 0.2, restart = false): boolean {
    if (this.isDead && state !== 'dead') return false;

    const nextAction = this.actions[state];
    if (!nextAction) {
      if (state === 'dead') {
        this.currentAction?.fadeOut(0.1);
        this.currentAction = null;
      }
      this.state = state;
      return false;
    }
    if (nextAction === this.currentAction) {
      if (state === 'running') this.updateRunningPlaybackRate(nextAction);
      if (restart) {
        nextAction.reset();
        nextAction.setEffectiveWeight(1);
        nextAction.play();
      }
      this.state = state;
      return true;
    }

    if (state === 'running') this.updateRunningPlaybackRate(nextAction);
    nextAction.reset();
    nextAction.setEffectiveWeight(1);
    nextAction.fadeIn(fadeDuration);
    this.currentAction?.fadeOut(fadeDuration);

    nextAction.play();
    this.currentAction = nextAction;
    this.state = state;
    Logger.debug('Player:Animation', `Estado ativo: ${state} (${nextAction.getClip().name})`);
    return true;
  }

  private updateRunningPlaybackRate(action: THREE.AnimationAction): void {
    const nominalSpeed = Math.max(this.speed, 0.0001);
    const playbackRate = THREE.MathUtils.clamp(
      this.currentMoveSpeed / nominalSpeed,
      0.75,
      1.15
    );
    action.setEffectiveTimeScale(playbackRate);
  }

  public moveTo(point: THREE.Vector3) {
    if (this.isSwinging) this.cancelCombo();
    if (!this.canAcceptInput()) return;
    this.animationPreview.clear();
    this.attackTargetEnemy = null;
    this.onAttackHitCallback = null;
    this.moveTarget = point.clone();
  }

  public attackEnemy(enemy: THREE.Object3D, onHit: (target: THREE.Object3D) => void) {
    // A skill owns the action slot. A click may not queue a basic attack behind it.
    if (this.skillAttackController.active) return;
    if (this.isSwinging) {
      if (enemy === this.attackTargetEnemy && this.isTargetInRange(enemy)) {
        if (this.equippedWeaponId === 'sword') this.comboController.request();
        return;
      }
      // Selecting a different target cancels the current combo and then
      // continues through the ordinary target-selection path below.
      this.cancelCombo(false);
    }
    if (!this.canAcceptInput()) return;
    this.animationPreview.clear();
    this.attackTargetEnemy = enemy;
    this.onAttackHitCallback = onHit;
    this.moveTarget = null;
    // Enemy clicks are explicit attack commands. They do one strike when the
    // target is currently in range; focus alone never starts a later strike.
    if (this.isTargetInRange(enemy)) this.startCombo();
  }

  /** Ataque "no vazio" — usado quando não há inimigos na cena (modo de teste de animação). */
  public attackAtCursor() {
    if (this.skillAttackController.active) return;
    if (this.isSwinging) {
      if (this.equippedWeaponId === 'sword') this.comboController.request();
      return;
    }
    if (!this.canAcceptInput() || this.attackCooldown > 0) return;
    this.animationPreview.clear();
    // Empty-hand clicks are used by the animation preview before the reward
    // gate equips a weapon. Keep that preview one-shot and leave combat
    // combo timing exclusively to the equipped sword path.
    if (this.equippedWeaponId !== 'sword') {
      this.attackCooldown = this.attackCooldownTime;
      this.emptyHandAttackPreview = true;
      this.playState('attacking', 0.15);
      return;
    }
    this.startCombo();
  }

  public get activeWarriorAttackId(): WarriorAttackId | null {
    if (this.skillAttackController.activeAttackId) {
      return this.skillAttackController.activeAttackId;
    }
    return this.isSwinging ? 'ataque_basico' : null;
  }

  public onWarriorSkillHit(callback: (event: WarriorSkillHitEvent) => void): void {
    this.onWarriorSkillHitCallback = callback;
  }

  public tryStartSkillAttack(id: WarriorSkillId): boolean {
    if (
      this.equippedWeaponId !== 'sword' ||
      this.isDead ||
      this.isHitReacting ||
      this.isSwinging ||
      this.inputLocked ||
      this.isDashing
    ) {
      return false;
    }
    const action = this.warriorAttackActions[id];
    if (!action) return false;

    const playbackRate = getWarriorSkill(id).playbackRate;
    const duration = (action.getClip().duration || 1) / playbackRate;
    if (!this.skillAttackController.start(id, duration)) return false;

    this.animationPreview.clear();
    this.moveTarget = null;
    this.comboController.cancel();
    this.comboHitTargets.clear();
    this.isSwinging = true;
    this.actionInvulnerability = SKILL_ACTION_INVULNERABILITY_SECONDS;
    this.actionInvulnerabilityFresh = true;
    this.emptyHandAttackPreview = false;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(playbackRate);
    action.setEffectiveWeight(1);
    action.fadeIn(0.08);
    this.currentAction?.fadeOut(0.08);
    action.play();
    this.currentAction = action;
    this.state = 'attacking';
    return true;
  }

  public previewAnimation(state: PlayerState): boolean {
    if (this.isDead || !this.actions[state]) return false;

    this.moveTarget = null;
    this.attackTargetEnemy = null;
    this.keyboardMoving = false;
    this.onAttackHitCallback = null;
    this.currentMoveSpeed = 0;
    this.emptyHandAttackPreview = false;
    this.cancelCombo(false);
    this.isHitReacting = false;
    this.animationPreview.select(state);
    return this.playState(state);
  }

  public get activeAnimationPreview(): PlayerState | null {
    return this.animationPreview.activeState;
  }

  public clearAttackTarget() {
    this.attackTargetEnemy = null;
    this.onAttackHitCallback = null;
    this.cancelCombo();
  }

  public takeDamage(amount: number) {
    this.applyDamage(amount, false);
  }

  public takeBossSkillDamage(amount: number) {
    this.applyDamage(amount, true);
  }

  private applyDamage(amount: number, forceHitReaction: boolean) {
    if (this.adminImmortal || this.isDead) return;
    // Action invulnerability applies uniformly to ordinary and boss damage.
    // It is independent from the shorter post-hit anti-stunlock window below.
    if (this.actionInvulnerability > 0) return;
    // Invulnerabilidade breve após cada hit: evita stunlock com vários monstros
    if (!forceHitReaction && this.hitInvulnerability > 0) return;
    this.animationPreview.clear();
    this.hp = Math.max(0, this.hp - amount);
    this.hitInvulnerability = POST_HIT_INVULNERABILITY_SECONDS;

    // A hit reaction owns the body pose, so an active combo cannot continue
    // through it. This also closes the trail immediately.
    const wasSwinging = this.isSwinging;
    if (wasSwinging) this.cancelCombo(false);

    const reaction = forceHitReaction && this.hp > 0
      ? 'hit'
      : resolveDamageReaction({
          remainingHp: this.hp,
          isSwinging: false,
        });

    if (reaction === 'continue-attack') return;

    if (reaction === 'dead') {
      this.die();
    } else {
      this.isHitReacting = this.playState('hit', 0.08, forceHitReaction);
    }
  }

  public get immortal(): boolean {
    return this.adminImmortal;
  }

  public setImmortal(enabled: boolean): void {
    this.adminImmortal = enabled;
  }

  private die() {
    this.cancelCombo(false);
    this.isDead = true;
    this.hp = 0;
    this.moveTarget = null;
    this.attackTargetEnemy = null;
    this.isHitReacting = false;
    this.playState('dead');
    Logger.info('Player', 'Jogador morreu.');
  }

  public respawn(position: THREE.Vector3) {
    this.cancelCombo(false);
    this.isDead = false;
    this.hp = this.maxHP;
    this.mana = this.maxMana;
    this.root.position.copy(position);
    this.root.rotation.set(0, 0, 0);
    this.isHitReacting = false;
    this.actionInvulnerability = 0;
    this.actionInvulnerabilityFresh = false;
    this.dashDistanceRemaining = 0;
    this.dashCooldown = 0;
    this.attackTargetEnemy = null;
    this.moveTarget = null;
    this.animationPreview.clear();
    this.playState('idle');
    Logger.info('Player', 'Jogador renasceu.');
  }

  public update(delta: number) {
    if (!this.loaded) return;
    this.mixer.update(delta);

    if (this.attackCooldown > 0) this.attackCooldown -= delta;
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - delta);
    if (this.hitInvulnerability > 0) this.hitInvulnerability -= delta;
    if (this.actionInvulnerability > 0) {
      if (this.actionInvulnerabilityFresh) {
        this.actionInvulnerabilityFresh = false;
      } else {
        this.actionInvulnerability = Math.max(0, this.actionInvulnerability - delta);
      }
    }

    if (this.animationPreview.activeState) return;
    if (this.isDead) return;
    if (this.isDashing) {
      this.updateDash(delta);
      return;
    }
    if (this.isHitReacting) return;
    if (this.emptyHandAttackPreview) return;

    if (this.isSwinging) {
      if (this.skillAttackController.active) {
        this.updateSkillAttack(delta);
        return;
      }
      this.updateCombo(delta);
      return;
    }

    if (this.attackTargetEnemy) {
      this.updateAttackBehavior(delta);
      return;
    }

    if (this.moveTarget) {
      this.updateMoveBehavior(delta);
    } else {
      this.currentMoveSpeed = approachMovementSpeed(
        this.currentMoveSpeed,
        this.keyboardMoving ? this.speed * this.speedMultiplier : 0,
        14,
        18,
        delta
      );
      const locomotion = this.getLocomotionState();
      if (locomotion) this.playState(locomotion, 0.15);
    }
  }

  public get equippedWeaponId(): EquipmentId | null {
    return this.weaponEquipment.equippedWeaponId;
  }

  /** The authored Blender GLB replaces the retired procedural runtime warrior. */
  public get runtimeWarriorBudget(): RuntimeWarriorBudgetReport | null {
    return null;
  }

  public equipWeapon(
    definition: WeaponDefinition,
    weapon: THREE.Group
  ): boolean {
    if (!this.characterModel) return false;
    this.cancelCombo(false);
    const mountedEmbeddedSword =
      definition.id === 'sword' &&
      this.embeddedSword !== null;
    const equipped = mountedEmbeddedSword
      ? this.weaponEquipment.equipVirtual(definition.id)
      : this.weaponEquipment.equip(this.characterModel, weapon, definition);
    if (equipped) {
      // Status de combate vêm sempre da definição da arma (alcance/dano/velocidade)
      this.attackRange = definition.attackRange;
      this.attackDamage = definition.attackDamage;
      this.attackCooldownTime = definition.attackCooldownTime;
      if (definition.id === 'sword') {
        if (this.embeddedSword) {
          this.embeddedSword.visible = true;
        }
      } else {
        if (this.embeddedSword) this.embeddedSword.visible = false;
      }
      Logger.info(
        'Player:Equipment',
        `${definition.label} equipada em ${definition.socketName}. ` +
          `Dano=${definition.attackDamage} Alcance=${definition.attackRange}`
      );
    } else {
      Logger.error(
        'Player:Equipment',
        `Não foi possível equipar ${definition.label}: socket ${definition.socketName} ausente ou modelo inválido.`
      );
    }
    return equipped;
  }

  public unequipWeapon(): boolean {
    this.cancelCombo(false);
    const unequipped = this.weaponEquipment.unequip();
    if (unequipped) {
      if (this.embeddedSword) this.embeddedSword.visible = false;
    }
    return unequipped;
  }

  public cancelMovement() {
    this.moveTarget = null;
    this.attackTargetEnemy = null;
    this.keyboardMoving = false;
    this.dashDistanceRemaining = 0;
    this.onAttackHitCallback = null;
    this.cancelCombo();
  }

  public setInputLocked(locked: boolean) {
    this.inputLocked = locked;
    if (locked) this.cancelMovement();
  }

  private getLocomotionState(): 'idle' | 'running' | null {
    return resolveLocomotionState({
      keyboardMoving: this.keyboardMoving,
      hasMoveTarget: this.moveTarget !== null,
      hasAttackTarget: this.attackTargetEnemy !== null,
      isSwinging: this.isSwinging || this.isHitReacting,
      isDead: this.isDead,
    });
  }

  private updateAttackBehavior(delta: number) {
    const enemy = this.attackTargetEnemy!;
    if (!this.isTargetAlive(enemy)) {
      this.clearInvalidAttackTarget();
      this.playState(this.getLocomotionState() ?? 'idle', 0.15);
      return;
    }
    if (!this.isTargetInRange(enemy)) {
      if (this.keyboardMoving) {
        this.clearInvalidAttackTarget();
        this.playState('running', 0.15);
        return;
      }
      // A selected target is passive. Do not pursue it or arm a delayed
      // attack after the original click has been consumed.
      this.facePoint(enemy.position, delta);
      this.playState('idle', 0.15);
      return;
    }

    this.facePoint(enemy.position, delta);
    this.playState(this.keyboardMoving ? 'running' : 'idle', 0.15);
  }

  private startCombo(): boolean {
    if (
      this.equippedWeaponId === null ||
      this.isDead ||
      this.attackCooldown > 0 ||
      this.isSwinging
    ) return false;
    const action = this.warriorAttackActions.ataque_basico
      ?? this.comboActions[0]
      ?? this.actions.attacking;
    if (!action || !this.comboController.request()) return false;
    this.isSwinging = true;
    this.actionInvulnerability = BASIC_ACTION_INVULNERABILITY_SECONDS;
    this.actionInvulnerabilityFresh = true;
    this.emptyHandAttackPreview = false;
    this.attackCooldown = this.attackCooldownTime;
    this.comboHitTargets.clear();
    this.playedComboStages = 1;
    this.playComboStage(0);
    return true;
  }

  private playComboStage(stage: number): void {
    const attackId: WarriorAttackId = 'ataque_basico';
    const action = this.warriorAttackActions[attackId]
      ?? this.comboActions[stage]
      ?? this.actions.attacking;
    if (!action) {
      this.state = 'attacking';
      return;
    }

    const sourceDuration = action.getClip().duration || SWORD_COMBO_STAGES[stage].duration;
    const restartingCurrentAction = this.currentAction === action;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(sourceDuration / SWORD_COMBO_STAGES[stage].duration);
    action.setEffectiveWeight(1);
    // Every ordinary combo stage intentionally reuses ataque_basico. Fading
    // that instance either out or back in makes its weight pass through zero
    // and exposes the rig's T-pose during stages two and three.
    if (restartingCurrentAction) {
      action.stopFading();
    } else {
      action.fadeIn(0.06);
      this.currentAction?.fadeOut(0.06);
    }
    action.play();
    this.currentAction = action;
    this.state = 'attacking';
  }

  private updateCombo(delta: number): void {
    const target = this.attackTargetEnemy;
    if (target) {
      if (!this.isTargetAlive(target)) {
        this.clearInvalidAttackTarget();
        this.playState(this.getLocomotionState() ?? 'idle', 0.15);
        return;
      }
      if (!this.isTargetInRange(target)) {
        this.cancelCombo(false);
        if (this.keyboardMoving) {
          this.clearInvalidAttackTarget();
          this.playState('running', 0.15);
          return;
        }
        if (this.attackTargetEnemy && !this.isDead) {
          this.updateAttackBehavior(delta);
        }
        return;
      }
      this.facePoint(target.position, delta);
    }

    const events = this.comboController.update(delta);
    for (let index = 0; index < events.length; index += 1) {
      this.consumeComboEvent(events[index]);
    }

  }

  private consumeComboEvent(event: SwordComboEvent): void {
    switch (event.type) {
      case 'stage-started':
        this.comboHitTargets.clear();
        this.playedComboStages = Math.max(this.playedComboStages, event.stage + 1);
        this.playComboStage(event.stage);
        break;
      case 'damage-opened':
        this.tryDealComboDamage();
        break;
      case 'damage-closed':
        break;
      case 'combo-ended':
        this.isSwinging = false;
        this.comboHitTargets.clear();
        this.playedComboStages = 0;
        this.playState(this.getLocomotionState() ?? 'idle', 0.15);
        break;
      default:
        break;
    }
  }

  private updateSkillAttack(delta: number): void {
    const target = this.attackTargetEnemy;
    if (target && this.isTargetAlive(target) && this.isTargetInRange(target)) {
      this.facePoint(target.position, delta);
    }

    for (const event of this.skillAttackController.update(delta)) {
      switch (event.type) {
        case 'trail-start':
          break;
        case 'hit':
          this.comboHitTargets.clear();
          this.onWarriorSkillHitCallback?.({
            attackId: event.attackId as WarriorSkillId,
            hitIndex: event.hitIndex,
            origin: this.root.getWorldPosition(new THREE.Vector3()),
            forward: this.root.getWorldDirection(new THREE.Vector3()).setY(0).normalize(),
          });
          break;
        case 'impact':
          break;
        case 'trail-end':
          break;
        case 'attack-ended':
          this.isSwinging = false;
          this.comboHitTargets.clear();
          this.playState(this.getLocomotionState() ?? 'idle', 0.15);
          break;
        default:
          break;
      }
    }
  }

  private tryDealComboDamage(): void {
    const target = this.attackTargetEnemy;
    if (
      this.equippedWeaponId === null ||
      !target ||
      !this.isTargetAlive(target) ||
      !this.isTargetInRange(target)
    ) return;
    if (this.comboHitTargets.has(target)) return;
    this.comboHitTargets.add(target);
    this.onAttackHitCallback?.(target);
  }

  private isTargetAlive(target: THREE.Object3D): boolean {
    return target.userData?.isDead !== true && (target as THREE.Object3D & { isDead?: boolean }).isDead !== true;
  }

  private isTargetInRange(target: THREE.Object3D): boolean {
    const bodyRadius = 0.6 * (target.userData?.enemyBodyScale ?? 1);
    const distance = getEffectiveTargetDistance(
      this.root.position.distanceTo(target.position),
      bodyRadius
    );
    return distance <= this.attackRange;
  }

  private clearInvalidAttackTarget(): void {
    this.attackTargetEnemy = null;
    this.onAttackHitCallback = null;
    this.cancelCombo(false);
  }

  private cancelCombo(restoreLocomotion = true): void {
    const hadCombo = this.isSwinging || this.comboController.active || this.skillAttackController.active;
    this.comboController.cancel();
    this.skillAttackController.cancel();
    this.isSwinging = false;
    this.emptyHandAttackPreview = false;
    this.comboHitTargets.clear();
    if (hadCombo && this.currentAction) {
      this.currentAction.stop();
      this.currentAction = null;
    }
    if (
      restoreLocomotion &&
      hadCombo &&
      !this.isDead &&
      !this.isHitReacting &&
      !this.animationPreview.activeState
    ) {
      this.playState(this.getLocomotionState() ?? 'idle', 0.06);
    }
  }

  private updateMoveBehavior(delta: number) {
    const dist = groundPlaneDistance(this.root.position, this.moveTarget!);
    if (dist > 0.15) {
      this.moveTowards(this.moveTarget!, delta);
      this.playState('running', 0.15);
    } else {
      this.moveTarget = null;
      this.currentMoveSpeed = approachMovementSpeed(
        this.currentMoveSpeed,
        this.keyboardMoving ? this.speed * this.speedMultiplier : 0,
        14,
        18,
        delta
      );
      this.playState(this.keyboardMoving ? 'running' : 'idle', 0.15);
    }
  }

  private moveTowards(point: THREE.Vector3, delta: number) {
    this.moveDirection.subVectors(point, this.root.position);
    this.moveDirection.y = 0;
    const remainingDistance = this.moveDirection.length();
    if (remainingDistance < 0.0001) return;
    this.moveDirection.normalize();
    this.currentMoveSpeed = approachMovementSpeed(
      this.currentMoveSpeed,
      this.speed * this.speedMultiplier,
      14,
      18,
      delta
    );
    this.root.position.addScaledVector(
      this.moveDirection,
      cappedMovementStep(remainingDistance, this.currentMoveSpeed, delta)
    );
    this.facePoint(point, delta);
  }

  private facePoint(point: THREE.Vector3, delta: number) {
    this.faceDirection.subVectors(point, this.root.position);
    this.faceDirection.y = 0;
    if (this.faceDirection.lengthSq() < 0.0001) return;

    const targetAngle = Math.atan2(this.faceDirection.x, this.faceDirection.z);
    let diff = targetAngle - this.root.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    this.root.rotation.y += diff * Math.min(1, this.rotationSpeed * delta);
  }

  public moveByDirection(
    dir: THREE.Vector3,
    delta: number,
    preserveMarkedAttack = false
  ) {
    if (this.isDashing) return;
    if (!dir.lengthSq()) return;
    const currentTargetInRange = this.attackTargetEnemy
      ? this.isTargetInRange(this.attackTargetEnemy)
      : false;
    const keepAttacking = this.isSwinging || preserveMarkedAttack || currentTargetInRange;
    if (this.isSwinging && !keepAttacking) this.cancelCombo(false);
    // Permite escapar mesmo durante a animação de hit (anti-stunlock)
    if (this.isHitReacting) {
      this.isHitReacting = false;
      this.playState('running', 0.15);
    }
    const canMove = keepAttacking
      ? !this.isDead && !this.inputLocked
      : this.canAcceptInput();
    if (!canMove) return;
    this.animationPreview.clear();
    if (!keepAttacking) {
      this.attackTargetEnemy = null;
      this.onAttackHitCallback = null;
    }
    this.moveTarget = null;
    this.keyboardMoving = true;

    this.moveDirection.copy(dir).normalize();
    this.currentMoveSpeed = approachMovementSpeed(
      this.currentMoveSpeed,
      this.speed * this.speedMultiplier,
      14,
      18,
      delta
    );
    this.root.position.addScaledVector(this.moveDirection, this.currentMoveSpeed * delta);

    if (!keepAttacking || !this.attackTargetEnemy) {
      const targetAngle = Math.atan2(this.moveDirection.x, this.moveDirection.z);
      let diff = targetAngle - this.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.root.rotation.y += diff * Math.min(1, this.rotationSpeed * delta);
    }

    if (!this.isSwinging) this.playState('running', 0.15);
  }

  public setKeyboardMoving(active: boolean) {
    this.keyboardMoving = this.inputLocked ? false : active;
  }

  public tryDash(direction: THREE.Vector3): boolean {
    if (
      !this.loaded ||
      this.isDead ||
      this.inputLocked ||
      this.isDashing ||
      this.dashCooldown > 0
    ) {
      return false;
    }

    this.dashDirection.copy(direction).setY(0);
    if (this.dashDirection.lengthSq() <= 1e-8) {
      this.root.getWorldDirection(this.dashDirection);
      this.dashDirection.y = 0;
    }
    if (this.dashDirection.lengthSq() <= 1e-8) this.dashDirection.set(0, 0, 1);
    this.dashDirection.normalize();

    this.cancelCombo(false);
    this.animationPreview.clear();
    this.moveTarget = null;
    this.attackTargetEnemy = null;
    this.onAttackHitCallback = null;
    this.isHitReacting = false;
    this.dashDistanceRemaining = DASH_DISTANCE;
    this.dashCooldown = DASH_COOLDOWN_SECONDS;
    this.currentMoveSpeed = DASH_SPEED;
    this.actionInvulnerability = Math.max(
      this.actionInvulnerability,
      DASH_INVULNERABILITY_SECONDS
    );
    this.actionInvulnerabilityFresh = true;
    this.faceTargetInstantly(this.root.position.clone().add(this.dashDirection));
    this.playState('running', 0.04);
    return true;
  }

  public get isDashing(): boolean {
    return this.dashDistanceRemaining > 0;
  }

  public cancelClickMovement(): void {
    this.moveTarget = null;
  }

  /** Indica se há um golpe em andamento (usado pelo auto-ataque do target) */
  public isAttackInSwing(): boolean {
    return this.isSwinging;
  }

  /** Seconds of action-granted invulnerability, excluding anti-stunlock time. */
  public get actionInvulnerabilityRemaining(): number {
    return this.actionInvulnerability;
  }

  /** Vira o personagem instantaneamente para um ponto (usado pelo auto-ataque do target) */
  public faceTargetInstantly(point: THREE.Vector3): void {
    this.faceDirection.subVectors(point, this.root.position);
    this.faceDirection.y = 0;
    if (this.faceDirection.lengthSq() < 0.0001) return;
    this.root.rotation.y = Math.atan2(this.faceDirection.x, this.faceDirection.z);
  }

  /** Kept as a compatibility shim; attacks require an explicit input command. */
  public forceAttackIfReady(): void {
    return;
  }

  private canAcceptInput(): boolean {
    return canAcceptPlayerInput({
      isDead: this.isDead,
      isSwinging: this.isSwinging || this.isDashing,
      isHitReacting: this.isHitReacting,
      inputLocked: this.inputLocked,
    });
  }

  private updateDash(delta: number): void {
    const step = Math.min(
      this.dashDistanceRemaining,
      DASH_SPEED * Math.max(0, delta)
    );
    this.root.position.addScaledVector(this.dashDirection, step);
    this.dashDistanceRemaining = Math.max(0, this.dashDistanceRemaining - step);
    this.currentMoveSpeed = DASH_SPEED;
    this.playState('running', 0.04);
    if (this.dashDistanceRemaining <= 0) {
      this.currentMoveSpeed = 0;
      this.playState(this.keyboardMoving ? 'running' : 'idle', 0.08);
    }
  }
}
