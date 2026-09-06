import { describe, expect, it } from 'vitest';
import { resolveActiveRenderBackend } from '../engine/renderBackend';

describe('resolveActiveRenderBackend', () => {
  it('keeps GPU active while capabilities are pending or available', () => {
    expect(resolveActiveRenderBackend('gpu', null)).toBe('gpu');
    expect(resolveActiveRenderBackend('gpu', { available: true })).toBe('gpu');
  });

  it('falls back to CPU after GPU unavailability is confirmed', () => {
    expect(resolveActiveRenderBackend('gpu', { available: false })).toBe('cpu');
  });

  it('leaves an explicit CPU selection unchanged', () => {
    expect(resolveActiveRenderBackend('cpu', { available: true })).toBe('cpu');
  });
});
