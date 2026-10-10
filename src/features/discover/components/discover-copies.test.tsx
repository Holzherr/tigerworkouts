import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Runsheet } from '@/features/runsheet/model';
import { DiscoverScreen } from './discover-screen';

const cf = (id: string, title: string): Runsheet => ({ id, title, source: { title, author: 'CrossFit', kind: 'benchmark' }, items: [] });
const ALL = [{ ...cf('u-1', 'Fran (mine)'), copyOf: 'fran', source: { title: 'Fran', kind: 'user' as const } }, cf('fran', 'Fran'), cf('cindy', 'Cindy')];
const cards = (name: RegExp) => screen.queryAllByRole('button', { name }).map(b => b.textContent);

describe('DiscoverScreen and your copies', () => {
  it('Saved shows your copy in place of the original it was made from', () => {
    render(<DiscoverScreen workouts={ALL} savedIds={['fran', 'cindy']} onOpen={() => {}} />);
    expect(cards(/^Fran/)).toEqual([expect.stringMatching(/mine/)]);
    expect(cards(/^Cindy/)).toHaveLength(1);
  });
  it('Search never lists a copy', () => {
    render(<DiscoverScreen workouts={ALL} initialTab="search" onOpen={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Search workouts/), { target: { value: 'fran' } });
    expect(cards(/^Fran/)).toEqual([expect.not.stringMatching(/mine/)]);
  });
});
