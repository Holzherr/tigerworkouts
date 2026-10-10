import { ChevronLeft, ClipboardList, LineChart, MessageSquare, Smartphone, UserPlus } from 'lucide-react';
import { Logo } from '@/shared/brand';
import { Button } from '@/shared/components/ui/button';

export const TESTFLIGHT = 'https://testflight.apple.com/join/r8uFaWKY';
export const IPHONE_PAGE = 'https://brambruesch.dev/tiger';

export interface CoachesPageProps {
  onBack: () => void;
  /** To the coach dashboard (#/coach). */
  onStart: () => void;
  /** Screenshots of the real screens; left out (Storybook, tests), the page shows none. */
  shots?: { dashboard: string; client: string; join: string };
}

const COACH_STEPS: { icon: React.ReactNode; title: string; body: string }[] = [
  { icon: <UserPlus />, title: 'Invite', body: 'Make a link per client and send it however you like. They sign in and accept.' },
  { icon: <ClipboardList />, title: 'Assign', body: 'Send one of your own workouts, with a note. It shows at the top of their app.' },
  { icon: <LineChart />, title: 'See what they did', body: 'Every session they log, with each exercise’s sets against what you set: hit, short or skipped.' },
  { icon: <MessageSquare />, title: 'Notes', body: 'Leave a note on a session. They reply from the app.' },
];

const CLIENT_STEPS = [
  ['Accept', 'the invite link from your coach (a free account, no password).'],
  ['Find', 'the workout under From your coach, top of Discover.'],
  ['Run it', 'with the timer on your iPhone or in the browser. It logs itself.'],
];

const FAQ = [
  ['What does it cost?', 'Nothing. Coaching is free, for you and your clients.'],
  ['Who sees what I assign?', 'Only that client. Your workouts stay private unless you make them public on your creator page.'],
  ['Do clients need an account?', 'Yes, a free one, to link to you: that is how you see their sessions. Without one anyone can still run a workout you share as a link.'],
  ['What happens when coaching ends?', 'Either of you can end it. You stop seeing their sessions straight away, and they stop seeing what you sent.'],
  ['Is there an app?', 'Clients train on iPhone (beta, via TestFlight) or in the browser. You run your dashboard on the web.'],
];

/** #/coaches: how coaching works, for the PT and for the client, with the real screens and a short FAQ. */
export const CoachesPage = ({ onBack, onStart, shots }: CoachesPageProps) => (
  <div className="flex h-full min-h-0 flex-col bg-canvas">
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="safe-top sticky top-0 z-20 border-b border-line/60 bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1 text-[13px] text-muted">
            <ChevronLeft className="size-4" />
            <Logo size="sm" />
          </button>
          <Button variant="ghost" size="sm" onClick={onStart}>
            Start coaching
          </Button>
        </div>
      </div>

      <section className="mx-auto max-w-5xl px-5 pt-8 pb-6">
        <div className="text-[12px] font-bold tracking-widest text-brand uppercase">For coaches</div>
        <h1 className="mt-2 text-[30px] leading-[1.1] font-black lg:text-[44px]">Send clients a workout. See what they did.</h1>
        <p className="mt-3 max-w-[60ch] text-[15px] text-body lg:text-[17px]">You build the session, your client runs it with a guided timer and every set is logged. You see their sets next to what you set, and leave a note. Free.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="lg" onClick={onStart}>
            Open the coach dashboard
          </Button>
          <a href={TESTFLIGHT} className="inline-flex h-13 items-center gap-2 rounded-tile border border-line bg-surface px-5 text-[17px] font-bold">
            <Smartphone className="size-5" /> iPhone beta
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-6">
        <h2 className="text-[13px] font-bold tracking-widest text-muted uppercase">For you, the coach</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COACH_STEPS.map((s, i) => (
            <li key={s.title} className="rounded-card border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-control bg-brand-soft text-brand [&_svg]:size-5">{s.icon}</span>
                <span className="text-[15px] font-bold">
                  {i + 1}. {s.title}
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-body">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {shots && (
        <section className="mx-auto max-w-5xl px-5 py-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [shots.dashboard, 'Your clients this week, with who has gone quiet'],
              [shots.client, 'A client’s session: each exercise against what you set'],
              [shots.join, 'What your client sees when they open your invite'],
            ].map(([src, caption]) => (
              <figure key={src} className="space-y-2">
                <img src={src} alt={caption} loading="lazy" className="w-full rounded-card border border-line shadow-lift" />
                <figcaption className="text-[12px] text-muted">{caption} (example data)</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="bg-ink text-white">
        <div className="mx-auto max-w-5xl px-5 py-8">
          <h2 className="text-[13px] font-bold tracking-widest text-white/60 uppercase">For your client</h2>
          <ol className="mt-3 grid gap-3 lg:grid-cols-3">
            {CLIENT_STEPS.map(([verb, rest], i) => (
              <li key={verb} className="flex gap-3 text-[15px]">
                <span className="font-black text-brand">{i + 1}.</span>
                <span>
                  <b>{verb}</b> {rest}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[13px] text-white/70">
            iPhone app: <a href={TESTFLIGHT} className="font-bold text-white underline">join the TestFlight beta</a> or read more at <a href={IPHONE_PAGE} className="font-bold text-white underline">brambruesch.dev/tiger</a>.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-8">
        <h2 className="text-[13px] font-bold tracking-widest text-muted uppercase">Questions</h2>
        <dl className="mt-3 space-y-3">
          {FAQ.map(([q, a]) => (
            <div key={q} className="rounded-card border border-line bg-surface p-4">
              <dt className="text-[15px] font-bold">{q}</dt>
              <dd className="mt-1 text-[14px] text-body">{a}</dd>
            </div>
          ))}
        </dl>
        <Button block size="lg" variant="dark" className="mt-6" onClick={onStart}>
          Start coaching
        </Button>
      </section>
    </div>
  </div>
);
