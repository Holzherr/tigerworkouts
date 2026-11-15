import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Contain, Recover, keptRunTitle } from './recover';

const Boom = ({ when = true }: { when?: boolean }) => {
  if (when) throw new Error('boom');
  return <div>fine</div>;
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the recovery screen', () => {
  it('offers Reload first and clears nothing until asked twice', () => {
    render(
      <Recover>
        <Boom />
      </Recover>
    );
    const buttons = screen.getAllByRole('button').map(b => b.textContent?.trim());
    expect(buttons[0]).toBe('Reload');
    expect(buttons).not.toContain('Clear and reload');
    fireEvent.click(screen.getByRole('button', { name: /Clear the app's offline copy/ }));
    expect(screen.getByText(/Your workouts, history stay/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear and reload' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Clear and reload' })).toBeNull();
  });

  it('says a session in progress is kept', () => {
    localStorage.setItem('tiger:run', JSON.stringify({ title: 'Leg day', phase: 'running', savedAt: Date.now() }));
    render(
      <Recover>
        <Boom />
      </Recover>
    );
    expect(screen.getByText('Your Leg day session is kept on this device. Reload, then open it again.')).toBeTruthy();
    // The crash and the screen leave the run where it was.
    expect(keptRunTitle()).toBe('Leg day');
  });

  it('does not offer a finished run', () => {
    localStorage.setItem('tiger:run', JSON.stringify({ title: 'Leg day', phase: 'done' }));
    expect(keptRunTitle()).toBeUndefined();
  });
});

describe('a crash beside the app', () => {
  it('leaves the app, and a running timer in it, on screen', () => {
    render(
      <>
        <Recover>
          <div>timer running</div>
        </Recover>
        <Contain name="feedback">
          <Boom />
        </Contain>
      </>
    );
    expect(screen.getByText('timer running')).toBeTruthy();
    expect(screen.queryByText("That didn't load")).toBeNull();
  });
});

describe('a crash in the timer screen', () => {
  // The run lives in the parent, as it does in the app; the screen under Contain can crash.
  const Session = () => {
    const [crash, setCrash] = useState(false);
    const [set, setSet] = useState(3);
    return (
      <Recover>
        <button onClick={() => setCrash(true)}>open sheet</button>
        <button onClick={() => setSet(n => n + 1)}>tick</button>
        <Contain retry>
          <Screen set={set} crash={crash} />
        </Contain>
      </Recover>
    );
  };
  let mounts = 0;
  const Screen = ({ set, crash }: { set: number; crash: boolean }) => {
    const [first] = useState(() => ++mounts);
    if (crash && first === mounts && mounts % 2 === 1) throw new Error('sheet crashed');
    return <div>set {set}</div>;
  };

  it('puts the screen up again with the run as it was', () => {
    mounts = 0;
    render(<Session />);
    fireEvent.click(screen.getByText('tick'));
    fireEvent.click(screen.getByText('open sheet'));
    expect(screen.getByText('set 4')).toBeTruthy();
    expect(screen.queryByText("That didn't load")).toBeNull();
  });

  it('hands a crash that comes straight back to the recovery screen', () => {
    render(
      <Recover>
        <Contain retry>
          <Boom />
        </Contain>
      </Recover>
    );
    expect(screen.getByText("That didn't load")).toBeTruthy();
    expect(screen.getAllByRole('button')[0].textContent).toBe('Reload');
  });
});
