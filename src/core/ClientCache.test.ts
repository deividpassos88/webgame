import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_STORAGE_KEY } from '../profile/PlayerProfile';
import { Logger } from '../utils/Logger';
import { CLIENT_CACHE_BUILD_KEY, refreshClientCache } from './ClientCache';

const savedProfile = JSON.stringify({
  selectedClass: 'mage',
  progression: { level: 19, experience: 1234 },
  backpack: [{ itemId: 'runic-crystal', quantity: 27 }],
});

function browser(search = '', previousBuild: string | null = 'old-build') {
  const values = new Map<string, string>([
    [PROFILE_STORAGE_KEY, savedProfile], ['audio-volume', '0.6'],
  ]);
  if (previousBuild !== null) values.set(CLIENT_CACHE_BUILD_KEY, previousBuild);
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
  const caches = {
    keys: vi.fn().mockResolvedValue(['old-textures', 'old-models']),
    delete: vi.fn().mockResolvedValue(true),
  };
  vi.stubGlobal('window', { location: { search }, localStorage: storage, caches });
  return { values, storage, caches };
}

beforeEach(() => {
  vi.spyOn(Logger, 'info').mockImplementation(() => {});
  vi.spyOn(Logger, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('client asset cache refresh', () => {
  it.each(['old-build', null])('preserves the save when replacing build marker %s', async (previousBuild) => {
    const { values, storage, caches } = browser('', previousBuild);
    await refreshClientCache('new-build');
    expect(caches.delete.mock.calls).toEqual([['old-textures'], ['old-models']]);
    expect(values.get(PROFILE_STORAGE_KEY)).toBe(savedProfile);
    expect(values.get('audio-volume')).toBe('0.6');
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(values.get(CLIENT_CACHE_BUILD_KEY)).toBe('new-build');
  });

  it('supports a forced cache-only refresh even on the same build', async () => {
    const { values, storage, caches } = browser('?clearCache=1', 'same-build');
    await refreshClientCache('same-build');
    expect(caches.delete).toHaveBeenCalledTimes(2);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(values.get(PROFILE_STORAGE_KEY)).toBe(savedProfile);
  });

  it('does not clear caches on every ordinary reload of the same build', async () => {
    const { storage, caches } = browser('', 'same-build');
    await refreshClientCache('same-build');
    expect(caches.keys).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it.each(['resetProfile', 'clearProfile', 'freshProfile'])('only resets the profile with explicit %s=1', async (parameter) => {
    const { values, storage, caches } = browser(`?${parameter}=1`, 'same-build');
    await refreshClientCache('same-build');
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(PROFILE_STORAGE_KEY);
    expect(values.has(PROFILE_STORAGE_KEY)).toBe(false);
    expect(values.get('audio-volume')).toBe('0.6');
    expect(caches.delete).toHaveBeenCalledTimes(2);
  });

  it('preserves saves when Cache Storage is unavailable', async () => {
    const { values, storage } = browser();
    vi.stubGlobal('window', { location: { search: '' }, localStorage: storage });
    await refreshClientCache('new-build');
    expect(values.get(PROFILE_STORAGE_KEY)).toBe(savedProfile);
    expect(values.get(CLIENT_CACHE_BUILD_KEY)).toBe('new-build');
  });

  it('does not erase saves or mark success when clearing fails', async () => {
    const { values, storage, caches } = browser();
    caches.delete.mockRejectedValue(new Error('Cache Storage unavailable'));
    await expect(refreshClientCache('new-build')).resolves.toBeUndefined();
    expect(Logger.warn).toHaveBeenCalledTimes(1);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(values.get(PROFILE_STORAGE_KEY)).toBe(savedProfile);
    expect(values.get(CLIENT_CACHE_BUILD_KEY)).toBe('old-build');
  });

  it('does not block startup when browser storage is inaccessible', async () => {
    vi.stubGlobal('window', {
      location: { search: '?clearCache=1' },
      get localStorage() { throw new Error('Storage blocked'); },
    });
    await expect(refreshClientCache('new-build')).resolves.toBeUndefined();
    expect(Logger.warn).toHaveBeenCalledTimes(1);
  });
});
