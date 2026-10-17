import { fireEvent, render, screen, within } from '@testing-library/react';
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
const OWN = [priyanka().id!];

describe('DiscoverScreen header', () => {
  it('has the Workouts title, a round New workout, a search field and Mine | Discover, Mine on', () => {
    const onCreate = vi.fn();
    render(<DiscoverScreen workouts={ALL} onOpen={() => {}} onCreate={onCreate} />);
    expect(screen.getByRole('heading', { name: 'Workouts' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New workout' }));
    expect(onCreate).toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Mine' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByText('For you')).not.toBeInTheDocument();
  });
});

describe('DiscoverScreen Mine', () => {
  it('lists your own and saved workouts with a meta line and a play that starts straight away', () => {
    const onStart = vi.fn();
    const onOpen = vi.fn();
    render(<DiscoverScreen workouts={ALL} ownIds={OWN} savedIds={['cf-girls-fran']} results={ONE_SESSION} onOpen={onOpen} onStart={onStart} />);
    expect(screen.getByText(/· last done/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start Fran' }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'cf-girls-fran' }), 'saved');
    fireEvent.click(screen.getByText('Fran'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'cf-girls-fran' }), 'saved');
  });
  it('puts a workout made after your last session above the one you did, and calls it new', () => {
    const fresh: Runsheet = { id: 'u-fresh', title: 'Fresh one', createdAt: '2026-10-15T09:00:00Z', source: { title: 'Fresh one', author: 'AI Coach', kind: 'user' }, items: [] };
    render(<DiscoverScreen workouts={[priyanka(), fresh]} ownIds={[...OWN, 'u-fresh']} results={ONE_SESSION} onOpen={() => {}} />);
    const fresh_ = screen.getByText('Fresh one');
    const done = screen.getByText(priyanka().title);
    expect(fresh_.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/min · new$/)).toBeInTheDocument();
  });
  it('lists what a coach sent first, once, marked from the coach', () => {
    const onStart = vi.fn();
    render(<DiscoverScreen workouts={ALL} ownIds={OWN} savedIds={['cf-girls-fran']} fromCoach={[{ id: 'a1', runsheet: fran, coachName: 'Sam', done: false }]} onOpen={() => {}} onStart={onStart} />);
    const rows = screen.getAllByRole('button', { name: /^Start / }).map(b => b.getAttribute('aria-label'));
    expect(rows).toEqual(['Start Fran', `Start ${priyanka().title}`]);
    expect(screen.getByText(/from Sam/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start Fran' }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'cf-girls-fran' }), 'coach');
  });
  it('has no carousels, no Up next and no week line', () => {
    render(<DiscoverScreen workouts={FEW} ownIds={OWN} results={ONE_SESSION} onOpen={() => {}} />);
    expect(screen.queryByText(/this week/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Your last workout/)).not.toBeInTheDocument();
  });
  it('sends an empty Mine to Discover', () => {
    render(<DiscoverScreen workouts={FEW} onOpen={() => {}} />);
    expect(screen.getByText('No workouts yet')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Discover workouts'));
    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('DiscoverScreen Discover', () => {
  it('shows the For you picks under their reason above the catalogue, until a chip is on', () => {
    const recs = recommend(FEW, ONE_SESSION, ['cf-girls-fran']);
    expect(recs.length).toBeGreaterThan(0);
    render(<DiscoverScreen workouts={FEW} results={ONE_SESSION} savedIds={['cf-girls-fran']} initialTab="discover" onOpen={() => {}} />);
    const section = screen.getByRole('region', { name: recs[0].reason });
    expect(within(section).getByText(recs[0].runsheet.title)).toBeInTheDocument();
    expect(screen.getByText(/Everything ·/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Benchmarks' }));
    expect(screen.queryByRole('region', { name: recs[0].reason })).not.toBeInTheDocument();
  });
  it('lists the catalogue alone when the ranking returns nothing', () => {
    expect(recommend(FEW, ONE_SESSION)).toEqual([]);
    render(<DiscoverScreen workouts={FEW} results={ONE_SESSION} initialTab="discover" onOpen={() => {}} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByText('Burpee blast')).toBeInTheDocument();
  });
  it('names the list a row was tapped in', () => {
    const onOpen = vi.fn();
    render(<DiscoverScreen workouts={ALL} results={[]} initialTab="discover" onOpen={onOpen} />);
    const rec = recommend(ALL, [])[0];
    fireEvent.click(within(screen.getByRole('region', { name: rec.reason })).getByText(rec.runsheet.title));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: rec.runsheet.id }), 'recommended');
  });
});

describe('DiscoverScreen search', () => {
  it('lists matches from everything and names search', () => {
    const onOpen = vi.fn();
    render(<DiscoverScreen workouts={ALL} onOpen={onOpen} />);
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'fran' } });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Fran'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'cf-girls-fran' }), 'search');
  });
});
