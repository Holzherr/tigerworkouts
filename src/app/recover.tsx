import { Component, useState, type ErrorInfo, type ReactNode } from 'react';

const ISSUES = 'https://github.com/Holzherr/tigerworkouts/issues/new';

/** Wipes everything a stale build can leave behind, then reloads onto the current one. */
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

const Screen = ({ detail }: { detail: string }) => {
  const [copied, setCopied] = useState(false);
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
      <p className="text-center text-[14px] text-muted">Something in the app crashed on the way up. Clearing this phone's copy and reloading almost always fixes it — your workouts and logs are on your account, not in what gets cleared.</p>
      <button className="rounded-xl bg-brand px-4 py-3 text-[15px] font-semibold text-white" onClick={() => void resetApp()}>
        Clear and reload
      </button>
      <div className="flex gap-2">
        <button className="flex-1 rounded-xl border border-line px-4 py-3 text-[15px] font-semibold" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy details'}
        </button>
        <a className="flex-1 rounded-xl border border-line px-4 py-3 text-center text-[15px] font-semibold" href={`${ISSUES}?title=${encodeURIComponent('Crash: ' + detail.slice(0, 80))}&body=${encodeURIComponent('```\n' + report + '\n```')}`} target="_blank" rel="noreferrer">
          Report
        </a>
      </div>
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
