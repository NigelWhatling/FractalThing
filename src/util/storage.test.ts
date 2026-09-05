import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readStoredValue,
  removeStoredValue,
  writeStoredValue,
} from './storage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('optional browser storage', () => {
  it('handles a missing storage API', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readStoredValue('theme')).toBeNull();
    expect(writeStoredValue('theme', 'dark')).toBe(false);
    expect(removeStoredValue('theme')).toBe(false);
  });

  it('handles access denied by the browser property getter', () => {
    vi.stubGlobal('localStorage', {});
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('Denied', 'SecurityError');
      },
    });
    expect(readStoredValue('theme')).toBeNull();
    expect(writeStoredValue('theme', 'dark')).toBe(false);
    expect(removeStoredValue('theme')).toBe(false);
  });

  it('handles operation failures, including a full quota', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('Denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('Full', 'QuotaExceededError');
      },
      removeItem: () => {
        throw new DOMException('Denied', 'SecurityError');
      },
    });
    expect(readStoredValue('theme')).toBeNull();
    expect(writeStoredValue('theme', 'dark')).toBe(false);
    expect(removeStoredValue('theme')).toBe(false);
  });

  it('retains preferences when storage is available', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    expect(writeStoredValue('theme', 'dark')).toBe(true);
    expect(readStoredValue('theme')).toBe('dark');
    expect(removeStoredValue('theme')).toBe(true);
    expect(readStoredValue('theme')).toBeNull();
  });
});
