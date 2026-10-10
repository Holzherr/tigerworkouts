import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { priyanka } from '../fixtures';
import { RunsheetList } from './runsheet-list';
import * as stories from './runsheet-list.stories';

const noop = { onChange: () => {}, onPickExercise: async () => null };

describe('RunsheetList', () => {
  it('has one drag behaviour: no variant prop, and one story per list shape rather than per style', () => {
    // @ts-expect-error the Classic / seams / buttons styles and their prop went with the tiger:dnd setting
    const withVariant = <RunsheetList items={[]} {...noop} variant="classic" />;
    expect(withVariant).toBeTruthy();
    expect(Object.keys(stories).filter(k => k !== 'default').sort()).toEqual(['Empty', 'LooseSteps', 'PriyankasCircuit']);
  });

  it('renders every block of a circuit', () => {
    render(<RunsheetList items={priyanka().items} {...noop} />);
    expect(screen.getByText('Swings + incline press')).toBeTruthy();
    expect(screen.getByText('Sprints')).toBeTruthy();
    expect(screen.getByText('Swings + lateral raises')).toBeTruthy();
  });
});
