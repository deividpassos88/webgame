import { Logger } from './utils/Logger';
import { resolveDevAdminAccess } from './admin/AdminAccess';
import { PROFILE_STORAGE_KEY } from './profile/PlayerProfile';
import './style.css';

// Inicializa o Logger e os listeners de erro GLOBAIS antes de qualquer
// outro import pesado (Game, Three.js, etc). Assim, se algo quebrar
// durante a importação/inicialização dessas dependências, ainda capturamos.
Logger.init();

const PROFILE_BUILD_CACHE_KEY = 'dragon-miner.profile-build-id.v1';

function clearProfileCacheIfBuildChanged(): void {
  try {
    const buildId = __DRAGON_MINER_BUILD_ID__;
    const searchParams = new URLSearchParams(window.location.search);
    const manualReset = searchParams.get('resetProfile') === '1'
      || searchParams.get('clearProfile') === '1'
      || searchParams.get('freshProfile') === '1';
    const previousBuildId = window.localStorage.getItem(PROFILE_BUILD_CACHE_KEY);
    if (!manualReset && previousBuildId === buildId) return;

    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    window.localStorage.setItem(PROFILE_BUILD_CACHE_KEY, buildId);
    Logger.info(
      'Main',
      manualReset
        ? 'Perfil local limpo por parâmetro de URL; a seleção de classe será exibida.'
        : 'Perfil/cache local limpo porque um novo build foi carregado; a seleção de classe será exibida.'
    );

    if ('caches' in window) {
      void window.caches.keys()
        .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))))
        .catch((error) => Logger.warn('Main', 'Falha ao limpar Cache Storage do navegador.', error));
    }
  } catch (error) {
    Logger.warn('Main', 'Não foi possível limpar o perfil/cache local do navegador.', error);
  }
}

clearProfileCacheIfBuildChanged();

window.addEventListener('error', (event) => {
  Logger.error('Window', event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  Logger.error('Promise', 'Rejeição não tratada (unhandled rejection)', event.reason);
});

Logger.info('Main', 'Iniciando Dragon Miner...');

async function bootstrap() {
  try {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!canvas) {
      Logger.error('Main', 'Elemento #game-canvas não encontrado no DOM!');
      return;
    }

    Logger.info('Main', 'Importando módulo Game...');
    const { Game } = await import('./core/Game');
    Logger.info('Main', 'Módulo Game importado com sucesso.');

    const searchParams = new URLSearchParams(window.location.search);
    const adminParam = searchParams.get('admin');
    const adminExplicitlyDisabled = adminParam === '0' || adminParam === 'false' || import.meta.env.VITE_ADMIN_MODE === 'false';
    const adminEnabled = !adminExplicitlyDisabled;

    const game = new Game(canvas, { adminEnabled });
    await game.start();
  } catch (err) {
    Logger.error('Main', 'Falha crítica ao iniciar o jogo (capturada em bootstrap).', err);
  }
}

bootstrap();
