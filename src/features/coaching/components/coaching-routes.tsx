/**
 * The coaching screens wired to the cloud (src/features/cloud/coaching.ts). Each loads its own
 * data and, when migration 0008 is not applied yet, shows a short line instead of failing.
 */
import { useEffect, useState } from 'react';
import * as C from '@/features/cloud/coaching';
import { shareLink } from '@/features/share/share';
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import type { ClientSummary } from '../rollup';
import { ClientDetailScreen } from './client-detail-screen';
import { CoachDashboardScreen } from './coach-dashboard-screen';
import { JoinScreen } from './join-screen';
import { MyCoachCard } from './my-coach-card';

const err = (e: unknown) => C.coachingMessage(e);
/** Runs a write; resolves to an error line, or null. */
const attempt = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return err(e);
  }
};

export const CoachRoute = ({ signedIn, signIn, onOpenClient, onHowItWorks, onBack, say }: { signedIn: boolean; signIn: React.ReactNode; onOpenClient: (id: string) => void; onHowItWorks: () => void; onBack: () => void; say: (m: string) => void }) => {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [invites, setInvites] = useState<C.Invite[]>([]);
  const [notice, setNotice] = useState<string | undefined>();
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    Promise.all([C.myClients(), C.listInvites()]).then(
      ([c, i]) => {
        if (!alive) return;
        setClients(c);
        setInvites(i.filter(x => !x.acceptedBy));
        setNotice(undefined);
      },
      e => alive && setNotice(err(e))
    );
    return () => {
      alive = false;
    };
  }, [signedIn]);
  const share = async (code: string) => {
    const out = await shareLink('Train with me on TigerWorkouts', C.inviteUrl(code));
    say(out === 'copied' ? 'Link copied' : out === 'shared' ? 'Shared' : 'Could not share');
  };
  if (!signedIn) return <CoachDashboardScreen clients={[]} invites={[]} notice="Sign in to invite clients and see their sessions." signIn={signIn} onShareInvite={() => {}} onOpenClient={onOpenClient} onHowItWorks={onHowItWorks} onBack={onBack} />;
  return (
    <CoachDashboardScreen
      clients={clients}
      invites={invites}
      notice={notice}
      onInvite={notice ? undefined : async label => {
        try {
          const i = await C.createInvite(label);
          setInvites(v => [i, ...v]);
          await share(i.code);
          return null;
        } catch (e) {
          return err(e);
        }
      }}
      onShareInvite={code => void share(code)}
      onDeleteInvite={code => void attempt(() => C.deleteInvite(code)).then(e => (e ? say(e) : setInvites(v => v.filter(x => x.code !== code))))}
      onOpenClient={onOpenClient}
      onHowItWorks={onHowItWorks}
      onBack={onBack}
    />
  );
};

export interface ClientRouteProps {
  clientId: string;
  me: string;
  workouts: Runsheet[];
  lookup: (id: string) => Runsheet | undefined;
  exercise: (key: string) => { name: string; unit: string };
  onBack: () => void;
  /** Pushes local workouts first, so a workout made a minute ago can be sent. */
  syncNow: () => Promise<void> | void;
  say: (m: string) => void;
}

export const ClientRoute = ({ clientId, me, workouts, lookup, exercise, onBack, syncNow, say }: ClientRouteProps) => {
  const [client, setClient] = useState<{ id: string; name: string; since?: string }>({ id: clientId, name: 'Client' });
  const [assignments, setAssignments] = useState<C.Assignment[] | null>(null);
  const [sessions, setSessions] = useState<SessionResult[] | null>(null);
  const [notes, setNotes] = useState<C.CoachNote[]>([]);
  const [notice, setNotice] = useState<string | undefined>();
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cs, a, s, n] = await Promise.all([C.myClients(), C.assignmentsForClient(clientId), C.clientSessions(clientId, 60), C.notes(me, clientId)]);
        if (!alive) return;
        const c = cs.find(x => x.id === clientId);
        if (!c) return setNotice('Not one of your clients (or coaching has ended).');
        setClient(c);
        setAssignments(a);
        setSessions(s);
        setNotes(n);
      } catch (e) {
        if (alive) setNotice(err(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId, me]);
  return (
    <ClientDetailScreen
      client={client}
      me={me}
      workouts={workouts}
      assignments={assignments}
      sessions={sessions}
      notes={notes}
      notice={notice}
      lookup={lookup}
      exercise={exercise}
      onAssign={async (workoutId, note) => {
        await syncNow();
        try {
          const a = await C.assign(clientId, workoutId, note);
          setAssignments(v => [a, ...(v ?? [])]);
          say('Sent');
          return null;
        } catch (e) {
          return err(e);
        }
      }}
      onUnassign={id => void attempt(() => C.unassign(id)).then(e => (e ? say(e) : setAssignments(v => v?.filter(x => x.id !== id) ?? null)))}
      onAddNote={async (body, sessionId) => {
        try {
          const n = await C.addNote({ coach: me, client: clientId, body, sessionId });
          setNotes(v => [...v, n]);
          return null;
        } catch (e) {
          return err(e);
        }
      }}
      onEnd={() => void attempt(() => C.endLink(me, clientId)).then(e => (e ? say(e) : (say('Coaching ended'), onBack())))}
      onBack={onBack}
    />
  );
};

export const JoinRoute = ({ code, signedIn, signIn, onContinue, onAccepted }: { code: string; signedIn: boolean; signIn: React.ReactNode; onContinue: () => void; onAccepted: () => void }) => {
  const [info, setInfo] = useState<C.InviteInfo | null | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  useEffect(() => {
    C.inviteInfo(code).then(setInfo, e => setNotice(err(e)));
  }, [code]);
  return (
    <JoinScreen
      info={info}
      notice={notice}
      signedIn={signedIn}
      signIn={signIn}
      appHref={`tigerworkouts://join/${encodeURIComponent(code)}`}
      onAccept={async () => {
        const e = await attempt(() => C.acceptInvite(code));
        if (!e) onAccepted();
        return e;
      }}
      onContinue={onContinue}
    />
  );
};

/**
 * Me tab, for a coached client: one card per coach with the notes and a reply box. Renders nothing
 * while loading, with no coach, or before 0008 is applied.
 */
export const MyCoaches = ({ me, about, onLeft }: { me: string; about?: (n: C.CoachNote) => string | undefined; onLeft: () => void }) => {
  const [coaches, setCoaches] = useState<{ link: C.CoachLink; notes: C.CoachNote[] }[]>([]);
  useEffect(() => {
    let alive = true;
    C.myCoaches()
      .then(ls => Promise.all(ls.map(async link => ({ link, notes: await C.notes(link.coach, me) }))))
      .then(v => alive && setCoaches(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [me]);
  return (
    <>
      {coaches.map(({ link, notes }) => (
        <MyCoachCard
          key={link.coach}
          coach={link}
          me={me}
          notes={notes}
          about={about}
          onReply={async body => {
            try {
              const n = await C.addNote({ coach: link.coach, client: me, body });
              setCoaches(v => v.map(x => (x.link.coach === link.coach ? { ...x, notes: [...x.notes, n] } : x)));
              return null;
            } catch (e) {
              return err(e);
            }
          }}
          onLeave={() =>
            void attempt(() => C.endLink(link.coach, me)).then(e => {
              if (e) return;
              setCoaches(v => v.filter(x => x.link.coach !== link.coach));
              onLeft();
            })
          }
        />
      ))}
    </>
  );
};
