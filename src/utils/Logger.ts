import { DeferredTask } from './DeferredTask';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  data?: unknown;
}

const MAX_HISTORY = 500;
const STORAGE_KEY = 'dragon_miner_logs';

export class LoggerService {
  private history: LogEntry[] = [];
  private panelEl: HTMLElement | null = null;
  private contentEl: HTMLElement | null = null;
  private fabEl: HTMLElement | null = null;
  private isPanelOpen = false;
  private errorCount = 0;
  private warnCount = 0;
  private initialized = false;
  private debugPanelEnabled = false;
  private readonly deferredSave = new DeferredTask(
    () => this.saveToStorageNow(),
    750
  );

  public init() {
    if (this.initialized) return;
    this.initialized = true;

    this.loadFromStorage();

    this.panelEl = document.getElementById('debug-log-panel');
    this.contentEl = document.getElementById('debug-log-content');
    this.fabEl = document.getElementById('debug-log-fab');
    this.setDebugPanelEnabled(this.debugPanelEnabled);

    document.getElementById('debug-log-clear')?.addEventListener('click', () => this.clear());
    document.getElementById('debug-log-close')?.addEventListener('click', () => this.togglePanel(false));
    document.getElementById('debug-log-export')?.addEventListener('click', () => this.exportToFile());
    this.fabEl?.addEventListener('click', () => this.togglePanel());

    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === '´' || e.key === '~') {
        e.preventDefault();
        this.togglePanel();
      }
    });
    window.addEventListener('pagehide', () => this.deferredSave.flush());

    // Re-renderiza histórico recuperado do localStorage (se houver, de uma sessão anterior que travou)
    if (this.history.length > 0) this.updateBadge();

    (window as any).gameLogger = this;

    this.info('Logger', 'Sistema iniciado. Pressione ` para abrir/fechar. Logs persistem entre recarregamentos.');
  }

  private togglePanel(force?: boolean) {
    if (!this.debugPanelEnabled) return;
    const wasOpen = this.isPanelOpen;
    this.isPanelOpen = force ?? !this.isPanelOpen;
    this.panelEl?.classList.toggle('open', this.isPanelOpen);
    if (this.isPanelOpen && !wasOpen) this.renderAll();
  }

  public openPanel() {
    this.togglePanel(true);
  }

  /** Debug UI is an administrator-only surface; history collection remains internal. */
  public setDebugPanelEnabled(enabled: boolean): void {
    this.debugPanelEnabled = enabled;
    this.fabEl?.classList.toggle('hidden', !enabled);
    this.panelEl?.classList.toggle('hidden', !enabled);
    this.fabEl?.setAttribute('aria-hidden', String(!enabled));
    this.panelEl?.setAttribute('aria-hidden', String(!enabled));
    if (!enabled) {
      this.isPanelOpen = false;
      this.panelEl?.classList.remove('open');
    }
  }

  private push(level: LogLevel, category: string, message: string, data?: unknown) {
    const entry: LogEntry = {
      level,
      message: `[${category}] ${message}`,
      timestamp: performance.now(),
      data: this.safeSerialize(data),
    };
    this.history.push(entry);
    if (this.history.length > MAX_HISTORY) {
      const expired = this.history.shift();
      if (expired?.level === 'error') this.errorCount--;
      if (expired?.level === 'warn') this.warnCount--;
    }

    if (level === 'error') this.errorCount++;
    if (level === 'warn') this.warnCount++;

    if (this.isPanelOpen) this.renderEntry(entry);
    this.updateBadge();
    this.deferredSave.request();

    const consoleFn =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleFn(`%c[${level.toUpperCase()}] ${entry.message}`, this.colorFor(level), data ?? '');

    if (level === 'error') this.openPanel();
  }

  private safeSerialize(data: unknown): unknown {
    if (data === undefined) return undefined;
    if (data instanceof Error) {
      return { __isError: true, name: data.name, message: data.message, stack: data.stack };
    }
    try {
      JSON.stringify(data);
      return data;
    } catch {
      return String(data);
    }
  }

  private colorFor(level: LogLevel) {
    switch (level) {
      case 'error':
        return 'color:#ff5555;font-weight:bold';
      case 'warn':
        return 'color:#e0c04b;font-weight:bold';
      case 'info':
        return 'color:#5bc0ff';
      default:
        return 'color:#aaaaaa';
    }
  }

  private formatEntryText(entry: LogEntry): string {
    const time = (entry.timestamp / 1000).toFixed(2);
    let text = `[${time}s] [${entry.level.toUpperCase()}] ${entry.message}`;

    if (entry.data !== undefined) {
      try {
        let dataStr: string;
        const d = entry.data as any;
        if (d && d.__isError) {
          dataStr = `${d.name}: ${d.message}\n${d.stack ?? ''}`;
        } else if (typeof entry.data === 'string') {
          dataStr = entry.data;
        } else {
          dataStr = JSON.stringify(entry.data, null, 2);
        }
        text += ` :: ${dataStr}`;
      } catch {
        text += ' :: [objeto não serializável]';
      }
    }
    return text;
  }

  private renderEntry(entry: LogEntry) {
    if (!this.contentEl) return;
    const line = document.createElement('div');
    line.className = `log-line log-${entry.level}`;
    line.textContent = this.formatEntryText(entry);
    this.contentEl.appendChild(line);
    while (this.contentEl.childElementCount > MAX_HISTORY) {
      this.contentEl.firstElementChild?.remove();
    }
    this.contentEl.scrollTop = this.contentEl.scrollHeight;
  }

  private renderAll() {
    if (!this.contentEl) return;
    this.contentEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (const entry of this.history) {
      const line = document.createElement('div');
      line.className = `log-line log-${entry.level}`;
      line.textContent = this.formatEntryText(entry);
      fragment.appendChild(line);
    }
    this.contentEl.appendChild(fragment);
    this.contentEl.scrollTop = this.contentEl.scrollHeight;
  }

  private updateBadge() {
    if (!this.fabEl) return;
    const total = this.errorCount + this.warnCount;
    this.fabEl.setAttribute('data-count', total > 0 ? String(total) : '');
    this.fabEl.classList.toggle('has-errors', this.errorCount > 0);
  }

  private saveToStorageNow() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ history: this.history, errorCount: this.errorCount, warnCount: this.warnCount })
      );
    } catch {
      // localStorage pode falhar (modo privado, cota excedida) - ignoramos silenciosamente
    }
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.history = (parsed.history ?? []).slice(-MAX_HISTORY);
      this.recountSeverity();
    } catch {
      // ignora storage corrompido
    }
  }

  private recountSeverity() {
    this.errorCount = this.history.filter((entry) => entry.level === 'error').length;
    this.warnCount = this.history.filter((entry) => entry.level === 'warn').length;
  }

  public clear() {
    this.deferredSave.cancel();
    this.history = [];
    this.errorCount = 0;
    this.warnCount = 0;
    if (this.contentEl) this.contentEl.innerHTML = '';
    this.updateBadge();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Gera e baixa um arquivo .txt real com todo o histórico de logs. */
  public exportToFile() {
    const lines = this.history.map((e) => this.formatEntryText(e));
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `dragon-miner-log-${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public debug(category: string, message: string, data?: unknown) {
    this.push('debug', category, message, data);
  }
  public info(category: string, message: string, data?: unknown) {
    this.push('info', category, message, data);
  }
  public warn(category: string, message: string, data?: unknown) {
    this.push('warn', category, message, data);
  }
  public error(category: string, message: string, data?: unknown) {
    this.push('error', category, message, data);
  }

  public formatError(err: unknown): string {
    if (err instanceof Error) return `${err.name}: ${err.message}`;
    return String(err);
  }

  public getHistory(): LogEntry[] {
    return [...this.history];
  }
}

export const Logger = new LoggerService();
