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
  type PlayableCharacterId,
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
import { getBossHealthHudValues, resolveBossBarLayer } from '../ui/BossHealthView';
import {
  BASE_BOSS_DAMAGE,
  BASE_BOSS_SPEED,
  countEquippedArmorPieces,
  equipmentHpMultiplier,
  getBossEnrageStats,
  getBossMinionComposition,
  getBossMinionTier,
} from '../waves/WaveDifficultyScaling';
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
import { AdminCommandGate, type AdminSpawnRole } from '../admin/AdminCommandGate';
import { AdminGameActions } from '../admin/AdminGameActions';
import { AdminPanel } from '../admin/AdminPanel';
import {
  awardPlayerExperience,
  getPrimaryWeaponId,
  loadPlayerProfile,
  resetRunProgression,
  savePlayerProfile,
  syncStarterWeaponToClass,
  type InventoryStack,
  type PlayerProfile,
} from '../profile/PlayerProfile';
import { InventoryStore } from '../inventory/InventoryStore';
import { getInventoryItem } from '../inventory/InventoryCatalog';
import { commitGuildTokenBackpackExpansion } from '../inventory/BackpackExpansion';
import {
  craftBlacksmithRecipe,
  findBlacksmithRecipe,
  getBlacksmithLicensePresentation,
  purchaseBlacksmithLicense,
  type BlacksmithRecipeId,
} from '../crafting/BlacksmithWorkshop';
import { craftLineMaterialCost } from '../crafting/CraftLine';
import { RewardChest } from '../entities/RewardChest';
import { GameFlowController } from './GameFlowController';
import { FinalBossRewardCoordinator } from '../rewards/FinalBossRewardCoordinator';
import {
  deliverGuildVault,
  rollFinalBossLoot,
  settleFinalBossLoot,
} from '../rewards/FinalBossLoot';
import { WarriorSkillController, type WarriorSkillsSnapshot } from '../combat/WarriorSkillController';
import { FatigueMeter, MAX_FATIGUE, DASH_FATIGUE_COST } from '../combat/FatigueMeter';
import { mageBasicAttackManaCost, mageSkillFatiguePercent } from '../combat/MageSkillCost';
import { firstColumnHit, mageSkillAttackId } from '../combat/MageSpellFlight';
import { isInsideMageSkillRadius, mageSkillImpactEffect } from '../combat/MageSkillImpact';
import {
  MAGE_TELEPORT_FATIGUE_PERCENT,
  mageTeleportManaCost,
  resolveMageTeleportDestination,
} from '../entities/MageTeleport';
import type { MageSpellId } from '../vfx/VFXTypes';
import { MAGE_VFX_LIMITS } from '../vfx/VFXConfig';
import { VFXLightPool } from '../vfx/VFXLightPool';
import {
  getWarriorSkill,
  isWarriorSkillUnlocked,
  warriorSkillDamageMultiplier,
  WARRIOR_SKILLS,
  type WarriorSkillId,
} from '../combat/WarriorSkillCatalog';
import { LobbyScreen, type BlacksmithLobbyActionResult, type LobbyRunMode } from '../ui/LobbyScreen';
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
  MAGE_MAX_RANGE_METERS,
  type DistanceFalloffProfile,
} from '../combat/DistanceDamage';
import { getTypedAttackBaseDamage, quantizeCombatDamage } from '../combat/CombatDamage';
import { MiniBossSkillController } from '../combat/MiniBossSkillController';
import { MiniBossSkillEffects } from '../effects/MiniBossSkillEffects';
import { deriveCharacterStats, type DerivedCharacterStats } from '../profile/CharacterAttributes';
import { attributesWithEquipment, equippedWeaponDamage } from '../equipment/EquipmentStatBonuses';
import { resolveCameraRelativeMovement } from '../entities/PlayerMovement';
import { VictoryLobbyTransition } from './VictoryLobbyTransition';
import { MageVFX } from '../vfx/MageVFX';

/**
 * MODO DE TESTE DE ARMA/ANIMAÇÃO: quando true, desativa o spawn de monstros
 * e mostra um boneco de treino no lugar. Definir como false para jogar
 * o fluxo normal com ondas de monstros e boss final.
 */
