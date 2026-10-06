import { PROFILE_STORAGE_KEY } from '../profile/PlayerProfile';
import { Logger } from '../utils/Logger';

// Keep the existing marker key: it tracks asset versions, not save compatibility.
export const CLIENT_CACHE_BUILD_KEY = 'dragon-miner.profile-build-id.v1';

/** Refresh disposable assets without treating the player's saved profile as cache. */
export async function refreshClientCache(buildId: string): Promise<void> {
  try {
    const params = new URLSearchParams(window.location.search);
    const resetProfile = ['resetProfile', 'clearProfile', 'freshProfile']
      .some((key) => params.get(key) === '1');
    const clearCache = params.get('clearCache') === '1';
    const storage = window.localStorage;
    if (!resetProfile && !clearCache && storage.getItem(CLIENT_CACHE_BUILD_KEY) === buildId) return;

    // A cache refresh/new build must never erase inventory, settings or progress.
    // The existing explicit profile-reset URLs retain their original behavior.
    if (resetProfile) storage.removeItem(PROFILE_STORAGE_KEY);

    if ('caches' in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    }

    // Mark success only after clearing; failed cache operations can retry next load.
    storage.setItem(CLIENT_CACHE_BUILD_KEY, buildId);
    Logger.info(
      'Main',
      resetProfile
        ? 'Perfil local limpo por parâmetro de URL; a seleção de classe será exibida.'
        : 'Cache de arquivos atualizado. Perfil, inventário e progresso preservados.'
    );
  } catch (error) {
    // Storage may be unavailable in a private/embedded browser. Do not block boot.
    Logger.warn('Main', 'Não foi possível atualizar o cache local do navegador.', error);
  }
}
