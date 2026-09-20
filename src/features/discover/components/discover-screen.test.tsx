import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { priyanka } from '@/features/runsheet/fixtures';
import type { Runsheet } from '@/features/runsheet/model';
import { DiscoverScreen } from './discover-screen';

const fran: Runsheet = { id: 'cf-girls-fran', title: 'Fran', creator: 'CrossFit', source: { title: 'Fran', author: 'CrossFit', kind: 'benchmark' }, items: [] };
const ALL = [priyanka(), fran];

describe('DiscoverScreen onOpen', () => {
  it('names the For you tab when a recommended card is tapped', () => {
    const onOpen = vi.fn();
    render(<DiscoverScreen workouts={ALL} results={[]} initialTab="recommended" onOpen={onOpen} />);
    fireEvent.click(screen.getByText(priyanka().title));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: priyanka().id }), 'recommended');
  });
  it('names the Saved tab when a saved card is tapped', () => {
    const onOpen = vi.fn();
    render(<DiscoverScreen workouts={ALL} savedIds={['cf-girls-fran']} initialTab="saved" onOpen={onOpen} />);
    fireEvent.click(screen.getByText('Fran'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'cf-girls-fran' }), 'saved');
  });
  it('names search when a result is tapped', () => {
    const onOpen = vi.fn();
    render(<DiscoverScreen workouts={ALL} initialTab="search" onOpen={onOpen} />);
    fireEvent.change(screen.getByPlaceholderText('Search workouts, programs, creators'), { target: { value: 'fran' } });
    fireEvent.click(screen.getByText('Fran'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'cf-girls-fran' }), 'search');
  });
});
