import { Logger } from './utils/Logger';
import { resolveDevAdminAccess } from './admin/AdminAccess';
import './style.css';

// Inicializa o Logger e os listeners de erro GLOBAIS antes de qualquer
// outro import pesado (Game, Three.js, etc). Assim, se algo quebrar
// durante a importação/inicialização dessas dependências, ainda capturamos.
Logger.init();

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
