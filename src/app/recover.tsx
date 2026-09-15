import { Component, type ErrorInfo, type ReactNode } from 'react';

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
  location.replace(location.origin + location.pathname + '?r=' + Date.now());
};

const Screen = ({ detail }: { detail: string }) => (
  <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6 text-center">
    <div className="text-[19px] font-extrabold">That didn't load</div>
    <p className="text-[14px] text-muted">Something in the app crashed on the way up. Clearing this phone's copy and reloading almost always fixes it — your workouts and logs are on your account, not in what gets cleared.</p>
    <button className="rounded-xl bg-brand px-4 py-3 text-[15px] font-semibold text-white" onClick={() => void resetApp()}>
      Clear and reload
    </button>
    <pre className="overflow-x-auto rounded-lg bg-well p-3 text-left text-[11px] whitespace-pre-wrap text-muted">{detail}</pre>
  </div>
);

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
