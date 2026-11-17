import { describe, expect, it } from 'vitest';
import type { Runsheet } from '@/features/runsheet/model';
import { sendChoices } from './send-choices';

const w = (id: string, title: string, extra: Partial<Runsheet> = {}): Runsheet => ({ id, title, items: [], ...extra });

describe('sendChoices', () => {
  const own = [w('u-1', 'Legs day'), w('u-2', 'Cindy', { copyOf: 'cindy' })];
  const saved = [w('pub-1', 'Upper body'), w('u-1', 'Legs day')];
  const catalogue = [w('cindy', 'Cindy'), w('chelsea', 'Chelsea', { description: 'Like Cindy, every minute' }), w('sl-a', 'StrongLifts A'), w('pub-1', 'Upper body')];

  it('lists own and saved with no query, and no catalogue', () => {
    const c = sendChoices(own, saved, catalogue, '');
    expect(c.own.map(r => r.id)).toEqual(['u-1', 'u-2']);
    expect(c.saved.map(r => r.id)).toEqual(['pub-1']);
    expect(c.catalogue).toEqual([]);
  });

  it('searches all three, best catalogue match first, nothing listed twice', () => {
    const c = sendChoices(own, saved, catalogue, 'cindy');
    expect(c.own.map(r => r.id)).toEqual(['u-2']);
    expect(c.saved).toEqual([]);
    // Cindy itself is the coach's copy (listed under own); Chelsea only mentions it.
    expect(c.catalogue.map(r => r.id)).toEqual(['chelsea']);
    expect(sendChoices(own, saved, catalogue, 'strong').catalogue.map(r => r.id)).toEqual(['sl-a']);
    expect(sendChoices(own, saved, catalogue, 'upper').catalogue).toEqual([]);
  });
});
