import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import { useRunner } from './use-runner';

const sheet: Runsheet = { id: 'w', title: 'W', items: [{ ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 5 }), id: 'a' }, { kind: 'rest', id: 'r', seconds: 30 }, { ...makeExercise(EX.bw_squat, { forMode: 'reps', forValue: 5 }), id: 'b' }] };

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'wakeLock');
  Reflect.deleteProperty(document, 'hidden');
});

describe('Discard', () => {
  it('keeps nothing on the device, even when the run moves on before the page is left', () => {
    const { result } = renderHook(() => useRunner(sheet));
    expect(localStorage.getItem('tiger:run')).not.toBeNull();
    act(() => result.current.act.discard());
    act(() => result.current.act.skip());
    act(() => result.current.act.done());
    expect(localStorage.getItem('tiger:run')).toBeNull();
  });
});

describe('with the screen off and on again', () => {
  it('takes the wake lock again when the page comes back', async () => {
    const request = vi.fn(async () => ({ release: vi.fn(async () => {}), addEventListener: vi.fn() }));
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    renderHook(() => useRunner(sheet));
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);
    // The browser drops the lock when the page is hidden.
    await act(async () => setHidden(true));
    await act(async () => setHidden(false));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('wakes the audio on Resume and when the page comes back', () => {
    const resume = vi.fn(async () => {});
    class FakeAudio {
      state = 'suspended';
      resume = resume;
    }
    vi.stubGlobal('AudioContext', FakeAudio);
    const { result } = renderHook(() => useRunner(sheet));
    act(() => result.current.act.pause());
    act(() => result.current.act.resume());
    expect(resume).toHaveBeenCalledTimes(1);
    act(() => setHidden(false));
    expect(resume).toHaveBeenCalledTimes(2);
  });
});
