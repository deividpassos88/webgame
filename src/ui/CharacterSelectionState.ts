import { CHARACTERS, type CharacterId } from '../characters/CharacterCatalog';

export class CharacterSelectionState {
  public selectedId: CharacterId | null = null;
  private readonly available: ReadonlySet<CharacterId>;

  constructor(availableIds: readonly CharacterId[]) {
    this.available = new Set(availableIds);
  }

  public isAvailable(id: CharacterId): boolean {
    return this.available.has(id);
  }

  public select(id: CharacterId): boolean {
    if (!this.isAvailable(id)) return false;
    this.selectedId = id;
    return true;
  }

  public move(direction: -1 | 1): CharacterId | null {
    const ids = CHARACTERS.map((character) => character.id).filter((id) =>
      this.isAvailable(id)
    );
    if (ids.length === 0) return null;

    const currentIndex = this.selectedId ? ids.indexOf(this.selectedId) : -1;
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : ids.length - 1
        : (currentIndex + direction + ids.length) % ids.length;

    this.selectedId = ids[nextIndex];
    return this.selectedId;
  }

  public confirm(): CharacterId | null {
    return this.selectedId && this.isAvailable(this.selectedId)
      ? this.selectedId
      : null;
  }
}
