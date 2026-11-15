import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorScreen } from './creator-screen';

afterEach(cleanup);

describe('a creator page', () => {
  it('that could not be fetched says so and tries again, not "No creator by that name"', () => {
    const onRetry = vi.fn();
    render(<CreatorScreen profile={null} workouts={[]} onRetry={onRetry} onOpen={() => {}} />);
    expect(screen.getByText('Could not load this page. Check your connection.')).toBeTruthy();
    expect(screen.queryByText('No creator by that name.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
  it('still says when there is no such creator', () => {
    render(<CreatorScreen profile={null} workouts={[]} onOpen={() => {}} />);
    expect(screen.getByText('No creator by that name.')).toBeTruthy();
  });
});
