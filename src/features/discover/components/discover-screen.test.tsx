import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { recommend } from '../recommend';
import { DiscoverScreen } from './discover-screen';

const fran: Runsheet = { id: 'cf-girls-fran', title: 'Fran', creator: 'CrossFit', source: { title: 'Fran', author: 'CrossFit', kind: 'benchmark' }, items: [] };
const ALL = [priyanka(), fran];
/** Four creators, no exercise in common: one session of Priyanka's circuit gives the ranking nothing to go on. */
const FEW: Runsheet[] = [
  ...ALL,
  { id: 'vid-burpees', title: 'Burpee blast', source: { title: 'Burpee blast', author: 'Sam Fixture', kind: 'video' }, items: [makeExercise(EX.bw_burpee, { forMode: 'minutes', forValue: 8 })] },
  { id: 'prog-lift-day-1', title: 'Day 1', program: { name: 'Lift', day: 'Day 1', order: 1 }, source: { title: 'Lift', author: 'Fixture Barbell Club', kind: 'program' }, items: [makeExercise(EX.bb_back_squat, { forMode: 'reps', forValue: 5 })] },
];
const ONE_SESSION: SessionResult[] = [{ runsheetId: priyanka().id!, startedAt: '2026-09-25T18:00:00Z', steps: [] }];

describe('DiscoverScreen For you', () => {
  it('shows a way to Search when history exists but the ranking returns nothing', () => {
    expect(recommend(FEW, ONE_SESSION)).toEqual([]);
    render(<DiscoverScreen workouts={FEW} results={ONE_SESSION} initialTab="recommended" onOpen={() => {}} />);
    expect(screen.getByText('Nothing to suggest yet')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search workouts, programs, creators')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Browse workouts'));
    expect(screen.getByPlaceholderText('Search workouts, programs, creators')).toBeInTheDocument();
  });
  it('keeps the cold-start hint and its list when there are no sessions', () => {
    render(<DiscoverScreen workouts={FEW} results={[]} initialTab="recommended" onOpen={() => {}} />);
    expect(screen.getByText(/Log a workout and this list learns what you like/)).toBeInTheDocument();
    expect(screen.getByText(priyanka().title)).toBeInTheDocument();
    expect(screen.queryByText('Nothing to suggest yet')).not.toBeInTheDocument();
  });
  it('shows no empty state when history yields a recommendation', () => {
    render(<DiscoverScreen workouts={FEW} results={ONE_SESSION} savedIds={['cf-girls-fran']} initialTab="recommended" onOpen={() => {}} />);
    expect(screen.getByText('Fran')).toBeInTheDocument();
    expect(screen.queryByText('Nothing to suggest yet')).not.toBeInTheDocument();
  });
});

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
