import * as THREE from 'three';
import { CameraController } from './CameraController';
import { InputManager, readMovementInput } from './InputManager';
import { Player, type WarriorSkillHitEvent } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { TrainingDummy } from '../entities/TrainingDummy';
import { createBoss } from '../entities/Boss';
import { Level } from '../world/Level';
import { HUD } from '../ui/HUD';
import type { FloatingDamageVariant } from '../ui/HUD';
import { Logger } from '../utils/Logger';
import { resolveGroundClickCombatAction } from './GroundClickCombatPolicy';
import { CharacterAssetStore } from '../characters/CharacterAssetStore';
import { resolveCharacterClips } from '../characters/CharacterAnimations';
import {
  getCharacterDefinition,
  getPlayableCharacters,
  PLAYABLE_CHARACTER_ID,
} from '../characters/CharacterCatalog';
import { RewardAssetStore } from '../equipment/RewardAssetStore';
import { getWeaponDefinition } from '../equipment/EquipmentCatalog';
import { WaveManager, type WaveEntityRole, type WaveSpawnRequest } from '../waves/WaveManager';
import {
  CombatEntityRegistry,
  type CombatRecord,
} from '../waves/CombatEntityRegistry';
import { FinalBattleSlotRegistry } from '../waves/FinalBattleSlotRegistry';
import { selectBatchSpawnPoints } from '../waves/WaveSpawnPlanner';
import {
  createArcherEnemy,
  createGuardianEnemy,
  createRegularEnemy,
  createMiniBossOptions,
  selectRegularEnemyVariant,
} from '../waves/WaveEnemyFactory';
import { EnemyAssetStore } from '../waves/EnemyAssetStore';
import { getBossHealthHudValues } from '../ui/BossHealthView';
import { RunProgression } from './RunProgression';
import {
  addDamageBonus,
  addMaxHealthBonus,
  getHitDamagePenalty,
  getKillReward,
  removeDamageBonus,
} from './KillRewards';
import { HealthPlasmaSystem } from '../entities/HealthPlasmaSystem';
import { ArcherProjectileSystem } from '../effects/ArcherProjectileSystem';
import { isAttackBlocked } from './DefenseRules';
import { formatHealingAmount } from '../ui/CombatNumberFormat';
import {
  getMarkedTargetSurfaceDistance,
  isMarkedTargetInRange,
  resolveManualAttackTarget,
  shouldStartAutoAttack,
  type AutoAttackSituation,
} from './AutoAttackPolicy';
import {
  FramePerformanceMonitor,
  type FramePerformanceContext,
} from './FramePerformanceMonitor';
import { BossSkillController } from '../entities/BossSkillController';
import { BossSkillEffects } from '../effects/BossSkillEffects';
import { BossAssetStore } from '../entities/BossAssetStore';
import {
  bossMeleeRange,
  decideBossCombatMode,
} from '../entities/BossCombatPolicy';
import {
  shouldClearBossTelegraph,
  shouldUpdateBossSkills,
} from '../entities/BossSkillSchedulingPolicy';
import { GameLightingRig } from './GameLightingRig';
import { AdminCommandGate } from '../admin/AdminCommandGate';
import { AdminGameActions } from '../admin/AdminGameActions';
import { AdminPanel } from '../admin/AdminPanel';
import {
  awardPlayerExperience,
  getPrimaryWeaponId,
  loadPlayerProfile,
  resetRunProgression,
  savePlayerProfile,
  type InventoryStack,
  type PlayerProfile,
} from '../profile/PlayerProfile';
import { InventoryStore } from '../inventory/InventoryStore';
import { getInventoryItem } from '../inventory/InventoryCatalog';
import { commitGuildTokenBackpackExpansion } from '../inventory/BackpackExpansion';
import {
  craftBlacksmithRecipe,
  getBlacksmithLicensePresentation,
  purchaseBlacksmithLicense,
  type BlacksmithRecipeId,
} from '../crafting/BlacksmithWorkshop';
import { RewardChest } from '../entities/RewardChest';
import { GameFlowController } from './GameFlowController';
import { FinalBossRewardCoordinator } from '../rewards/FinalBossRewardCoordinator';
import {
  deliverGuildVault,
  rollFinalBossLoot,
  settleFinalBossLoot,
} from '../rewards/FinalBossLoot';
import { WarriorSkillController } from '../combat/WarriorSkillController';
import { FatigueMeter, MAX_FATIGUE } from '../combat/FatigueMeter';
import {
  getWarriorSkill,
  isWarriorSkillUnlocked,
  warriorSkillDamageMultiplier,
  WARRIOR_SKILLS,
  type WarriorSkillId,
} from '../combat/WarriorSkillCatalog';
import { LobbyScreen, type BlacksmithLobbyActionResult } from '../ui/LobbyScreen';
import { InventoryOverlay, type RpgOverlayMode } from '../ui/InventoryOverlay';
import { loadGameAssetsInPhases } from './GameAssetPhases';
import {
  getWarriorSkillArea,
  getWarriorSkillDamage,
  resolveWarriorSkillAreaCenter,
} from '../combat/WarriorSkillArea';
import { resolveWarriorAreaTargets } from './WarriorAreaDamage';
import {
  applyDistanceFalloff,
  getEffectiveTargetDistance,
  WARRIOR_MAX_RANGE_METERS,
} from '../combat/DistanceDamage';
import { getTypedAttackBaseDamage, quantizeCombatDamage } from '../combat/CombatDamage';
import { MiniBossSkillController } from '../combat/MiniBossSkillController';
import { MiniBossSkillEffects } from '../effects/MiniBossSkillEffects';
import { deriveCharacterStats, type DerivedCharacterStats } from '../profile/CharacterAttributes';
import { attributesWithEquipment, equippedWeaponDamage } from '../equipment/EquipmentStatBonuses';
import { resolveCameraRelativeMovement } from '../entities/PlayerMovement';
import { VictoryLobbyTransition } from './VictoryLobbyTransition';

/**
 * MODO DE TESTE DE ARMA/ANIMAÇÃO: quando true, desativa o spawn de monstros
 * e mostra um boneco de treino no lugar. Definir como false para jogar
 * o fluxo normal com ondas de monstros e boss final.
 */
const WEAPON_TEST_MODE = false;

export interface GameOptions {
  adminEnabled?: boolean;
}

/** Resolves weapon damage only from the profile's currently equipped catalog item. */
export function resolveEquippedBaseDamage(
  profile: Pick<PlayerProfile, 'equipment'>
): number {
  return equippedWeaponDamage(profile.equipment);
}

/**
 * Commits the durable portion of a completed expedition before its lobby can
 * be presented. The existing inventory store is kept in sync for open UI and
 * reward systems that retain its reference.
 */
