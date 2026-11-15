import { Component, useState, type ErrorInfo, type ReactNode } from 'react';

const ISSUES = 'https://github.com/Holzherr/tigerworkouts/issues/new';
/** Where a reload was last asked for after a crash, to tell a crash that comes straight back. */
const CRASH_KEY = 'tiger:crash';
const AGAIN_MS = 60_000;

/** Clears what a stale build can leave behind (the service worker and its caches), then reloads
 * onto the current one. Workouts, history and a session in progress are not touched. */
export const resetApp = async () => {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs ?? []).map(r => r.unregister()));
  } catch {
    /* no service worker */
  }
  try {
    await Promise.all((await caches.keys()).map(k => caches.delete(k)));
  } catch {
    /* no cache storage */
  }
  location.replace(location.origin + location.pathname);
};

/** The session in progress kept on this device, read without the timer's code: that may be what crashed. */
export const keptRunTitle = (): string | undefined => {
  try {
    const r = JSON.parse(localStorage.getItem('tiger:run') || 'null');
    return r && r.phase !== 'done' && typeof r.title === 'string' ? r.title : undefined;
  } catch {
    return undefined;
  }
};

/** Reload where you are. If this screen crashed again within a minute of the last reload, go
 * home instead: the session in progress is offered there. Nothing on the device is cleared. */
export const reloadApp = () => {
  let again = false;
  try {
    const last = JSON.parse(sessionStorage.getItem(CRASH_KEY) || 'null');
    again = !!last && last.hash === location.hash && Date.now() - last.at < AGAIN_MS;
    sessionStorage.setItem(CRASH_KEY, JSON.stringify({ hash: location.hash, at: Date.now() }));
  } catch {
    /* no session storage */
  }
  if (again) location.hash = '#/discover';
  location.reload();
};

const Screen = ({ detail }: { detail: string }) => {
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [kept] = useState(keptRunTitle);
  const report = `${detail}\n\n${location.href}\nbuild ${__BUILD__}\n${navigator.userAgent}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.getElementById('tw-report');
      if (el) getSelection()?.selectAllChildren(el);
    }
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <div className="text-center text-[19px] font-extrabold">That didn't load</div>
      <p className="text-center text-[14px] text-muted">Something in the app crashed. Reload to carry on: your workouts and history are kept.</p>
      {kept && <p className="rounded-xl bg-brand-soft px-3 py-2 text-center text-[14px] font-semibold text-ink">Your {kept} session is kept on this device. Reload, then open it again.</p>}
      <button className="min-h-11 rounded-xl bg-brand px-4 py-3 text-[15px] font-semibold text-white" onClick={reloadApp}>
        Reload
      </button>
      <div className="flex gap-2">
        <button className="min-h-11 flex-1 rounded-xl border border-line px-4 py-3 text-[15px] font-semibold" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy details'}
        </button>
        <a className="min-h-11 flex-1 rounded-xl border border-line px-4 py-3 text-center text-[15px] font-semibold" href={`${ISSUES}?title=${encodeURIComponent('Crash: ' + detail.slice(0, 80))}&body=${encodeURIComponent('```\n' + report + '\n```')}`} target="_blank" rel="noreferrer">
          Report
        </a>
      </div>
      {clearing ? (
        <div className="rounded-xl border border-line p-3">
          <p className="text-[13px] text-muted">This removes the copy of the app stored on this device and fetches it again. It needs a connection. Your workouts, history{kept ? ' and the session in progress' : ''} stay.</p>
          <div className="mt-2 flex gap-2">
            <button className="min-h-11 flex-1 rounded-xl border border-line px-4 text-[15px] font-semibold text-danger" onClick={() => void resetApp()}>
              Clear and reload
            </button>
            <button className="min-h-11 flex-1 rounded-xl px-4 text-[15px] font-semibold text-muted" onClick={() => setClearing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="min-h-11 text-[13px] font-semibold text-muted underline decoration-dotted underline-offset-2" onClick={() => setClearing(true)}>
          Still broken? Clear the app's offline copy
        </button>
      )}
      <pre id="tw-report" className="overflow-x-auto rounded-lg bg-well p-3 text-[11px] whitespace-pre-wrap text-muted select-all">
        {report}
      </pre>
    </div>
  );
};

interface State {
  detail: string | null;
}

/** A render crash blanks the whole React tree; show the way out instead of a white screen. */
export class Recover extends Component<{ children: ReactNode }, State> {
  state: State = { detail: null };
  static getDerivedStateFromError(error: unknown): State {
    return { detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[tiger] render crash', error, info.componentStack);
  }
  render() {
    return this.state.detail === null ? this.props.children : <Screen detail={this.state.detail} />;
  }
}

interface ContainProps {
  children: ReactNode;
  /** Mount the children afresh after a crash instead of leaving them out. A second crash within
   * `AGAIN_MS` is passed up to the boundary above. */
  retry?: boolean;
  /** What the part is, for the console line. */
  name?: string;
}
interface ContainState {
  crashed: boolean;
  again: unknown;
  round: number;
}

/**
 * Keeps a crash in one part of the page inside that part. The update prompt, the feedback sheet
 * and the storage notice sit beside the app: one of them crashing must not take a running timer
 * with it, so it is left out and the rest carries on. With `retry` (the timer screen, whose run
 * lives above it) the part is mounted again with its own state reset.
 */
export class Contain extends Component<ContainProps, ContainState> {
  state: ContainState = { crashed: false, again: undefined, round: 0 };
  private last = 0;
  static getDerivedStateFromError(): Partial<ContainState> {
    return { crashed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[tiger] crash contained${this.props.name ? ` in ${this.props.name}` : ''}`, error, info.componentStack);
    if (!this.props.retry) return;
    const now = Date.now();
    const soon = now - this.last < AGAIN_MS;
    this.last = now;
    this.setState(s => (soon ? { ...s, again: error } : { crashed: false, again: undefined, round: s.round + 1 }));
  }
  render() {
    if (this.state.again !== undefined) throw this.state.again;
    if (this.state.crashed) return null;
    return <Keyed key={this.state.round}>{this.props.children}</Keyed>;
  }
}
const Keyed = ({ children }: { children: ReactNode }) => children;
