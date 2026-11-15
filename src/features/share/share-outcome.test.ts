import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText, shareLink, shareToast } from './share';

afterEach(() => vi.unstubAllGlobals());

describe('sharing a link', () => {
  it('says nothing when the share sheet is closed without sharing', async () => {
    vi.stubGlobal('navigator', { share: () => Promise.reject(new DOMException('Share canceled', 'AbortError')) });
    const out = await shareLink('TigerWorkouts', 'https://tigerworkouts.com/');
    expect(out).toBe('cancelled');
    expect(shareToast(out)).toBeNull();
  });
  it('still says when it could not share', async () => {
    vi.stubGlobal('navigator', { share: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) });
    expect(shareToast(await shareLink('TigerWorkouts', 'https://tigerworkouts.com/'))).toBe('Could not share');
  });
  it('copies when there is no share sheet', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(shareToast(await shareLink('TigerWorkouts', 'https://tigerworkouts.com/'))).toBe('Link copied');
    expect(writeText).toHaveBeenCalledWith('https://tigerworkouts.com/');
  });
  it('reports whether text was copied', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() } });
    expect(await copyText('a')).toBe(true);
    vi.stubGlobal('navigator', {});
    expect(await copyText('a')).toBe(false);
  });
});