export function persistVictoryReset(
  profile: PlayerProfile,
  inventory: InventoryStore,
  persist: (candidate: PlayerProfile) => boolean
): boolean {
  Object.assign(profile, resetRunProgression(profile));
  inventory.commitProfile(profile);
  return persist(profile);
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private healthPlasma = new HealthPlasmaSystem(this.scene);
  private archerProjectiles = new ArcherProjectileSystem(this.scene);
  private fatigue = new FatigueMeter();
  private bossSkills = new BossSkillController();
  private bossEffects = new BossSkillEffects(this.scene);
  private bossEncounterActive = false;
  private readonly miniBossSkillControllers = new Map<string, MiniBossSkillController>();
  private readonly miniBossEffects = new MiniBossSkillEffects(this.scene);
  private cameraController: CameraController;
  private input: InputManager;
  private clock = new THREE.Clock();
  private performanceMonitor = new FramePerformanceMonitor();

  private player!: Player;
  private characterAssets = new CharacterAssetStore();
  private rewardAssets = new RewardAssetStore();
  private enemyAssets = new EnemyAssetStore();
  private bossAssets = new BossAssetStore();
  private runProgression!: RunProgression;
  private combatRegistry = new CombatEntityRegistry();
  private finalBattleSlots = new FinalBattleSlotRegistry();
  private level = new Level();
  private hud: HUD;
  private flow!: GameFlowController;
  private profile!: PlayerProfile;
  private inventory!: InventoryStore;
  private readonly warriorSkills = new WarriorSkillController();
  private inventoryOverlay!: InventoryOverlay;
  private rpgOverlayOpen = false;
  private finalBossRewards: FinalBossRewardCoordinator | null = null;
  private readonly victoryLobbyTransition = new VictoryLobbyTransition(
    5,
    () => { void this.returnToLobbyAfterVictory(); }
  );

  private raycaster = new THREE.Raycaster();
  private spawnPoint = new THREE.Vector3(0, 0, 14);
  private worldLimit = 23;

  private elapsedTime = 0;
  private running = false;
  private spawnCursor = 0;
  private regularSpawnSequence = 0;
  private regularSpawnWave: number | null = null;
  private regularWaveSpawnIndex = 0;
  private resetInProgress = false;

  private keyboardDir = new THREE.Vector3();
  private lightingRig?: GameLightingRig;
  private trainingDummy: TrainingDummy | null = null;
  /** Dano bônus acumulado por abates durante a run. */
  private bonusAttackDamage = 0;
  private bonusMaxHealth = 0;
  private playerBodyTarget = new THREE.Vector3();
  private readonly adminEnabled: boolean;
  private readonly adminGate: AdminCommandGate;
  private adminActions!: AdminGameActions;
  private adminPanel: AdminPanel | null = null;

  constructor(private canvas: HTMLCanvasElement, options: GameOptions = {}) {
    this.adminEnabled = options.adminEnabled === true;
    this.adminGate = new AdminCommandGate(this.adminEnabled);
    Logger.setDebugPanelEnabled(this.adminEnabled);
    this.hud = new HUD();
    this.hud.setDebugLogEnabled(this.adminEnabled);
    Logger.info('Game', 'Construindo instância do jogo...');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.cameraController = new CameraController(window.innerWidth / window.innerHeight);
    this.input = new InputManager(canvas);

    this.scene.fog = new THREE.Fog(0x111827, 22, 48);
    this.scene.background = new THREE.Color(0x111827);

    window.addEventListener('resize', () => this.onResize());
    canvas.addEventListener('wheel', (e) => {
      this.cameraController.adjustZoom(e.deltaY * 0.001);
    });

    Logger.info('Game', 'Renderer e cena configurados com sucesso.');
  }

  public async start(): Promise<void> {
    try {
      const profileResult = loadPlayerProfile();
      this.profile = profileResult.profile;
      this.inventory = InventoryStore.fromProfile(this.profile);
      // The administrator can add inventory items before entering the dungeon.
      this.setupAdminTools();
      this.flow = new GameFlowController(
        profileResult.kind === 'loaded' ? 'lobby' : 'class-select'
      );
      const characterId = PLAYABLE_CHARACTER_ID;
      const definition = getCharacterDefinition(characterId);
      this.hud.setGameplayVisible(false);
      this.hud.showLoadingScreen(5, `Preparando ${definition.name}...`);
      const playableCharacters = getPlayableCharacters();
      let rewardProgress = 0;
      let enemyProgress = 0;
      let bossProgress = 0;
      const updateGameplayProgress = () => {
        const progress = 60 + ((rewardProgress + enemyProgress + bossProgress) / 3) * 28;
        this.hud.setLoadingProgress(
          progress,
          'Preparando masmorra, recompensas e inimigos...'
        );
      };
      await loadGameAssetsInPhases({
        loadCharacter: () => this.characterAssets.loadAll((completed, total) => {
          this.hud.setLoadingProgress(
            5 + (completed / total) * 50,
            `Preparando ${definition.name}...`
          );
        }, playableCharacters),
        showLobby: async () => {
          for (const character of playableCharacters) {
            const fallbackWarning = this.characterAssets.getFallbackWarning(character.id);
            if (fallbackWarning !== undefined) {
              Logger.warn(
                'Game:Character',
                `${character.name} carregado com o modelo fallback; o modelo principal falhou.`,
                fallbackWarning
              );
            }
          }
          if (!this.characterAssets.has(PLAYABLE_CHARACTER_ID)) {
            const error = this.characterAssets.getError(PLAYABLE_CHARACTER_ID);
            throw new Error(
              `O ${definition.name} não pôde ser carregado.\n${Logger.formatError(error)}`
            );
          }
          this.hud.hideLoadingScreen();
          const lobby = new LobbyScreen(
            this.renderer,
            this.canvas,
            this.characterAssets,
            this.profile,
            this.inventory
          );
          await lobby.show({
            firstRun: this.flow.state === 'class-select',
            onClassConfirmed: () => {
              this.flow.transition({ type: 'class-confirmed' });
              savePlayerProfile(this.profile);
            },
            onGuildTokenBackpackExpansion: () => this.purchaseGuildTokenBackpackExpansion(),
            onHotkeysChanged: () => this.persistProfileState(),
            onAutoBasicAttackChanged: () => this.persistProfileState(),
            onLobbyInventoryChanged: () => this.persistInventory(),
            onBlacksmithLicensePurchase: () => this.purchaseBlacksmithWorkshopLicense(),
            onBlacksmithCraft: (recipeId) => this.craftBlacksmithRecipe(recipeId),
          });
          this.flow.transition({ type: 'start-game' });
          this.hud.showLoadingScreen(60, 'Preparando masmorra, recompensas e inimigos...');
        },
        loadGameplay: [
          () => this.rewardAssets.loadAll((completed, total) => {
            rewardProgress = total > 0 ? completed / total : 1;
            updateGameplayProgress();
          }).then(() => {
            rewardProgress = 1;
            updateGameplayProgress();
          }),
          () => this.enemyAssets.load().then(() => {
            enemyProgress = 1;
            updateGameplayProgress();
          }),
          () => this.bossAssets.load().then(() => {
            bossProgress = 1;
            updateGameplayProgress();
          }),
        ],
      });

      if (!this.bossAssets.hasBoss()) {
        Logger.warn(
          'Game:Boss',
          'Boss.glb não pôde ser carregado; o boss procedural será usado.',
          this.bossAssets.getError()
        );
      }

      this.hud.setLoadingProgress(90, `Preparando ${definition.name}...`);
      this.hud.setPlayerCharacter(definition.name);
      Logger.info('Game', `Personagem escolhido: ${definition.name}`);

      this.setupLights();
      this.scene.add(this.level.group);
      this.player = new Player(characterId, this.characterAssets);
      await this.player.load();
      this.player.onWarriorSkillHit((event) => this.onWarriorSkillHit(event));
      this.hud.onAnimationTest((state) => {
        if (this.player.previewAnimation(state)) {
          this.hud.setActiveAnimationTest(state);
          Logger.debug('Game:AnimationTest', `Botão acionado: ${state}`);
        }
      });

      this.player.root.position.copy(this.spawnPoint);
      this.scene.add(this.player.root);
      this.cameraController.snapTo(this.player.root.position);
      this.setupFinalBossRewardFlow();
      Logger.info('Game', 'Player adicionado à cena e câmera posicionada.');

      this.runProgression = new RunProgression(new WaveManager(), {
        spawn: (request) => this.spawnWaveRequest(request),
        render: (snapshot) => this.hud.updateWaveStatus(snapshot),
        victory: () => {
          this.dismissRpgOverlay();
          this.stopBossSkills();
          this.combatRegistry.clearLivingAllies();
          this.player.clearAttackTarget();
          this.targetedEnemyRoot = null;
          this.clearTargetMarker();
          this.player.setInputLocked(true);
          this.hud.hideBossHealth();
          this.flow.transition({ type: 'victory' });
          if (this.finalBossRewards) {
            this.finalBossRewards.start(
              this.level.getFinalBattleSpawnLayout().boss.clone().add(new THREE.Vector3(0, 0, 1.1))
            );
          } else {
            this.hud.showVictoryScreen();
            this.victoryLobbyTransition.start();
          }
          Logger.info('Game:Waves', 'Dungeon concluída; abrindo o baú final automaticamente.');
        },
      });
      this.adminPanel?.setGameplayAvailable(true);
      this.hud.onRespawnClick(() => this.fullRunReset());
      this.hud.onPlayAgain(() => this.victoryLobbyTransition.completeNow());

      if (!this.enemyAssets.hasRegularEnemy()) {
        Logger.warn(
          'Game:Enemy',
          `monstro.glb indisponível; usando visual procedural. ${Logger.formatError(this.enemyAssets.getError())}`
        );
      }

      if (this.player.missingAnimationsInfo.missing.length > 0) {
        this.hud.showAnimationWarning(this.player.missingAnimationsInfo);
      }

      this.hud.setLoadingProgress(85, 'Aplicando equipamento e preparando inventário...');
      this.applyCharacterBuild(true);
      this.setupRpgInterfaces();
      const restoredVault = this.persistInventory();
      if (restoredVault.deliveredFromGuildVault.length > 0) {
        this.hud.showCraftRewardNotification(
          restoredVault.deliveredFromGuildVault,
          [],
          restoredVault.saved
        );
      }
       this.hud.setPlayerPortrait('/assets/ui/portrait/warrior-portrait.png');
      if (this.player.equippedWeaponId !== null) this.runProgression.weaponEquipped();

      if (WEAPON_TEST_MODE) this.spawnTrainingDummy();

      this.hud.setLoadingProgress(100, 'Pronto!');
      this.hud.setGameplayVisible(true);
      this.flow.transition({ type: 'game-ready' });
      setTimeout(() => this.hud.hideLoadingScreen(), 350);

      this.input.postUpdate();
      this.running = true;
      Logger.info(
        'Game',
        'Loop principal iniciado. Controles: WASD move / clique-esquerdo ataca / clique em inimigo ataca / clique-esquerdo no vazio testa animação de ataque.'
      );
      this.loop();
    } catch (err) {
      Logger.error('Game', 'Erro fatal durante a inicialização do jogo.', err);
      this.hud.showLoadingError(Logger.formatError(err));
      throw err;
    }
  }

  private setupAdminTools(): void {
    this.adminActions = new AdminGameActions({
      preparePhaseChange: () => this.prepareAdminPhaseChange(),
      startWave: (wave) => this.runProgression.adminStartWave(wave),
      startBoss: () => this.runProgression.adminStartBoss(),
      hitkillBoss: () => this.adminHitkillBoss(),
      setImmortal: (enabled) => {
        this.player.setImmortal(enabled);
        Logger.info('Game:Admin', `Imortalidade ${enabled ? 'ativada' : 'desativada'}.`);
      },
      setAdminCamera: (enabled) => {
        this.cameraController.setAdminMode(enabled);
        Logger.info('Game:Admin', `Câmera ADM ${enabled ? 'ativada' : 'desativada'}.`);
      },
      inventory: this.inventory,
      profile: this.profile,
      persistProfileState: () => this.persistProfileState(),
    }, this.adminGate);

    const host = document.getElementById('app');
    if (!host) return;
    this.adminPanel = AdminPanel.mount(host, this.adminEnabled, (command) => {
      const result = this.adminActions.execute(command);
      if (!result.ok && result.reason === 'unauthorized') {
        Logger.warn('Game:Admin', 'Comando ADM recusado: sessão não autorizada.');
      } else if (!result.ok) {
        Logger.warn('Game:Admin', 'Comando ADM indisponível no estado atual.');
      } else {
        Logger.info('Game:Admin', `Comando executado: ${command.type}.`);
        if (command.type === 'add-inventory-item') {
          document.dispatchEvent(new Event('dragon-miner:admin-inventory-changed'));
        }
      }
      return result;
    });
  }

  private prepareAdminPhaseChange(): void {
    this.finalBossRewards?.reset();
    this.player.cancelMovement();
    this.player.clearAttackTarget();
    this.player.setInputLocked(false);
    this.targetedEnemyRoot = null;
    this.clearTargetMarker();
    this.healthPlasma.clear();
    this.archerProjectiles.clear();
    this.stopBossSkills();
    this.combatRegistry.clear();
    this.stopMiniBossSkills();
    this.finalBattleSlots.reset();
    this.hud.hideBossHealth();
    this.hud.hideVictoryScreen();
    this.hud.hideCraftRewardNotification();
  }

  private adminHitkillBoss(): boolean {
    const boss = this.combatRegistry.mainBoss;
    if (!boss) return false;
    const record = this.combatRegistry.findByRoot(boss.root);
    if (!record) return false;
    boss.takeDamage(boss.hp);
    this.handleEnemyDeath(record);
    return true;
  }

  private setupLights() {
    this.lightingRig = new GameLightingRig(this.scene);
  }

  /** Makes the rendered weapon reflect the durable primary-weapon slot. */
  private synchronizeEquippedWeapon(): void {
    if (getPrimaryWeaponId(this.profile.equipment) !== 'starter-sword') {
      if (this.player.equippedWeaponId !== null) this.player.unequipWeapon();
      return;
    }
    if (this.player.equippedWeaponId === 'sword') return;
    const definition = getWeaponDefinition('sword');
    if (!definition) throw new Error('Definição da espada inicial não encontrada.');
    const model = this.rewardAssets.hasWeapon('sword')
      ? this.rewardAssets.createWeapon('sword')
      : new THREE.Group();
    if (!this.player.equipWeapon(definition, model)) {
      throw new Error('A espada inicial não pôde ser equipada no Guerreiro.');
    }
    Logger.info('Game:Equipment', 'Espada inicial sincronizada com o equipamento salvo.');
  }

  private setupRpgInterfaces(): void {
    this.hud.setHotkeys(this.profile.hotkeys);
    const persistInventory = () => this.persistInventory();
    const persistStatus = () => {
      this.applyCharacterBuild(false);
      this.persistProfileState();
      this.hud.updateProgression(this.profile.progression, this.profile.attributePointsRemaining);
    };
    this.inventoryOverlay = new InventoryOverlay(this.profile, this.inventory, {
      onClose: () => this.closeRpgOverlay(),
      onInventoryChanged: persistInventory,
      onStatusChanged: persistStatus,
      onGuildTokenBackpackExpansion: () => this.purchaseGuildTokenBackpackExpansion(),
      onShown: () => this.activateRpgOverlay(),
      onHidden: () => this.deactivateRpgOverlay(),
    });
    this.hud.onOpenEquipment(() => this.openRpgOverlay('equipment'));
    this.hud.onOpenBackpack(() => this.openRpgOverlay('backpack'));
    this.hud.onOpenStatus(() => this.openRpgOverlay('status'));
    this.hud.updateProgression(this.profile.progression, this.profile.attributePointsRemaining);
    this.hud.onBasicAttack(() => this.triggerBasicAttack());
    this.hud.onCycleTarget(() => this.cycleTarget());
    this.hud.onWarriorSkill((id) => this.tryActivateWarriorSkill(id));
  }

  private triggerBasicAttack(): void {
    if (!this.canAcceptGameplayInput()) return;
    const target = resolveManualAttackTarget(
      this.targetedEnemyRoot,
      this.focusedTargetSituation()
    );
    if (target) {
      this.player.attackEnemy(target, (enemy) => this.onPlayerHitEnemy(enemy));
    } else {
      this.player.attackAtCursor();
    }
  }

  private persistInventory(): {
    saved: boolean;
    deliveredFromGuildVault: readonly InventoryStack[];
  } {
    const vaultDelivery = deliverGuildVault(this.inventory, this.profile.guildVault);
    this.profile.guildVault = vaultDelivery.guildVault;
    const serialized = this.inventory.toProfileInventory();
    this.profile.equipment = serialized.equipment;
    this.profile.backpack = serialized.backpack;
    this.applyCharacterBuild(false);
    const saved = this.persistProfileState();
    return { saved, deliveredFromGuildVault: vaultDelivery.delivered };
  }

  private persistProfileState(): boolean {
    const saved = savePlayerProfile(this.profile);
    if (!saved) {
      Logger.warn('Game:Profile', 'Não foi possível salvar o progresso localmente.');
    }
    return saved;
  }

  /**
   * Persists the complete expansion draft before replacing any live profile or
   * store state, so a storage failure cannot consume a Guild Token or a slot.
   */
  private purchaseGuildTokenBackpackExpansion(): string {
    const expansion = commitGuildTokenBackpackExpansion(
      this.profile,
      this.inventory,
      (candidate) => savePlayerProfile(candidate)
    );
    if (expansion.kind === 'insufficient-guild-tokens') {
      return 'São necessários 30 Token da Guilda para expandir a mochila.';
    }
    if (expansion.kind === 'capacity-maximum') {
      return 'A mochila já atingiu o limite de 60 espaços.';
    }

    if (expansion.kind === 'persistence-failed') {
      Logger.warn('Game:Profile', 'A expansão da mochila não pôde ser salva; nenhuma mudança foi aplicada.');
      return 'Não foi possível salvar a expansão. Nenhum Token foi consumido.';
    }
    return `Mochila expandida para ${expansion.backpackCapacity} espaços.`;
  }

  /** Commits a license candidate only after local persistence accepts the complete profile. */
  private purchaseBlacksmithWorkshopLicense(): BlacksmithLobbyActionResult {
    const { costLabel, durationLabel } = getBlacksmithLicensePresentation();
    const result = purchaseBlacksmithLicense(this.profile, Date.now());
    if (result.kind === 'insufficient-guild-tokens') {
      return { message: `São necessários ${costLabel} na mochila para a licença.` };
    }
    if (result.kind === 'license-active') {
      return { message: 'Sua licença da oficina ainda está ativa.' };
    }
    if (!savePlayerProfile(result.profile)) {
      Logger.warn('Game:Profile', 'A licença da oficina não pôde ser salva; nenhum Token foi consumido.');
      return { message: 'Não foi possível salvar a licença. Nenhum Token foi consumido.' };
    }
    Object.assign(this.profile, result.profile);
    this.inventory.commitProfile(result.profile);
    return { message: `Licença confirmada: a oficina está liberada por ${durationLabel}.` };
  }

  /** Persists the crafted-inventory candidate before synchronizing the live store. */
  private craftBlacksmithRecipe(recipeId: BlacksmithRecipeId): BlacksmithLobbyActionResult {
    const result = craftBlacksmithRecipe(this.profile, recipeId, Date.now());
    if (result.kind === 'license-expired') return { message: 'A licença da oficina expirou.' };
    if (result.kind === 'insufficient-materials') return { message: 'São necessários 10 de cada material comum para esta peça.' };
    if (result.kind === 'backpack-full') return { message: 'Não há espaço livre para guardar esta peça na mochila.' };
    if (result.kind === 'unknown-recipe') return { message: 'A receita selecionada não existe.' };
    if (!savePlayerProfile(result.profile)) {
      Logger.warn('Game:Profile', 'A peça forjada não pôde ser salva; nenhum material foi consumido.');
      return { message: 'Não foi possível salvar a peça. Nenhum material foi consumido.' };
    }
    Object.assign(this.profile, result.profile);
    this.inventory.commitProfile(result.profile);
    return {
      message: `${result.recipe.label} criada e guardada na mochila.`,
      craftedRecipeId: recipeId,
    };
  }

  private setupFinalBossRewardFlow(): void {
    this.finalBossRewards = new FinalBossRewardCoordinator({
      scene: this.scene,
      createChest: () => this.createFinalBossRewardChest(),
      onSettle: () => this.settleFinalBossCraftRewards(),
      onFinished: () => {
        this.hud.showVictoryScreen();
        this.victoryLobbyTransition.start();
      },
    });
  }

  private createFinalBossRewardChest(): RewardChest {
    if (this.rewardAssets.hasChest()) {
      return new RewardChest(this.rewardAssets.createChest());
    }
    Logger.warn(
      'Game:Rewards',
      'Modelo do baú indisponível; usando o baú de contingência para preservar o fluxo da recompensa.',
      this.rewardAssets.getChestError()
    );
    const model = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.82, metalness: 0.12 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xc89536, roughness: 0.42, metalness: 0.62 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 1.05), wood);
    base.position.y = 0.43;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.32, 1.1), wood);
    lid.position.y = 1.02;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.14), trim);
    band.position.y = 0.77;
    model.add(base, lid, band);
    return new RewardChest(model);
  }

  private settleFinalBossCraftRewards(): void {
    const loot = rollFinalBossLoot();
    const settled = settleFinalBossLoot(this.inventory, this.profile.guildVault, loot);
    this.profile.guildVault = settled.guildVault;
    const persistence = this.persistInventory();
    this.hud.showCraftRewardNotification(loot, settled.deferred, persistence.saved);
    Logger.info(
      'Game:Rewards',
      `Baú final transferido: ${settled.delivered.length} pilha(s) na mochila, ${settled.deferred.length} no Cofre da Guilda.`
    );
  }

  private getCharacterStats(): DerivedCharacterStats {
    const primaryWeaponId = getPrimaryWeaponId(this.profile.equipment);
    const weapon = primaryWeaponId === 'starter-sword'
      ? getWeaponDefinition('sword')
      : undefined;
    return deriveCharacterStats(attributesWithEquipment(this.profile.attributes, this.profile.equipment), {
      maxHealth: 100 + this.bonusMaxHealth,
      attackDamage: resolveEquippedBaseDamage(this.profile) + this.bonusAttackDamage,
      movementSpeed: 4.5,
      attackCooldown: weapon?.attackCooldownTime ?? 0.67,
    });
  }

  private applyCharacterBuild(healToFull: boolean): void {
    if (!this.player || !this.profile) return;
    this.synchronizeEquippedWeapon();
    const stats = this.getCharacterStats();
    const previousMax = this.player.maxHP;
    this.player.maxHP = stats.maxHealth;
    this.player.hp = healToFull
      ? stats.maxHealth
      : Math.min(stats.maxHealth, this.player.hp + Math.max(0, stats.maxHealth - previousMax));
    this.player.speed = stats.movementSpeed;
    this.player.attackDamage = stats.attackDamage;
    this.player.attackRange = WARRIOR_MAX_RANGE_METERS;
    this.player.attackCooldownTime = stats.attackCooldown;
  }

  private resolveOutgoingDamage(baseDamage: number, elemental: boolean): number {
    const stats = this.getCharacterStats();
    const chance = elemental ? stats.magicCriticalChance : stats.criticalAttackChance;
    return quantizeCombatDamage(
      baseDamage * (Math.random() < chance ? stats.criticalMultiplier : 1)
    );
  }

  private resolveIncomingDamage(damage: number): number {
    const stats = this.getCharacterStats();
    if (Math.random() < stats.dodgeChance) return 0;
    return quantizeCombatDamage(damage * (1 - stats.damageReduction));
  }

  /**
   * Life Steal returns part of the damage actually dealt as health. It is fed
   * by the post-mitigation number so healing tracks real damage, and the heal
   * never exceeds the missing health (no overheal).
   */
  private healFromLifeSteal(dealtDamage: number): void {
    if (!this.player || this.player.isDead || dealtDamage <= 0) return;
    const fraction = this.getCharacterStats().lifeStealFraction;
    if (fraction <= 0) return;
    const missing = this.player.maxHP - this.player.hp;
    if (missing <= 0) return;
    const previousHP = this.player.hp;
    this.player.hp = Math.min(this.player.maxHP, this.player.hp + dealtDamage * fraction);
    const recovered = this.player.hp - previousHP;
    // The HUD reads hp/maxHP every frame; the floating number is what tells the
    // player the heal came from the hit. Heals under 1 HP stay silent.
    if (recovered >= 1) this.showFloatingDamage(this.player.root.position, recovered, 'heal');
  }

  private openRpgOverlay(mode: RpgOverlayMode): void {
    if (!this.canAcceptGameplayInput()) return;
    this.flow.transition({ type: 'open-inventory' });
    this.inventoryOverlay.show(mode);
  }

  private closeRpgOverlay(): void {
    if (!this.rpgOverlayOpen) return;
    this.inventoryOverlay.hide();
    this.flow.transition({ type: 'close-overlay' });
  }

  private activateRpgOverlay(): void {
    this.rpgOverlayOpen = true;
    this.player.cancelMovement();
    this.input.setGameplayInputBlocked(true);
  }

  private deactivateRpgOverlay(): void {
    this.rpgOverlayOpen = false;
    this.input.setGameplayInputBlocked(false);
  }

  private dismissRpgOverlay(): void {
    if (!this.rpgOverlayOpen) return;
    this.inventoryOverlay.hide();
  }

  private canAcceptGameplayInput(): boolean {
    return this.flow.acceptsGameplayInput && !this.rpgOverlayOpen;
  }

  private tryActivateWarriorSkill(id: WarriorSkillId): void {
    if (!this.canAcceptGameplayInput()) return;
    if (!this.fatigue.canUseSkills) return;
    if (!isWarriorSkillUnlocked(id, this.profile.progression.level)) return;
    const activation = this.warriorSkills.tryActivate(id, {
      paused: false,
      dead: this.player.isDead,
      busy: this.player.isAttackInSwing(),
    });
    if (activation.kind !== 'activated') return;
    if (!this.player.tryStartSkillAttack(id)) this.warriorSkills.refund(id);
  }

  private spawnTrainingDummy(): void {
    const position = this.spawnPoint
      .clone()
      .add(new THREE.Vector3(0, 0, -6));
    this.trainingDummy = new TrainingDummy({ position });
    this.scene.add(this.trainingDummy.root);
    Logger.info(
      'Game:Test',
      `Boneco de treino em Z=${position.z}. Alcance da arma é mostrado pelo anel verde.`
    );
  }

  private spawnWaveRequest(
    request: WaveSpawnRequest
  ): readonly { id: string; role: WaveEntityRole }[] {
    return request.kind === 'regular-batch'
      || request.kind === 'mini-boss'
      ? this.spawnRegularBatch(request)
      : this.spawnFinalBattle(request);
  }

  private spawnRegularBatch(
    request: WaveSpawnRequest
  ): readonly { id: string; role: 'regular' | 'mini-boss' }[] {
    const batchCount = request.regularCount + request.miniBossCount;
    const points = selectBatchSpawnPoints(
      this.level.getWaveSpawnPoints(),
      this.player.root.position,
      batchCount,
      this.spawnCursor
    );
    if (points.length !== batchCount) {
      Logger.warn(
        'Game:Waves',
        `Não há ${batchCount} pontos seguros para o lote da fase ${request.phaseId}.`
      );
      return [];
    }
    this.spawnCursor += batchCount;

    const records: { id: string; role: 'regular' | 'mini-boss' }[] = [];
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const sequence = this.regularSpawnSequence++;
      const role = index < request.regularCount ? 'regular' : 'mini-boss';
      const id = `${request.phaseId}:${role}:${sequence}`;
      try {
        if (role === 'regular' && request.wave !== this.regularSpawnWave) {
          this.regularSpawnWave = request.wave;
          this.regularWaveSpawnIndex = 0;
        }
        const variant = role === 'regular'
          ? selectRegularEnemyVariant(request.wave ?? 1, this.regularWaveSpawnIndex++)
          : 'normal';
        const visual = variant === 'archer'
          ? this.enemyAssets.hasArcherEnemy()
            ? this.enemyAssets.createArcherEnemyVisual()
            : undefined
          : variant === 'guardian'
            ? this.enemyAssets.hasGuardianEnemy()
              ? this.enemyAssets.createGuardianEnemyVisual()
              : undefined
            : this.enemyAssets.hasRegularEnemy()
              ? this.enemyAssets.createRegularEnemyVisual()
              : undefined;
        const enemy = role === 'regular'
          ? variant === 'archer'
            ? createArcherEnemy(
              point,
              request.hpMultiplier,
              request.damageMultiplier,
              request.speedMultiplier,
              visual
            )
            : variant === 'guardian'
              ? createGuardianEnemy(
                point,
                request.hpMultiplier,
                request.damageMultiplier,
                request.speedMultiplier,
                visual
              )
            : createRegularEnemy(
              point,
              request.hpMultiplier,
              request.damageMultiplier,
              sequence,
              request.speedMultiplier,
              visual
            )
          : new Enemy(
              createMiniBossOptions(
                point,
                request.hpMultiplier,
                request.damageMultiplier,
                request.speedMultiplier
              ),
              visual
            );
        if (!this.combatRegistry.register({
          id,
          phaseId: request.phaseId,
          role,
          enemy,
        })) {
          Logger.warn('Game:Waves', `Registro duplicado rejeitado: ${id}.`);
          continue;
        }
        this.scene.add(enemy.root);
        records.push({ id, role });
      } catch (error) {
        Logger.error('Game:Waves', `Falha ao criar inimigo ${id}.`, error);
      }
    }
    return records;
  }

  private spawnFinalBattle(
    request: WaveSpawnRequest
  ): readonly { id: string; role: 'boss' | 'regular' }[] {
    const layout = this.level.getFinalBattleSpawnLayout();
    const records: { id: string; role: 'boss' | 'regular' }[] = [];

    if (request.bossCount > 0 && !this.combatRegistry.mainBoss) {
      const id = `${request.phaseId}:boss:0`;
      try {
        const boss = createBoss(
          layout.boss,
          this.bossAssets.hasBoss() ? this.bossAssets.createBossVisual() : undefined
        );
        if (this.combatRegistry.register({
          id,
          phaseId: request.phaseId,
          role: 'boss',
          enemy: boss,
        })) {
          this.scene.add(boss.root);
          this.bossSkills.reset();
          this.bossEffects.clear();
          this.bossEncounterActive = true;
          records.push({ id, role: 'boss' });
          this.hud.updateBossHealth(boss.hp, boss.maxHP);
          this.hud.showBossHealth();
        }
      } catch (error) {
        Logger.error('Game:Waves', `Falha ao criar boss ${id}.`, error);
      }
    }

    const occupiedRoots = this.combatRegistry.activeRoots();
    const allySlots = layout.miniBosses
      .filter((point) => occupiedRoots.every((root) => root.position.distanceTo(point) > 1.5))
      .slice(0, request.regularCount);
    for (const point of allySlots) {
      const sequence = this.regularSpawnSequence++;
      const id = `${request.phaseId}:final-regular:${sequence}`;
      try {
        const ally = createRegularEnemy(
          point,
          request.hpMultiplier,
          request.damageMultiplier,
          sequence,
          request.speedMultiplier,
          this.enemyAssets.hasRegularEnemy()
            ? this.enemyAssets.createRegularEnemyVisual()
            : undefined
        );
        if (!this.combatRegistry.register({
          id,
          phaseId: request.phaseId,
          role: 'regular',
          enemy: ally,
        })) {
          Logger.warn('Game:Waves', `Registro duplicado rejeitado: ${id}.`);
          continue;
        }
        this.scene.add(ally.root);
        records.push({ id, role: 'regular' });
      } catch (error) {
        Logger.error('Game:Waves', `Falha ao criar aliado normal ${id}.`, error);
      }
    }

    Logger.info(
      'Game:Waves',
      `Batalha final reconheceu ${records.length} nova(s) entidade(s).`
    );
    return records;
  }

  private fullRunReset(): void {
    if (this.resetInProgress) return;
    this.resetInProgress = true;
    try {
      this.victoryLobbyTransition.reset();
      this.finalBossRewards?.reset();
      this.combatRegistry.clear();
      this.stopMiniBossSkills();
      this.finalBattleSlots.reset();
      this.runProgression.reset();
      this.player.respawn(this.spawnPoint);
      this.player.setInputLocked(false);
      this.player.speedMultiplier = 1;
      this.player.setImmortal(false);
      this.warriorSkills.reset();
      this.fatigue.reset();
      this.cameraController.setAdminMode(false);
      this.adminPanel?.resetToggles();
      this.healthPlasma.clear();
      this.archerProjectiles.clear();
      this.stopBossSkills();
      this.targetedEnemyRoot = null;
      this.clearTargetMarker();
      // Zera os bônus temporários da run e reaplica a build permanente.
      this.bonusAttackDamage = 0;
      this.bonusMaxHealth = 0;
      if (WEAPON_TEST_MODE && this.trainingDummy) {
        // reposiciona o player longe do dummy após reset
      }
      this.input.reset();
      this.spawnCursor = 0;
      this.regularSpawnSequence = 0;
      this.regularSpawnWave = null;
      this.regularWaveSpawnIndex = 0;
      this.hud.hideDeathScreen();
      this.hud.hideVictoryScreen();
      this.hud.hideCraftRewardNotification();
      this.hud.hideBossHealth();
      this.hud.hideWaveStatus();
      this.applyCharacterBuild(true);
      if (this.player.equippedWeaponId !== null) this.runProgression.weaponEquipped();
      this.flow.state = 'playing';
      Logger.info('Game:Waves', 'Partida reiniciada preservando o equipamento salvo.');
    } finally {
      requestAnimationFrame(() => {
        this.resetInProgress = false;
      });
    }
  }

  private getEnemyMeshObjects(): THREE.Object3D[] {
    const roots = [...this.combatRegistry.activeRoots()];
    if (this.trainingDummy) roots.push(this.trainingDummy.root);
    return roots;
  }

  private handleMouseInput() {
    if (!this.canAcceptGameplayInput()) return;
    if (this.input.leftClicked && !this.player.isDead) {
      this.raycaster.setFromCamera(this.input.clickedMouse, this.cameraController.camera);

      const enemyObjects = this.getEnemyMeshObjects();
      const dummyHit =
        this.trainingDummy &&
        this.raycaster.intersectObject(this.trainingDummy.root, true).length > 0;

      if (dummyHit) {
        Logger.debug('Game', 'Raycast atingiu o boneco de treino -> atacando');
        this.player.attackEnemy(
          this.trainingDummy!.root,
          (target) => this.onPlayerHitEnemy(target)
        );
        return;
      }

      const enemyHits = this.raycaster.intersectObjects(enemyObjects, true);

      if (enemyHits.length > 0) {
        let obj: THREE.Object3D | null = enemyHits[0].object;
        while (obj && !obj.userData.isEnemyRoot) obj = obj.parent;
        if (obj) {
          Logger.debug('Game', 'Raycast atingiu inimigo -> iniciando ataque');
          this.player.attackEnemy(obj, (target) => this.onPlayerHitEnemy(target));
        }
      } else {
        const groundHits = this.raycaster.intersectObjects(this.level.groundMeshes, true);
        if (groundHits.length > 0) {
          const clickPoint = groundHits[0].point;

          const trainingDummy = this.trainingDummy;
          const groundClickAction = resolveGroundClickCombatAction(
            trainingDummy
              ? clickPoint.distanceTo(trainingDummy.root.position)
              : null
          );
          if (groundClickAction === 'attack-training-dummy' && trainingDummy) {
            Logger.debug('Game', 'Clique perto do boneco -> atacando boneco');
            this.player.attackEnemy(
              trainingDummy.root,
              (target) => this.onPlayerHitEnemy(target)
            );
            return;
          }

          Logger.debug('Game', 'Raycast atingiu o chão -> atacando sem alvo');
          this.player.attackAtCursor();
        } else {
          Logger.warn('Game', 'Raycast não atingiu nada.');
        }
      }
    }

  }

  private handleKeyboardInput(delta: number) {
    if (!this.canAcceptGameplayInput()) return;
    if (this.player.isDead) {
      this.player.setKeyboardMoving(false);
      return;
    }

    const movementInput = readMovementInput(this.input.keys);

    const horizontalInput = new THREE.Vector2(
      movementInput.horizontal,
      movementInput.vertical
    );
    this.cameraController.camera.getWorldDirection(this.playerBodyTarget);
    this.keyboardDir.copy(resolveCameraRelativeMovement(horizontalInput, this.playerBodyTarget));

    const isMoving = this.keyboardDir.lengthSq() > 0;
    const preserveMarkedAttack = this.isFocusedTargetInRange();
    this.player.setKeyboardMoving(isMoving);
    if (this.input.wasKeyPressed('shift')) this.player.tryDash(this.keyboardDir);
    if (movementInput.hasIntent) this.player.cancelClickMovement();
    if (isMoving) {
      this.player.moveByDirection(
        this.keyboardDir,
        delta,
        preserveMarkedAttack
      );
    }

    // Tecla de teste: pressione H para simular dano e testar a animação "hit"
    if (this.input.wasKeyPressed('h')) {
      Logger.debug('Game', 'Tecla H pressionada -> testando animação "hit" (10 de dano)');
      this.player.takeDamage(10);
      if (this.player.isDead) this.hud.showDeathScreen();
    }

    // Tecla de teste: pressione K para simular morte instantânea e testar "morreu"
    if (this.input.wasKeyPressed('k')) {
      Logger.debug('Game', 'Tecla K pressionada -> testando animação "morreu" (dano fatal)');
      this.player.takeDamage(9999);
      if (this.player.isDead) this.hud.showDeathScreen();
    }

    // Target: Q marca o monstro mais próximo como alvo focado
    if (this.input.wasKeyPressed('q')) {
      this.cycleTarget();
    }

    for (const skill of WARRIOR_SKILLS) {
      if (this.input.wasKeyPressed(this.profile.hotkeys[skill.id])) {
        this.tryActivateWarriorSkill(skill.id);
        break;
      }
    }
  }

  private async returnToLobbyAfterVictory(): Promise<void> {
    if (this.flow.state !== 'victory') return;
    this.running = false;
    this.flow.transition({ type: 'return-to-lobby' });
    this.player.setInputLocked(true);
    this.input.reset();
    this.hud.hideVictoryScreen();
    this.hud.hideCraftRewardNotification();
    this.hud.setGameplayVisible(false);
    try {
      if (!persistVictoryReset(this.profile, this.inventory, () => {
        return this.persistProfileState();
      })) {
        throw new Error('Não foi possível salvar o reset da expedição.');
      }
      const lobby = new LobbyScreen(
        this.renderer,
        this.canvas,
        this.characterAssets,
        this.profile,
        this.inventory
      );
      await lobby.show({
        firstRun: false,
        onClassConfirmed: () => undefined,
        onGuildTokenBackpackExpansion: () => this.purchaseGuildTokenBackpackExpansion(),
        onHotkeysChanged: () => this.persistProfileState(),
        onAutoBasicAttackChanged: () => this.persistProfileState(),
        onLobbyInventoryChanged: () => this.persistInventory(),
        onBlacksmithLicensePurchase: () => this.purchaseBlacksmithWorkshopLicense(),
        onBlacksmithCraft: (recipeId) => this.craftBlacksmithRecipe(recipeId),
      });
      this.hud.setHotkeys(this.profile.hotkeys);
      this.flow.transition({ type: 'start-game' });
      this.hud.showLoadingScreen(70, 'Preparando nova expedição...');
      this.fullRunReset();
      this.hud.setGameplayVisible(true);
      this.hud.hideLoadingScreen();
      this.clock.start();
      this.running = true;
      this.loop();
    } catch (error) {
      Logger.error('Game:Flow', 'Falha ao retornar automaticamente ao lobby.', error);
      this.victoryLobbyTransition.start();
      this.hud.setGameplayVisible(true);
      this.flow.state = 'victory';
      this.running = true;
      this.loop();
    }
  }

  private handleFlowInput(): void {
    if (!this.canAcceptGameplayInput()) return;
    if (this.input.wasKeyPressed('i')) {
      this.openRpgOverlay('backpack');
      return;
    }
  }

  /** Indicador visual do alvo marcado (anel no chão do monstro) */
  private targetMarker: THREE.Mesh | null = null;
  private targetedEnemyRoot: THREE.Object3D | null = null;

  /** Q = marcar/alternar alvo: escolhe o monstro vivo mais próximo do player. */
  private cycleTarget(): void {
    const enemies = this.combatRegistry
      .activeRoots()
      .filter((root) => {
        const record = this.combatRegistry.findByRoot(root);
        return record && !record.enemy.isDead;
      })
      .sort(
        (a, b) =>
          a.position.distanceTo(this.player.root.position) -
          b.position.distanceTo(this.player.root.position)
      );

    if (enemies.length === 0) {
      Logger.debug('Game:Target', 'Nenhum monstro vivo para marcar.');
      this.clearTargetMarker();
      return;
    }

    // alterna entre os dois mais próximos a cada press de Q
    const currentIndex = this.targetedEnemyRoot
      ? enemies.indexOf(this.targetedEnemyRoot)
      : -1;
    const next = enemies[(currentIndex + 1) % Math.min(enemies.length, 2)];

    this.targetedEnemyRoot = next;
    this.updateTargetMarker(next);
    const record = this.combatRegistry.findByRoot(next);
    Logger.info(
      'Game:Target',
      `Alvo focado (${record?.role ?? '?'}). Distância: ${next.position.distanceTo(this.player.root.position).toFixed(1)}m.`
    );
  }

  /** Ataca automaticamente somente quando a opção está ativa e o alvo marcado é válido. */
  private updateAutoAttack(): void {
    const situation = this.focusedTargetSituation();
    if (
      this.targetedEnemyRoot
      && situation
      && situation.targetAlive
    ) {
      // O deslocamento continua, mas o corpo permanece orientado para o target.
      this.player.faceTargetInstantly(this.targetedEnemyRoot.position);
    }
    if (
      this.targetedEnemyRoot
      && situation
      && shouldStartAutoAttack({ ...situation, automaticAttackEnabled: this.profile.autoBasicAttack })
    ) {
      this.player.attackEnemy(this.targetedEnemyRoot, (enemy) => this.onPlayerHitEnemy(enemy));
    }
  }

  private updateTargetMarker(enemyRoot: THREE.Object3D): void {
    this.clearTargetMarker();
    const geo = new THREE.RingGeometry(0.62, 0.68, 40);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8899bb,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const marker = new THREE.Mesh(geo, mat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.06;
    enemyRoot.add(marker);
    this.targetMarker = marker;
  }

  private clearTargetMarker(): void {
    if (this.targetMarker) {
      this.targetMarker.removeFromParent();
      this.targetMarker = null;
    }
  }

  private onPlayerHitEnemy(target: THREE.Object3D): void {
    // boneco de treino: registra o golpe, mostra dano, nunca morre
    if (this.trainingDummy) {
      let obj: THREE.Object3D | null = target;
      while (obj && !obj.userData.isTrainingDummy) obj = obj.parent;
      if (obj === this.trainingDummy.root || target === this.trainingDummy.root) {
        const damage = this.player.attackDamage;
        this.trainingDummy.takeDamage(damage);
        this.showFloatingDamage(
          this.trainingDummy.root.position,
          damage
        );
        return;
      }
    }

    const record = this.combatRegistry.findByRoot(target);
    if (!record || record.enemy.isDead) return;

    const bodyRadius = 0.6 * (Number(record.enemy.root.userData.enemyBodyScale) || 1);
    const distance = getEffectiveTargetDistance(
      this.player.root.position.distanceTo(record.enemy.root.position),
      bodyRadius
    );
    const stats = this.getCharacterStats();
    const physicalDamage = getTypedAttackBaseDamage(
      this.player.attackDamage,
      stats.physicalDamageMultiplier,
      false
    );
    const rangedDamage = applyDistanceFalloff(physicalDamage, distance, 'warrior');
    const damage = this.resolveOutgoingDamage(rangedDamage, false);
    if (damage <= 0) return;
    record.enemy.takeDamage(damage);
    this.healFromLifeSteal(damage);
    this.showFloatingDamage(target.position, damage);
    if (record.role === 'boss') {
      const values = getBossHealthHudValues(record.enemy);
      this.hud.updateBossHealth(values.hp, values.maxHP);
    }

    if (record.enemy.isDead) this.handleEnemyDeath(record);
  }

  private onWarriorSkillHit(event: WarriorSkillHitEvent): void {
    if (!isWarriorSkillUnlocked(event.attackId, this.profile.progression.level)) return;
    const records = this.combatRegistry.activeRoots()
      .map((root) => this.combatRegistry.findByRoot(root))
      .filter((record): record is CombatRecord => record !== null);
    const skill = getWarriorSkill(event.attackId);
    const area = getWarriorSkillArea(event.attackId);
    const elemental = skill.element !== null;
    const baseDamage = getTypedAttackBaseDamage(
      getWarriorSkillDamage(this.player.attackDamage) * warriorSkillDamageMultiplier(event.attackId),
      this.getCharacterStats().physicalDamageMultiplier,
      elemental
    );
    const targets = resolveWarriorAreaTargets(
      records,
      event,
      area
    );
    const damageOrigin = resolveWarriorSkillAreaCenter(event.origin, event.forward, area);

    let lifeStealDamage = 0;
    for (const record of targets) {
      const distance = damageOrigin.distanceTo(record.enemy.root.position);
      const rangedDamage = applyDistanceFalloff(baseDamage, distance, 'warrior');
      const damage = this.resolveOutgoingDamage(rangedDamage, elemental);
      if (damage <= 0) continue;
      lifeStealDamage += damage;
      record.enemy.takeDamage(damage);
      if (skill.element && !record.enemy.isDead) {
        record.enemy.applyElementalHit(skill.element, Math.max(1, damage * 0.12));
      }
      this.showFloatingDamage(record.enemy.root.position, damage);
      if (record.role === 'boss') {
        const values = getBossHealthHudValues(record.enemy);
        this.hud.updateBossHealth(values.hp, values.maxHP);
      }
      if (record.enemy.isDead) this.handleEnemyDeath(record);
    }
    this.healFromLifeSteal(lifeStealDamage);
  }

  private handleEnemyDeath(record: CombatRecord): void {
    const target = record.enemy.root;
    const death = this.combatRegistry.reportDeath(target);
    if (!death) return;
    const experienceWave = this.runProgression.snapshot.wave;
    const earnsCampaignExperience = this.runProgression.snapshot.phase === 'regular-wave' || death.role === 'boss';
    if (record.role === 'boss') this.stopBossSkills();
    if (!this.runProgression.enemyDefeated(death.id, death.phaseId)) return;
    this.applyKillRewards(record.role, record.enemy);
    if (this.targetedEnemyRoot === target) {
      this.targetedEnemyRoot = null;
      this.clearTargetMarker();
    }
    this.player.clearAttackTarget();
    if (earnsCampaignExperience) {
      Object.assign(this.profile, awardPlayerExperience(this.profile, death.role, experienceWave));
    }
    this.persistProfileState();
    this.hud.updateProgression(this.profile.progression, this.profile.attributePointsRemaining);
  }

  /** Recompensas por abate: cura e bônus de dano acumulativo */
  private applyKillRewards(
    role: WaveEntityRole,
    enemy: import('../entities/Enemy').Enemy
  ): void {
    const weaponId = this.player.equippedWeaponId;
    if (weaponId !== 'sword' && weaponId !== 'axe') return;
    const reward = getKillReward(role, this.player.maxHP, weaponId);
    if (reward.maxHpBonus > 0) {
      const health = addMaxHealthBonus(
        this.player.hp,
        this.player.maxHP,
        reward.maxHpBonus
      );
      this.player.hp = health.hp;
      this.player.maxHP = health.maxHP;
      this.bonusMaxHealth += reward.maxHpBonus;
    }
    this.bonusAttackDamage = addDamageBonus(
      this.bonusAttackDamage,
      reward.damageBonus
    );
    this.applyCharacterBuild(false);

    if (reward.healAmount > 0) {
      const bodyScale = Number(enemy.root.userData.enemyBodyScale) || 1;
      const plasmaOrigin = enemy.root.position.clone();
      plasmaOrigin.y += bodyScale * 1.1;
      this.healthPlasma.spawn(plasmaOrigin, reward.healAmount);
    }

    Logger.info(
      'Game:Kill',
      `${role} derrotado: plasma=${reward.healAmount} HP, +${reward.damageBonus} dano, +${reward.maxHpBonus} HP máximo.`
    );
  }

  private updateHealthPlasma(delta: number): void {
    this.playerBodyTarget.copy(this.player.root.position);
    this.playerBodyTarget.y += 1.1;
    this.healthPlasma.update(delta, this.playerBodyTarget, (healAmount) => {
      if (this.player.isDead) return;
      const previousHP = this.player.hp;
      this.player.hp = Math.min(this.player.maxHP, this.player.hp + healAmount);
      const recovered = this.player.hp - previousHP;
      if (recovered > 0) {
        this.showFloatingDamage(this.player.root.position, recovered, 'heal');
      }
    });
  }

  private showFloatingDamage(
    worldPos: THREE.Vector3,
    amount: number,
    variant: FloatingDamageVariant = 'damage'
  ) {
    const pos = worldPos.clone();
    pos.y += 1.6;
    const screenPos = pos.project(this.cameraController.camera);
    const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
    this.hud.spawnFloatingDamage(
      x,
      y,
      variant === 'heal' ? formatHealingAmount(amount) : `-${quantizeCombatDamage(amount)}`,
      variant
    );
  }

  private updateCombatEntities(delta: number): void {
    this.updateMiniBossSkills(delta);
    this.archerProjectiles.update(delta, (hit) => {
      this.onEnemyHitPlayer(hit.damage, 'regular', hit.distance, true);
    });
    this.combatRegistry.update(
      delta,
      this.player.root.position,
      (damage, role, distance) => this.onEnemyHitPlayer(damage, role, distance),
      this.level.navigationObstacles,
      (record, damage) => this.showFloatingDamage(record.enemy.root.position, damage),
      (_record, attack) => this.archerProjectiles.fire(attack)
    );
    for (const record of this.combatRegistry.unreportedDeaths()) {
      this.handleEnemyDeath(record);
    }
    const boss = this.combatRegistry.mainBoss;
    if (boss) {
      const values = getBossHealthHudValues(boss);
      this.hud.updateBossHealth(values.hp, values.maxHP);
    }
  }

  private onEnemyHitPlayer(
    damage: number,
    role: WaveEntityRole,
    distance: number,
    isRangedAttack = false
  ): void {
    const weaponId = this.player.equippedWeaponId;
    if (
      (weaponId === 'sword' || weaponId === 'axe') &&
      isAttackBlocked(role, weaponId, Math.random())
    ) {
      Logger.info('Game:Defense', `${weaponId} bloqueou um ataque de monstro normal.`);
      return;
    }
    const rangedDamage = !isRangedAttack && (role === 'regular' || role === 'mini-boss')
      ? applyDistanceFalloff(damage, distance, role)
      : damage;
    const deliveredDamage = this.resolveIncomingDamage(rangedDamage);
    if (deliveredDamage <= 0) return;
    const hpBeforeHit = this.player.hp;
    this.player.takeDamage(deliveredDamage);
    this.showDamageTaken(deliveredDamage, hpBeforeHit);
    this.afterEnemyHitPlayer(hpBeforeHit, role);
  }

  private onBossSkillHitPlayer(damage: number): void {
    const deliveredDamage = this.resolveIncomingDamage(damage);
    if (deliveredDamage <= 0) return;
    const hpBeforeHit = this.player.hp;
    this.player.takeBossSkillDamage(deliveredDamage);
    this.showDamageTaken(deliveredDamage, hpBeforeHit);
    this.afterEnemyHitPlayer(hpBeforeHit, 'boss');
  }

  private onMiniBossSkillHitPlayer(damage: number): void {
    const deliveredDamage = this.resolveIncomingDamage(damage);
    if (deliveredDamage <= 0) return;
    const hpBeforeHit = this.player.hp;
    this.player.takeBossSkillDamage(deliveredDamage);
    this.showDamageTaken(deliveredDamage, hpBeforeHit);
    this.afterEnemyHitPlayer(hpBeforeHit, 'mini-boss');
  }

  /**
   * Prints the damage that actually reached the health bar. The number is the
   * one Defense and the block rolls already reduced, so the player can read the
   * effect of the equipment instead of guessing it from the bar.
   */
  private showDamageTaken(deliveredDamage: number, hpBeforeHit: number): void {
    if (deliveredDamage <= 0 || this.player.hp >= hpBeforeHit) return;
    this.showFloatingDamage(this.player.root.position, deliveredDamage, 'taken');
  }

  private afterEnemyHitPlayer(
    hpBeforeHit: number,
    role: WaveEntityRole
  ): void {
    if (this.player.hp < hpBeforeHit) {
      const penalty = getHitDamagePenalty(role);
      if (penalty > 0) {
        this.bonusAttackDamage = removeDamageBonus(
          this.bonusAttackDamage,
          penalty
        );
        this.applyCharacterBuild(false);
        Logger.info(
          'Game:DamageBonus',
          `${role} acertou o jogador: -${penalty.toFixed(1)} do bônus de dano.`
        );
      }
    }
    if (this.player.isDead) {
      this.dismissRpgOverlay();
      this.healthPlasma.clear();
      this.archerProjectiles.clear();
      this.stopBossSkills();
      this.player.setInputLocked(true);
      this.hud.showDeathScreen();
      this.flow.transition({ type: 'player-died' });
    }
  }

  private clampPlayerToArena() {
    this.player.root.position.x = THREE.MathUtils.clamp(
      this.player.root.position.x,
      -this.worldLimit,
      this.worldLimit
    );
    this.player.root.position.z = THREE.MathUtils.clamp(
      this.player.root.position.z,
      -this.worldLimit,
      this.worldLimit
    );
  }

  private onResize() {
    this.cameraController.setAspect(window.innerWidth / window.innerHeight);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private getPerformanceContext(): FramePerformanceContext {
    const entityCounts = this.combatRegistry.diagnostics;
    const input = this.input.getSnapshot();
    const memory = (performance as Performance & {
      memory?: { usedJSHeapSize: number };
    }).memory;

    return {
      ...entityCounts,
      healthPlasmas: this.healthPlasma.activeCount,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      heapUsedMB: memory
        ? Number((memory.usedJSHeapSize / (1024 * 1024)).toFixed(1))
        : null,
      tabVisibility: document.visibilityState,
      playerAnimation: this.player?.state ?? 'loading',
      input: {
        ...input,
        movementSource: input.movement.hasIntent
          ? 'keyboard'
          : this.player?.moveTarget
            ? 'click'
            : 'none',
      },
      runtimeWarriorBudget: this.player?.runtimeWarriorBudget ?? null,
    };
  }

  private recordFramePerformance(frameMs: number): void {
    const reports = this.performanceMonitor.sample(
      frameMs,
      performance.now(),
      () => this.getPerformanceContext()
    );
    for (const report of reports) {
      if (report.kind === 'stall') {
        Logger.warn(
          'Game:Performance',
          `Frame longo detectado: ${report.frameMs.toFixed(1)} ms (${report.averageFps.toFixed(1)} FPS na janela).`,
          report
        );
      } else {
        Logger.debug(
          'Game:Performance',
          `Resumo de 10s: ${report.averageFps.toFixed(1)} FPS; pior frame ${report.worstFrameMs.toFixed(1)} ms; ${report.longFrameCount} frame(s) longo(s).`,
          report
        );
      }
    }
  }

  private isFocusedTargetInRange(): boolean {
    const situation = this.focusedTargetSituation();
    return situation ? isMarkedTargetInRange(situation) : false;
  }

  private focusedTargetSituation(): AutoAttackSituation | null {
    if (!this.targetedEnemyRoot) return null;
    const record = this.combatRegistry.findByRoot(this.targetedEnemyRoot);
    if (!record) return null;
    return {
      hasTarget: true,
      targetAlive: !record.enemy.isDead,
      distance: getMarkedTargetSurfaceDistance(
        this.targetedEnemyRoot.position.distanceTo(this.player.root.position),
        Number(record.enemy.root.userData.enemyBodyScale)
      ),
      attackRange: this.player.attackRange,
      isSwinging: this.player.isAttackInSwing(),
    };
  }

  private updateBossSkills(delta: number): void {
    const boss = this.combatRegistry.mainBoss;
    if (!boss) {
      if (this.bossEncounterActive) this.stopBossSkills();
      return;
    }

    const distance = boss.root.position.distanceTo(this.player.root.position);
    const activeCast = this.bossSkills.phase === 'telegraph'
      || this.bossEffects.activeObjectCount > 0;
    const mode = decideBossCombatMode(
      distance,
      this.player.attackRange,
      activeCast
    );
    boss.setBossMovementLocked(mode !== 'follow');
    boss.attackRange = mode === 'melee'
      ? bossMeleeRange(this.player.attackRange)
      : -1;

    if (!shouldUpdateBossSkills(mode)) {
      if (shouldClearBossTelegraph(mode, activeCast)) {
        this.bossSkills.reset();
        this.bossEffects.clear();
      }
      return;
    }

    const frame = this.bossSkills.update(
      delta,
      boss.root.position,
      this.player.root.position
    );
    for (const event of frame.events) {
      if (event.type === 'telegraph') {
        boss.playSkillAnimation(event.skill, event.secondsUntilImpact);
      }
      this.bossEffects.handle(event);
      Logger.info(
        'Boss:Skill',
        `${event.skill}: ${event.type === 'telegraph' ? 'aviso iniciado' : 'impacto'}.`
      );
    }
    if (frame.damage > 0) {
      this.onBossSkillHitPlayer(frame.damage);
    }
    this.bossEffects.update(delta);
  }

  private updateMiniBossSkills(delta: number): void {
    const activeIds = new Set<string>();
    for (const root of this.combatRegistry.activeRoots()) {
      const record = this.combatRegistry.findByRoot(root);
      if (!record || record.role !== 'mini-boss') continue;
      activeIds.add(record.id);
      let controller = this.miniBossSkillControllers.get(record.id);
      if (!controller) {
        controller = new MiniBossSkillController(Math.random, record.id);
        this.miniBossSkillControllers.set(record.id, controller);
      }
      const frame = controller.update(
        delta,
        root.position,
        this.player.root.position,
        record.enemy.damage
      );
      for (const event of frame.events) this.miniBossEffects.handle(event);
      if (frame.damage > 0) {
        this.onMiniBossSkillHitPlayer(frame.damage);
      }
    }
    for (const id of this.miniBossSkillControllers.keys()) {
      if (activeIds.has(id)) continue;
      this.miniBossSkillControllers.delete(id);
      this.miniBossEffects.clear(id);
    }
    this.miniBossEffects.update(delta);
  }

  private stopMiniBossSkills(): void {
    this.miniBossSkillControllers.clear();
    this.miniBossEffects.clear();
  }

  private stopBossSkills(): void {
    this.bossSkills.reset();
    this.bossEffects.clear();
    this.bossEncounterActive = false;
  }

  private loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);

    try {
      const rawDelta = this.clock.getDelta();
      const delta = Math.min(rawDelta, 0.1);
      this.victoryLobbyTransition.update(delta);
      if (!this.running) return;
      this.handleFlowInput();
      this.elapsedTime += delta;

      if (this.input.consumeMovementReset()) {
        this.player.cancelClickMovement();
        this.player.setKeyboardMoving(false);
      }
      this.handleMouseInput();
      this.handleKeyboardInput(delta);
      this.input.postUpdate();
      this.updateAutoAttack();
      this.player.update(delta);
      const fatigue = this.fatigue.update(delta, this.player.currentMoveSpeed > 0.05);
      this.updateHealthPlasma(delta);
      this.warriorSkills.update(delta, false);
      this.hud.setActiveAnimationTest(this.player.activeAnimationPreview);
      this.clampPlayerToArena();
      if (!WEAPON_TEST_MODE) {
        this.updateBossSkills(delta);
        this.updateCombatEntities(delta);
        this.runProgression.update(delta);
        this.finalBossRewards?.update(delta);
        this.adminPanel?.update(
          this.runProgression.snapshot,
          this.combatRegistry.mainBoss !== null
        );
      } else {
        this.trainingDummy?.update(delta);
        // alcance do jogador acompanha a arma equipada (teste de distância)
        const weaponDef = getWeaponDefinition(this.player.equippedWeaponId);
        if (weaponDef && this.trainingDummy) {
          this.player.attackRange = weaponDef.attackRange;
          this.player.attackDamage = weaponDef.attackDamage;
          this.player.attackCooldownTime = weaponDef.attackCooldownTime;
          this.trainingDummy.setWeaponRange(weaponDef.attackRange);
          const inReach =
            this.player.root.position.distanceTo(this.trainingDummy.root.position) <=
            weaponDef.attackRange;
          this.trainingDummy.setRangeColor(inReach ? 0x44ff88 : 0xff5544);
        }
      }
      this.level.update(this.elapsedTime, this.player.root.position);

      this.lightingRig?.update(
        this.player.root.position,
        this.combatRegistry.mainBoss?.root.position ?? null
      );

      this.cameraController.update(this.player.root.position, delta);
      this.hud.updatePlayerHealth(this.player.hp, this.player.maxHP);
      this.hud.updatePlayerFatigue(fatigue, MAX_FATIGUE);
      const skills = this.warriorSkills.snapshot();
      this.player.mana = skills.energy;
      this.player.maxMana = skills.maxEnergy;
      const skillLock = this.player.isDead
        ? 'dead'
        : !this.canAcceptGameplayInput()
          ? 'unavailable'
          : !this.fatigue.canUseSkills
            ? 'fatigue-exhausted'
          : this.player.isAttackInSwing()
            ? 'busy'
            : null;
      this.hud.updateWarriorSkills(skills, skillLock, this.profile.progression.level);

      this.renderer.render(this.scene, this.cameraController.camera);
      this.recordFramePerformance(rawDelta * 1000);
    } catch (err) {
      Logger.error('Game', 'Erro no loop principal do jogo (frame ignorado).', err);
    }
  };
}
