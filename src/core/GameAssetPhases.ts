export interface GameAssetPhases {
  readonly loadCharacter: () => Promise<void>;
  readonly showLobby: () => Promise<void>;
  readonly loadGameplay: readonly (() => Promise<void>)[];
}

/** Keeps the lobby lightweight and defers combat-only assets until the player starts. */
export async function loadGameAssetsInPhases(phases: GameAssetPhases): Promise<void> {
  await phases.loadCharacter();
  await phases.showLobby();
  await Promise.all(phases.loadGameplay.map((load) => load()));
}
