import { REGULAR_WAVE_TOTAL, type WaveSnapshot } from '../waves/WaveManager';

export interface WaveHudContent {
  visible: boolean;
  title: string;
  detail: string;
}

const HIDDEN_WAVE_HUD: WaveHudContent = {
  visible: false,
  title: '',
  detail: '',
};

export function getWaveHudContent(snapshot: WaveSnapshot): WaveHudContent {
  switch (snapshot.phase) {
    case 'countdown':
    case 'intermission':
      return {
        visible: true,
        title: `Próxima onda em: ${Math.ceil(snapshot.countdownSeconds)}`,
        detail: '',
      };
    case 'regular-wave':
      return {
        visible: true,
        title: `Onda ${snapshot.wave}/${REGULAR_WAVE_TOTAL}`,
        detail: `Restantes: ${snapshot.alive}/${snapshot.total}`,
      };
    case 'final-countdown':
      return {
        visible: true,
        title: `Boss final em: ${Math.ceil(snapshot.countdownSeconds)}`,
        detail: '',
      };
    case 'final-battle':
      return {
        visible: true,
        title: 'BOSS FINAL',
        detail: `Inimigos restantes: ${snapshot.alive}/${snapshot.total}`,
      };
    case 'waiting-for-weapon':
    case 'victory':
      return HIDDEN_WAVE_HUD;
  }
}