const WEAPON_TEST_MODE = false;
const ADMIN_TEST_ENEMY_PREFIX = 'admin-test';
const ADMIN_TEST_PHASE_ID = -777;
const MAGE_SKILL_RANGE_SCALE = MAGE_MAX_RANGE_METERS / WARRIOR_MAX_RANGE_METERS;

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
  /** Id do mini-boss dono da barra de vida visivel no HUD. */
  private miniBossBarId: string | null = null;
  private readonly miniBossEffects = new MiniBossSkillEffects(this.scene);
  private readonly vfxLightPool = new VFXLightPool(this.scene, MAGE_VFX_LIMITS.maxTemporaryLights);
  private readonly mageVFX = new MageVFX(this.scene, { lightPool: this.vfxLightPool });
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
  private lastBossMinionTier: 1 | 2 | 3 = 1;
  private readonly victoryLobbyTransition = new VictoryLobbyTransition(
    5,
    () => { void this.returnToLobbyAfterVictory(); }
  );
  private readonly deathLobbyTransition = new VictoryLobbyTransition(
    4,
    () => { void this.returnToLobbyAfterDeath(); }
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
  private adminSpawnSequence = 0;
  private resetInProgress = false;
  private pendingRunMode: LobbyRunMode = 'campaign';
  private activeRunMode: LobbyRunMode = 'campaign';

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
    this.mageVFX.setDebug(this.adminEnabled);
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
      // Classes are separate: the Guerreiro keeps the sword and the Maga the
      // cajado, even when an older save still carried the other starter.
      Object.assign(this.profile, syncStarterWeaponToClass(this.profile));
      Object.assign(this.profile, resetRunProgression(this.profile));
      this.persistProfileState();
      this.inventory = InventoryStore.fromProfile(this.profile);
      // The administrator can add inventory items before entering the dungeon.
      this.setupAdminTools();
      this.flow = new GameFlowController(
        profileResult.kind === 'loaded' ? 'lobby' : 'class-select'
      );
      let characterId: PlayableCharacterId = this.profile.selectedClass;
      let definition = getCharacterDefinition(characterId);
      this.hud.setGameplayVisible(false);
      this.hud.showLoadingScreen(5, 'Preparando classes...');
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
            `Preparando classes... (${completed}/${total})`
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
          const availableCharacters = playableCharacters.filter((character) =>
            this.characterAssets.has(character.id)
          );
          if (availableCharacters.length === 0) {
            const details = playableCharacters
              .map((character) => `${character.name}: ${Logger.formatError(this.characterAssets.getError(character.id))}`)
              .join('\n');
            throw new Error(`Nenhuma classe jogável pôde ser carregada.\n${details}`);
          }
          if (!this.characterAssets.has(this.profile.selectedClass)) {
            const fallback = availableCharacters[0];
            Logger.warn(
              'Game:Character',
              `A classe salva (${this.profile.selectedClass}) não carregou; usando ${fallback.name}.`,
              this.characterAssets.getError(this.profile.selectedClass)
            );
            this.profile.selectedClass = fallback.id as PlayableCharacterId;
          }
          this.hud.hideLoadingScreen();
          this.pendingRunMode = 'campaign';
          const lobby = new LobbyScreen(
            this.renderer,
            this.canvas,
            this.characterAssets,
            this.profile,
            this.inventory
          );
          await lobby.show({
            firstRun: this.flow.state === 'class-select',
            onClassConfirmed: (selectedClass) => {
              this.profile.selectedClass = selectedClass;
              // Choosing the class swaps the starter weapon shown: sword only
              // for the Guerreiro, cajado only for the Maga.
              Object.assign(this.profile, syncStarterWeaponToClass(this.profile));
              this.inventory.commitProfile(this.profile);
              this.flow.transition({ type: 'class-confirmed' });
              savePlayerProfile(this.profile);
            },
            onGuildTokenBackpackExpansion: () => this.purchaseGuildTokenBackpackExpansion(),
            onHotkeysChanged: () => this.persistProfileState(),
            onAutoBasicAttackChanged: () => this.persistProfileState(),
            onLobbyInventoryChanged: () => this.persistInventory(),
            onBlacksmithLicensePurchase: () => this.purchaseBlacksmithWorkshopLicense(),
            onBlacksmithCraft: (recipeId) => this.craftBlacksmithRecipe(recipeId),
            adminTrainingEnabled: this.adminEnabled,
            onRunModeSelected: (mode) => { this.pendingRunMode = mode; },
          });
          this.activeRunMode = this.pendingRunMode;
          this.flow.transition({ type: 'start-game' });
          characterId = this.profile.selectedClass;
          definition = getCharacterDefinition(characterId);
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
      this.player.onMageSpellCast((event) => {
        const target = this.resolveMageSpellTarget(event.target);
        this.mageVFX.cast(event.spellId, {
          caster: event.caster,
          action: event.action,
          rightHand: event.rightHand,
          leftHand: event.leftHand,
          target,
          fallbackDirection: event.fallbackDirection,
          onImpact: (hit) => this.onMageSpellImpact(event.spellId, hit, event.onImpact),
          onLaunch: () => this.player.releaseSkillCastAnchor(),
          isTargetAlive: (candidate) => this.isMageVFXTargetAlive(candidate),
          queryBodyHit: (from, to, radius) => this.queryMageSpellBody(from, to, radius),
        });
      });
      this.hud.onAnimationTest((state) => {
        if (this.player.previewAnimation(state)) {
          this.hud.setActiveAnimationTest(state);
          Logger.debug('Game:AnimationTest', `Botão acionado: ${state}`);
        }
      });

      this.player.root.position.copy(this.spawnPoint);
      this.scene.add(this.player.root);
      this.cameraController.snapTo(this.player.root.position);
      if (characterId === 'mage') {
        this.hud.setLoadingProgress(96, 'Preparando efeitos da Maga...');
        this.mageVFX.warmUp(this.renderer, this.cameraController.camera);
      }
      this.setupFinalBossRewardFlow();
      Logger.info('Game', 'Player adicionado à cena e câmera posicionada.');

      this.runProgression = new RunProgression(new WaveManager(), {
        spawn: (request) => this.spawnWaveRequest(request),
        render: (snapshot) => this.hud.updateWaveStatus(snapshot),
        victory: () => {
          this.dismissRpgOverlay();
          this.stopBossSkills();
          this.mageVFX.clear();
          this.combatRegistry.clearLivingAllies();
          this.player.clearAttackTarget();
          this.targetedEnemyRoot = null;
          this.clearTargetMarker();
          this.player.setInputLocked(true);
          this.hud.hideBossHealth();
          this.hideMiniBossBarForReset();
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
      const initialArmorPieces = countEquippedArmorPieces(this.profile.equipment);
      this.runProgression.setEquipmentHpMultiplier(equipmentHpMultiplier(initialArmorPieces));
      this.adminPanel?.setGameplayAvailable(true);
      this.hud.onRespawnClick(() => this.deathLobbyTransition.completeNow());
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
      if (characterId === 'paladin') {
        this.hud.setPlayerPortrait('/assets/ui/portrait/warrior-portrait.png');
      }
      this.hud.setAnimationTestPanelForced(this.isAdminTrainingRun());
      // Any durable equipped weapon counts, not just the mounted 3D sword:
      // the Maga unlocks the run with her cajado the same way the Guerreiro
      // does with the sword.
      if (!this.isAdminTrainingRun() && this.hasEquippedWeaponForProgression()) {
        this.runProgression.weaponEquipped();
      }

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
      startWave: (wave) => {
        this.activeRunMode = 'campaign';
        this.hud.setAnimationTestPanelForced(false);
        this.runProgression.adminStartWave(wave);
      },
      startBoss: () => {
        this.activeRunMode = 'campaign';
        this.hud.setAnimationTestPanelForced(false);
        this.runProgression.adminStartBoss();
      },
      hitkillBoss: () => this.adminHitkillBoss(),
      setImmortal: (enabled) => {
        this.player.setImmortal(enabled);
        Logger.info('Game:Admin', `Imortalidade ${enabled ? 'ativada' : 'desativada'}.`);
      },
      setAdminCamera: (enabled) => {
        this.cameraController.setAdminMode(enabled);
        Logger.info('Game:Admin', `Câmera ADM ${enabled ? 'ativada' : 'desativada'}.`);
      },
      spawnTestEnemy: (role) => this.spawnAdminTestEnemy(role),
      clearTestEnemies: () => this.clearAdminTestEnemies(),
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
    this.mageVFX.clear();
    this.archerProjectiles.clear();
    this.stopBossSkills();
    this.combatRegistry.clear();
    this.stopMiniBossSkills();
    this.finalBattleSlots.reset();
    this.hud.hideBossHealth();
    this.hideMiniBossBarForReset();
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

  /** True when the profile wears a weapon, regardless of its 3D attachment. */
  private hasEquippedWeaponForProgression(): boolean {
    return this.player.equippedWeaponId !== null || getPrimaryWeaponId(this.profile.equipment) !== null;
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
      allowEquip: false,
    });
    this.hud.onOpenEquipment(() => this.openRpgOverlay('equipment'));
    this.hud.onOpenBackpack(() => this.openRpgOverlay('backpack'));
    this.hud.onOpenStatus(() => this.openRpgOverlay('status'));
    this.hud.updateProgression(this.profile.progression, this.profile.attributePointsRemaining);
    this.hud.onBasicAttack(() => this.triggerBasicAttack());
    // The Maga's basic cast spends MP (mana) — 1% da barra por ataque (treino
    // ADM incluso). É mana, não fadiga; o Guerreiro continua de graça.
    this.player.basicAttackCost = {
      canAfford: () => this.profile.selectedClass !== 'mage'
        || this.warriorSkills.canSpend(
          mageBasicAttackManaCost(this.warriorSkills.snapshot().maxEnergy)
        ),
      spend: () => {
        if (this.profile.selectedClass === 'mage') {
          this.warriorSkills.spend(
            mageBasicAttackManaCost(this.warriorSkills.snapshot().maxEnergy)
          );
        }
      },
    };
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
    if (result.kind === 'insufficient-materials') {
      const cost = craftLineMaterialCost(findBlacksmithRecipe(recipeId)?.line ?? 'defense');
      return { message: `São necessários ${cost} de cada material comum para esta peça.` };
    }
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
    this.player.attackRange = this.profile.selectedClass === 'mage'
      ? MAGE_MAX_RANGE_METERS
      : WARRIOR_MAX_RANGE_METERS;
    this.player.attackCooldownTime = stats.attackCooldown;
    this.fatigue.setMaxFatigue(stats.maxFatigue);
    const armorPieces = countEquippedArmorPieces(this.profile.equipment);
    if (this.runProgression) {
      this.runProgression.setEquipmentHpMultiplier(equipmentHpMultiplier(armorPieces));
    }
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
    const mage = this.profile.selectedClass === 'mage';
    const adminPreview = this.hasAdminFreeSkills();
    if (!adminPreview) {
      if (!isWarriorSkillUnlocked(id, this.profile.progression.level)) return;
    }
    if (!this.fatigue.canUseSkills) return;
    if (mage && this.player.blocksSkillsWhileMoving) return;
    if (mage && !this.fatigue.canAffordPercent(mageSkillFatiguePercent(id))) return;
    const activation = this.warriorSkills.tryActivate(id, {
      paused: false,
      dead: this.player.isDead,
      busy: this.player.isAttackInSwing(),
      // Training can skip the cooldown, but a Mage skill always spends MP.
      waiveCooldown: adminPreview,
    });
    if (activation.kind !== 'activated') return;
    if (!this.player.tryStartSkillAttack(id)) {
      this.warriorSkills.refund(id);
      return;
    }
    if (mage) this.fatigue.consumePercent(mageSkillFatiguePercent(id));
  }

  private mageSkillSnapshot(snapshot: WarriorSkillsSnapshot): WarriorSkillsSnapshot {
    if (this.profile.selectedClass !== 'mage') return snapshot;
    const skills = { ...snapshot.skills };
    for (const skill of WARRIOR_SKILLS) {
      const percent = mageSkillFatiguePercent(skill.id);
      const state = skills[skill.id];
      skills[skill.id] = {
        ...state,
        fatigueCostPercent: percent,
        fatigueAffordable: this.fatigue.canAffordPercent(percent),
      };
    }
    return { ...snapshot, skills };
  }

  private isAdminTrainingRun(): boolean {
    return this.activeRunMode === 'admin-training';
  }

  private hasAdminFreeSkills(): boolean {
    return this.isAdminTrainingRun() && this.adminEnabled && this.profile.selectedClass === 'mage';
  }

  private skillDisplayLevel(): number {
    return this.hasAdminFreeSkills() ? Number.MAX_SAFE_INTEGER : this.profile.progression.level;
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

  private spawnAdminTestEnemy(role: AdminSpawnRole): boolean {
    if (!this.player || !this.flow?.acceptsGameplayInput) return false;
    if (role === 'boss' && this.combatRegistry.mainBoss) return false;

    const point = this.resolveAdminSpawnPoint();
    const id = `${ADMIN_TEST_ENEMY_PREFIX}:${role}:${this.adminSpawnSequence++}`;
    try {
      const enemy = this.createAdminEnemy(role, point);
      if (!this.combatRegistry.register({
        id,
        phaseId: ADMIN_TEST_PHASE_ID,
        role,
        enemy,
      })) {
        return false;
      }
      this.scene.add(enemy.root);
      if (role === 'mini-boss') this.showMiniBossBar(id, enemy);
      if (role === 'boss') {
        this.bossSkills.reset();
        this.bossEffects.clear();
        this.bossEncounterActive = true;
        this.hud.updateBossHealth(enemy.hp, enemy.maxHP);
        this.hud.showBossHealth();
      }
      Logger.info('Game:Admin', `Spawn de teste criado: ${role} em (${point.x.toFixed(1)}, ${point.z.toFixed(1)}).`);
      return true;
    } catch (error) {
      Logger.error('Game:Admin', `Falha ao criar spawn de teste ${role}.`, error);
      return false;
    }
  }

  private createAdminEnemy(role: AdminSpawnRole, point: THREE.Vector3): Enemy {
    if (role === 'boss') {
      return createBoss(
        point,
        this.bossAssets.hasBoss() ? this.bossAssets.createBossVisual() : undefined,
        this.vfxLightPool
      );
    }
    const visual = this.enemyAssets.hasRegularEnemy()
      ? this.enemyAssets.createRegularEnemyVisual()
      : undefined;
    if (role === 'mini-boss') {
      return new Enemy(
        { ...createMiniBossOptions(point, 1, 1, 1), shockLightPool: this.vfxLightPool },
        visual
      );
    }
    return createRegularEnemy(point, 1, 1, this.adminSpawnSequence, 1, visual, this.vfxLightPool);
  }

  private resolveAdminSpawnPoint(): THREE.Vector3 {
    const rotationY = this.player.root.rotation.y;
    const forward = new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY));
    if (forward.lengthSq() <= 1e-8) forward.set(0, 0, -1);
    forward.normalize();
    const point = this.player.root.position.clone().addScaledVector(forward, 6);
    point.x = THREE.MathUtils.clamp(point.x, -this.worldLimit + 2, this.worldLimit - 2);
    point.y = 0;
    point.z = THREE.MathUtils.clamp(point.z, -this.worldLimit + 2, this.worldLimit - 2);
    return point;
  }

  private clearAdminTestEnemies(): void {
    this.prepareAdminPhaseChange();
    this.runProgression.reset();
    Logger.info('Game:Admin', 'Monstros de teste removidos.');
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
              visual,
              this.vfxLightPool
            )
            : variant === 'guardian'
              ? createGuardianEnemy(
                point,
                request.hpMultiplier,
                request.damageMultiplier,
                request.speedMultiplier,
                visual,
                this.vfxLightPool
              )
            : createRegularEnemy(
              point,
              request.hpMultiplier,
              request.damageMultiplier,
              sequence,
              request.speedMultiplier,
              visual,
              this.vfxLightPool
            )
          : new Enemy(
              {
                ...createMiniBossOptions(
                  point,
                  request.hpMultiplier,
                  request.damageMultiplier,
                  request.speedMultiplier
                ),
                shockLightPool: this.vfxLightPool,
              },
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
        if (role === 'mini-boss') this.showMiniBossBar(id, enemy);
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
          this.bossAssets.hasBoss() ? this.bossAssets.createBossVisual() : undefined,
          this.vfxLightPool
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

    if (request.regularCount > 0) {
      const mainBoss = this.combatRegistry.mainBoss;
      const bars = mainBoss ? resolveBossBarLayer(mainBoss.hp, mainBoss.maxHP).barsRemaining : 5;
      const composition = getBossMinionComposition(bars);
      const roster = composition.roster.slice(0, request.regularCount);
      const spawnPoints = this.level.getFinalBattleMinionSpawnPoints(roster.length);

      for (let index = 0; index < roster.length; index++) {
        const variant = roster[index];
        const point = spawnPoints[index] ?? layout.miniBosses[index % layout.miniBosses.length];
        const sequence = this.regularSpawnSequence++;
        const id = `${request.phaseId}:final-${variant}:${sequence}`;
        try {
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

          const ally = variant === 'archer'
            ? createArcherEnemy(
                point,
                request.hpMultiplier,
                request.damageMultiplier,
                request.speedMultiplier,
                visual,
                this.vfxLightPool
              )
            : variant === 'guardian'
              ? createGuardianEnemy(
                  point,
                  request.hpMultiplier,
                  request.damageMultiplier,
                  request.speedMultiplier,
                  visual,
                  this.vfxLightPool
                )
              : createRegularEnemy(
                  point,
                  request.hpMultiplier,
                  request.damageMultiplier,
                  sequence,
                  request.speedMultiplier,
                  visual,
                  this.vfxLightPool
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
          Logger.error('Game:Waves', `Falha ao criar aliado ${variant} ${id}.`, error);
        }
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
      this.deathLobbyTransition.reset();
      this.finalBossRewards?.reset();
      this.combatRegistry.clear();
      this.stopMiniBossSkills();
      this.finalBattleSlots.reset();
      this.runProgression.reset();
      Object.assign(this.profile, resetRunProgression(this.profile));
      this.persistProfileState();
      this.hud.updateProgression(this.profile.progression, this.profile.attributePointsRemaining);
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
      this.mageVFX.clear();
      this.stopBossSkills();
      this.lastBossMinionTier = 1;
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
      this.adminSpawnSequence = 0;
      this.hud.hideDeathScreen();
      this.hud.hideVictoryScreen();
      this.hud.hideCraftRewardNotification();
      this.hud.hideBossHealth();
      this.hideMiniBossBarForReset();
      this.hud.hideWaveStatus();
      this.applyCharacterBuild(true);
      this.hud.setAnimationTestPanelForced(this.isAdminTrainingRun());
      // Any durable equipped weapon counts, not just the mounted 3D sword:
      // the Maga unlocks the run with her cajado the same way the Guerreiro
      // does with the sword.
      if (!this.isAdminTrainingRun() && this.hasEquippedWeaponForProgression()) {
        this.runProgression.weaponEquipped();
      }
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
    if (this.input.wasKeyPressed('shift')) {
      if (this.profile.selectedClass === 'mage') {
        this.tryMageTeleport();
      } else if (this.fatigue.canDash && this.player.tryDash(this.keyboardDir)) {
        // Dash custa 20% da barra de fadiga por uso.
        this.fatigue.consume(DASH_FATIGUE_COST);
      }
    }
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
      if (this.player.isDead) {
        this.player.setInputLocked(true);
        this.hud.showDeathScreen();
        this.deathLobbyTransition.start();
        this.flow.transition({ type: 'player-died' });
      }
    }

    // Tecla de teste: pressione K para simular morte instantânea e testar "morreu"
    if (this.input.wasKeyPressed('k')) {
      Logger.debug('Game', 'Tecla K pressionada -> testando animação "morreu" (dano fatal)');
      this.player.takeDamage(9999);
      if (this.player.isDead) {
        this.player.setInputLocked(true);
        this.hud.showDeathScreen();
        this.deathLobbyTransition.start();
        this.flow.transition({ type: 'player-died' });
      }
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

  /**
   * Movement keys win. A ground click is the chosen direction while she walks
   * to it. Standing still blinks along the facing used by movement, not the
   * Three.js look axis.
   */
  private mageTeleportDirection(): THREE.Vector3 {
    if (this.keyboardDir.lengthSq() > 1e-8) return this.keyboardDir.clone();
    const click = this.player.moveTarget;
    if (click) {
      const toClick = click.clone().sub(this.player.root.position);
      toClick.y = 0;
      if (toClick.lengthSq() > 1e-8) return toClick.normalize();
    }
    const facing = this.player.planarForward();
    if (facing.lengthSq() <= 1e-8) facing.set(0, 0, 1);
    return facing;
  }

  /**
   * Shift blinks the Mage 10m on the chosen direction, then spends 25% fatigue
   * and 10% MP. The warrior dash path is unchanged.
   */
  private tryMageTeleport(): void {
    if (!this.player || this.player.isDead || this.player.isCastingSkill) return;
    const manaCost = mageTeleportManaCost(this.warriorSkills.snapshot().maxEnergy);
    if (!this.warriorSkills.canSpend(manaCost)) return;
    if (!this.fatigue.canAffordPercent(MAGE_TELEPORT_FATIGUE_PERCENT)) return;

    const direction = this.mageTeleportDirection();

    const from = this.player.root.position.clone();
    const destination = resolveMageTeleportDestination({
      origin: from,
      direction,
      worldLimit: this.worldLimit,
      obstacles: this.level.navigationObstacles,
    });
    if (destination.distanceToSquared(from) <= 1e-4) return;
    if (!this.player.blinkTo(destination, direction)) return;
    this.warriorSkills.spend(manaCost);
    this.fatigue.consumePercent(MAGE_TELEPORT_FATIGUE_PERCENT);
    this.mageVFX.playTeleport(from, this.player.root.position);
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
      this.pendingRunMode = 'campaign';
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
        adminTrainingEnabled: this.adminEnabled,
        onRunModeSelected: (mode) => { this.pendingRunMode = mode; },
      });
      this.activeRunMode = this.pendingRunMode;
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

  private async returnToLobbyAfterDeath(): Promise<void> {
    if (this.flow.state !== 'dead') return;
    this.running = false;
    this.flow.transition({ type: 'return-to-lobby' });
    this.player.setInputLocked(true);
    this.input.reset();
    this.hud.hideDeathScreen();
    this.hud.setGameplayVisible(false);
    try {
      if (!persistVictoryReset(this.profile, this.inventory, () => {
        return this.persistProfileState();
      })) {
        throw new Error('Não foi possível salvar o reset da expedição.');
      }
      this.pendingRunMode = 'campaign';
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
        adminTrainingEnabled: this.adminEnabled,
        onRunModeSelected: (mode) => { this.pendingRunMode = mode; },
      });
      this.activeRunMode = this.pendingRunMode;
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
      Logger.error('Game:Flow', 'Falha ao retornar ao lobby após derrota.', error);
      this.deathLobbyTransition.start();
      this.hud.setGameplayVisible(true);
      this.flow.state = 'dead';
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
    this.player.attackTargetEnemy = next;
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
      // O corpo permanece orientado para o alvo marcado mesmo em movimento
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

  private resolveMageSpellTarget(candidate: THREE.Object3D | null): THREE.Object3D | null {
    return this.resolveLivingEnemyRoot(candidate)
      ?? this.resolveLivingEnemyRoot(this.targetedEnemyRoot);
  }

  private resolveLivingEnemyRoot(candidate: THREE.Object3D | null): THREE.Object3D | null {
    if (!candidate) return null;
    if (this.isTrainingDummyTarget(candidate)) return this.trainingDummy?.root ?? null;
    let object: THREE.Object3D | null = candidate;
    while (object && !object.userData.isEnemyRoot) object = object.parent;
    if (!object) return null;
    const record = this.combatRegistry.findByRoot(object);
    if (!record || record.enemy.isDead) return null;
    return record.enemy.root;
  }

  private isTrainingDummyTarget(target: THREE.Object3D): boolean {
    if (!this.trainingDummy) return false;
    let object: THREE.Object3D | null = target;
    while (object && !object.userData.isTrainingDummy) object = object.parent;
    return object === this.trainingDummy.root || target === this.trainingDummy.root;
  }

  /** First living body the spell segment enters, so the bolt stops on that monster. */
  private queryMageSpellBody(
    from: THREE.Vector3,
    to: THREE.Vector3,
    spellRadius: number
  ): THREE.Object3D | null {
    const columns = [];
    const point = new THREE.Vector3();
    const reach = Math.max(0, spellRadius);
    for (const root of this.combatRegistry.activeRoots()) {
      const record = this.combatRegistry.findByRoot(root);
      if (!record || record.enemy.isDead) continue;
      root.getWorldPosition(point);
      const scale = Number(root.userData.enemyBodyScale) || 1;
      columns.push({
        target: root,
        x: point.x,
        z: point.z,
        minY: point.y,
        maxY: point.y + 2.05 * scale,
        radius: Math.max(record.enemy.collisionRadius, 0.5 * scale) + reach,
      });
    }
    if (this.trainingDummy) {
      this.trainingDummy.root.getWorldPosition(point);
      columns.push({
        target: this.trainingDummy.root,
        x: point.x,
        z: point.z,
        minY: point.y,
        maxY: point.y + 1.9,
        radius: 0.55 + reach,
      });
    }
    return firstColumnHit(from, to, columns)?.target ?? null;
  }

  private onMageSpellImpact(
    spellId: MageSpellId,
    hit: THREE.Object3D,
    basicImpact: ((target: THREE.Object3D) => void) | null
  ): void {
    if (spellId === 'basic') {
      basicImpact?.(hit);
      return;
    }
    this.applyMageSkillBodyDamage(spellId, hit);
  }

  private applyMageSkillBodyDamage(spellId: MageSpellId, target: THREE.Object3D): void {
    const attackId = mageSkillAttackId(spellId);
    if (!attackId) {
      this.onPlayerHitEnemy(target);
      return;
    }
    if (!this.hasAdminFreeSkills() && !isWarriorSkillUnlocked(attackId, this.profile.progression.level)) return;

    const skill = getWarriorSkill(attackId);
    const elemental = skill.element !== null;
    const baseDamage = getTypedAttackBaseDamage(
      getWarriorSkillDamage(this.player.attackDamage) * warriorSkillDamageMultiplier(attackId),
      this.getCharacterStats().physicalDamageMultiplier,
      elemental
    );
    const body = this.resolveLivingEnemyRoot(target) ?? target;
    const center = body.getWorldPosition(new THREE.Vector3());
    const bodyRadius = this.isTrainingDummyTarget(body)
      ? 0.45
      : (this.combatRegistry.findByRoot(body)?.enemy.collisionRadius ?? 0.45);
    const rawDistance = getEffectiveTargetDistance(
      this.player.root.position.distanceTo(center),
      bodyRadius
    );
    // A bolt that connects a few centimeters past the cone still hits. A miss
    // well beyond 7m does not.
    const distance = rawDistance <= MAGE_MAX_RANGE_METERS + 0.45
      ? Math.min(rawDistance, MAGE_MAX_RANGE_METERS)
      : rawDistance;
    const damage = this.resolveOutgoingDamage(
      applyDistanceFalloff(baseDamage, distance, 'mage'),
      elemental
    );
    if (damage <= 0) return;

    if (this.isTrainingDummyTarget(body) && this.trainingDummy) {
      this.trainingDummy.takeDamage(damage);
      this.showFloatingDamage(this.trainingDummy.root.position, damage);
      return;
    }

    const record = this.combatRegistry.findByRoot(body);
    if (!record || record.enemy.isDead) return;
    record.enemy.receivePlayerHit(damage, this.player.root.position);
    if (skill.element === 'fire' && !record.enemy.isDead) {
      record.enemy.applyElementalHit(skill.element, Math.max(1, damage * 0.12));
    }
    this.applyMageSkillControl(spellId, record.enemy, center);
    this.healFromLifeSteal(damage);
    this.showFloatingDamage(record.enemy.root.position, damage);
    this.syncCombatHealthBars(record);
    if (record.enemy.isDead) this.handleEnemyDeath(record);
  }

  /**
   * Ice paralyzes the body that was hit. Water slows that body down. Lava
   * burns every living monster within 2m of the impact. Lightning lifts every
   * living monster within 2m of the impact, including the one that was hit
   * when it survives.
   */
  private applyMageSkillControl(
    spellId: MageSpellId,
    target: Enemy,
    impact: THREE.Vector3
  ): void {
    const effect = mageSkillImpactEffect(spellId);
    if (!effect) return;
    if (effect.kind === 'freeze') {
      if (!target.isDead) target.applyMageFreeze(effect.seconds);
      return;
    }
    if (effect.kind === 'slow') {
      if (!target.isDead) target.applyMageSlow(effect.seconds);
      return;
    }
    if (effect.kind === 'burn') {
      for (const root of this.combatRegistry.activeRoots()) {
        const record = this.combatRegistry.findByRoot(root);
        if (!record || record.enemy.isDead) continue;
        const position = record.enemy.root.position;
        if (!isInsideMageSkillRadius(impact.x, impact.z, position.x, position.z, effect.radius)) continue;
        record.enemy.applyElementalHit('fire', effect.damagePerSecond, effect.seconds);
      }
      return;
    }
    this.mageVFX.playShockImpact(impact);
    for (const root of this.combatRegistry.activeRoots()) {
      const record = this.combatRegistry.findByRoot(root);
      if (!record || record.enemy.isDead) continue;
      const position = record.enemy.root.position;
      if (!isInsideMageSkillRadius(impact.x, impact.z, position.x, position.z, effect.radius)) continue;
      record.enemy.applyMageShockLevitate(effect.seconds);
    }
  }

  private isMageVFXTargetAlive(target: THREE.Object3D): boolean {
    if (this.trainingDummy) {
      let object: THREE.Object3D | null = target;
      while (object && !object.userData.isTrainingDummy) object = object.parent;
      if (object === this.trainingDummy.root || target === this.trainingDummy.root) return true;
    }
    const record = this.combatRegistry.findByRoot(target);
    return record !== null && !record.enemy.isDead;
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
    const rangedDamage = applyDistanceFalloff(
      physicalDamage,
      distance,
      this.playerDistanceFalloffProfile()
    );
    const damage = this.resolveOutgoingDamage(rangedDamage, false);
    if (damage <= 0) return;
    record.enemy.receivePlayerHit(damage, this.player.root.position);
    this.healFromLifeSteal(damage);
    this.showFloatingDamage(target.position, damage);
    this.syncCombatHealthBars(record);

    if (record.enemy.isDead) this.handleEnemyDeath(record);
  }

  private playerDistanceFalloffProfile(): DistanceFalloffProfile {
    return this.profile.selectedClass === 'mage' ? 'mage' : 'warrior';
  }

  private resolvePlayerSkillArea(attackId: WarriorSkillId): ReturnType<typeof getWarriorSkillArea> {
    const area = getWarriorSkillArea(attackId);
    if (this.profile.selectedClass !== 'mage') return area;
    return {
      ...area,
      radius: area.radius * MAGE_SKILL_RANGE_SCALE,
      forwardOffset: area.forwardOffset !== undefined
        ? area.forwardOffset * MAGE_SKILL_RANGE_SCALE
        : undefined,
    };
  }

  private onWarriorSkillHit(event: WarriorSkillHitEvent): void {
    // Mage skills finish on the body the spell actually reaches. The warrior
    // area must not also splash through monsters behind that impact.
    if (this.profile.selectedClass === 'mage') return;
    if (!this.hasAdminFreeSkills() && !isWarriorSkillUnlocked(event.attackId, this.profile.progression.level)) return;
    const records = this.combatRegistry.activeRoots()
      .map((root) => this.combatRegistry.findByRoot(root))
      .filter((record): record is CombatRecord => record !== null);
    const skill = getWarriorSkill(event.attackId);
    const area = this.resolvePlayerSkillArea(event.attackId);
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
      const rangedDamage = applyDistanceFalloff(
        baseDamage,
        distance,
        this.playerDistanceFalloffProfile()
      );
      const damage = this.resolveOutgoingDamage(rangedDamage, elemental);
      if (damage <= 0) continue;
      lifeStealDamage += damage;
      record.enemy.receivePlayerHit(damage, this.player.root.position);
      if (skill.element && !record.enemy.isDead) {
        record.enemy.applyElementalHit(skill.element, Math.max(1, damage * 0.12));
      }
      this.showFloatingDamage(record.enemy.root.position, damage);
      this.syncCombatHealthBars(record);
      if (record.enemy.isDead) this.handleEnemyDeath(record);
    }
    this.healFromLifeSteal(lifeStealDamage);
  }

  /** Mostra/assuma a barra de vida do mini-boss ativo no HUD. */
  private showMiniBossBar(id: string, enemy: Enemy): void {
    this.miniBossBarId = id;
    const values = getBossHealthHudValues(enemy);
    this.hud.updateMiniBossHealth(values.hp, values.maxHP);
    this.hud.showMiniBossHealth();
  }

  /** Esconde a barra do mini-boss em resets/trocas de fase. */
  private hideMiniBossBarForReset(): void {
    this.miniBossBarId = null;
    this.hud.hideMiniBossHealth();
  }

  /** Atualiza a barra certa (boss final de 5 barras ou mini-boss). */
  private syncCombatHealthBars(record: CombatRecord): void {
    if (record.role === 'boss') {
      const values = getBossHealthHudValues(record.enemy);
      this.hud.updateBossHealth(values.hp, values.maxHP);
      return;
    }
    if (record.role === 'mini-boss' && record.id === this.miniBossBarId) {
      const values = getBossHealthHudValues(record.enemy);
      this.hud.updateMiniBossHealth(values.hp, values.maxHP);
    }
  }

  private handleEnemyDeath(record: CombatRecord): void {
    const target = record.enemy.root;
    const death = this.combatRegistry.reportDeath(target);
    if (!death) return;
    const experienceWave = this.runProgression.snapshot.wave;
    const earnsCampaignExperience = this.runProgression.snapshot.phase === 'regular-wave' || death.role === 'boss';
    if (record.role === 'boss') this.stopBossSkills();
    if (record.role === 'mini-boss' && record.id === this.miniBossBarId) {
      // Se outro mini-boss seguir vivo, a barra passa para ele.
      const next = this.combatRegistry.activeRoots()
        .map((root) => this.combatRegistry.findByRoot(root))
        .find((entry): entry is CombatRecord => (
          entry !== null && entry.role === 'mini-boss' && entry.id !== record.id
        ));
      if (next) {
        this.showMiniBossBar(next.id, next.enemy);
      } else {
        this.miniBossBarId = null;
        this.hud.hideMiniBossHealth();
      }
    }
    if (death.id.startsWith(`${ADMIN_TEST_ENEMY_PREFIX}:`)) {
      this.handleAdminTestEnemyDeath(record);
      return;
    }
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

  private handleAdminTestEnemyDeath(record: CombatRecord): void {
    if (record.role === 'boss') this.stopBossSkills();
    if (record.role === 'mini-boss' && record.id === this.miniBossBarId) {
      this.miniBossBarId = null;
      this.hud.hideMiniBossHealth();
    }
    if (this.targetedEnemyRoot === record.enemy.root) {
      this.targetedEnemyRoot = null;
      this.clearTargetMarker();
    }
    this.player.clearAttackTarget();
    Logger.info('Game:Admin', `Alvo de teste derrotado: ${record.role}.`);
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

      const layer = resolveBossBarLayer(boss.hp, boss.maxHP);
      const enrage = getBossEnrageStats(layer.barsRemaining);
      boss.damage = Math.round(BASE_BOSS_DAMAGE * enrage.damageMultiplier);
      boss.speed = BASE_BOSS_SPEED * enrage.speedMultiplier;

      const newTier = getBossMinionTier(layer.barsRemaining);
      if (newTier !== this.lastBossMinionTier) {
        this.lastBossMinionTier = newTier;
        for (const root of this.combatRegistry.activeRoots()) {
          const record = this.combatRegistry.findByRoot(root);
          if (record && record.role === 'regular') {
            this.scene.remove(root);
          }
        }
        this.combatRegistry.clearLivingAllies();
        this.runProgression.setFinalBattleBossBars(layer.barsRemaining);
        Logger.info(
          'Boss:Phase',
          `Dragonic Overlord atingiu ${layer.barsRemaining}x vida (Tier ${newTier})! Novos reforços invocados.`
        );
      }
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
      this.mageVFX.clear();
      this.stopBossSkills();
      this.player.setInputLocked(true);
      this.hud.showDeathScreen();
      this.deathLobbyTransition.start();
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
      mageVFX: this.mageVFX.diagnostics(),
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

    const layer = resolveBossBarLayer(boss.hp, boss.maxHP);
    const enrage = getBossEnrageStats(layer.barsRemaining);

    const frame = this.bossSkills.update(
      delta,
      boss.root.position,
      this.player.root.position,
      enrage.damageMultiplier,
      enrage.skillCooldownSeconds
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
      this.deathLobbyTransition.update(delta);
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
      this.mageVFX.update(delta);
      const castingMageSkill = this.profile.selectedClass === 'mage' && this.player.isCastingSkill;
      const fatigue = this.fatigue.update(
        delta,
        this.player.currentMoveSpeed > 0.05,
        castingMageSkill
      );
      this.updateHealthPlasma(delta);
      this.warriorSkills.update(delta, false, this.player.currentMoveSpeed > 0.05);
      this.hud.setActiveAnimationTest(this.player.activeAnimationPreview);
      this.clampPlayerToArena();
      this.player.enforceSkillCastAnchor();
      if (WEAPON_TEST_MODE) {
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
      } else {
        this.updateBossSkills(delta);
        this.updateCombatEntities(delta);
        if (!this.isAdminTrainingRun()) {
          this.runProgression.update(delta);
          this.finalBossRewards?.update(delta);
        }
        this.adminPanel?.update(
          this.runProgression.snapshot,
          this.combatRegistry.mainBoss !== null
        );
      }
      this.level.update(this.elapsedTime, this.player.root.position);

      this.lightingRig?.update(
        this.player.root.position,
        this.combatRegistry.mainBoss?.root.position ?? null
      );

      this.cameraController.update(this.player.root.position, delta);
      this.mageVFX.applyCameraShake(this.cameraController.camera, delta);
      this.hud.updatePlayerHealth(this.player.hp, this.player.maxHP);
      this.hud.updatePlayerFatigue(fatigue, this.fatigue.currentMaxFatigue);
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
              : this.profile.selectedClass === 'mage' && this.player.blocksSkillsWhileMoving
                ? 'moving'
                : null;
      this.hud.updateWarriorSkills(
        this.mageSkillSnapshot(skills),
        skillLock,
        this.skillDisplayLevel(),
        false,
        { mageCosts: this.profile.selectedClass === 'mage' }
      );

      this.renderer.render(this.scene, this.cameraController.camera);
      this.recordFramePerformance(rawDelta * 1000);
    } catch (err) {
      Logger.error('Game', 'Erro no loop principal do jogo (frame ignorado).', err);
    }
  };
}
