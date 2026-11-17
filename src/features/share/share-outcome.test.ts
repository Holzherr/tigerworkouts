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
  it('says who can open a private workout shared by its link', () => {
    expect(shareToast('copied', true)).toBe('Link copied · anyone with the link can open it');
    expect(shareToast('shared', true)).toBe('Shared · anyone with the link can open it');
    expect(shareToast('cancelled', true)).toBeNull();
  });
  it('reports whether text was copied', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() } });
    expect(await copyText('a')).toBe(true);
    vi.stubGlobal('navigator', {});
    expect(await copyText('a')).toBe(false);
  });
});

describe('the link Share sends', () => {
  const r = { id: 'cf-girls-cindy', title: 'Cindy', items: [{ kind: 'rest' as const, id: 'r1', seconds: 30 }] };
  it('is the short one for a workout anyone can open by id', async () => {
    const { linkFor } = await import('./share');
    expect(linkFor(r, true, 'https://tigerworkouts.com/')).toBe('https://tigerworkouts.com/#/w/cf-girls-cindy');
  });
  it('carries the whole workout when it is private, or has no id yet', async () => {
    const { linkFor, decodeShared } = await import('./share');
    const link = linkFor({ ...r, id: 'u-abc' }, false, 'https://tigerworkouts.com/');
    expect(link.startsWith('https://tigerworkouts.com/#/import/')).toBe(true);
    expect(decodeShared(link.split('#/import/')[1])?.title).toBe('Cindy');
    expect(linkFor({ title: 'Cindy', items: r.items }, true, 'https://tigerworkouts.com/')).toContain('#/import/');
  });
});
