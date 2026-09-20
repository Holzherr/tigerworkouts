import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { priyanka } from '@/features/runsheet/fixtures';
import type { SessionOrigin, SessionResult } from '@/features/runsheet/progression';
import { ResultSheet } from './result-sheet';

const save = (startedFrom?: SessionOrigin): SessionResult => {
  const onSave = vi.fn();
  render(<ResultSheet runsheet={priyanka()} startedFrom={startedFrom} onSave={onSave} />);
  fireEvent.click(screen.getByText('Save result'));
  return onSave.mock.calls[0][0];
};

describe('ResultSheet startedFrom', () => {
  it.each(['recommended', 'saved', 'search'] as const)('saves the result with startedFrom %s', from => {
    expect(save(from).startedFrom).toBe(from);
  });
  it('leaves startedFrom unset when the origin is unknown', () => {
    expect(save().startedFrom).toBeUndefined();
  });
});
