import type { Meta, StoryObj } from '@storybook/react-vite';
import { SignInCard } from '@/features/auth/components/sign-in-card';
import { EX } from '@/features/runsheet/fixtures';
import { assignmentsFixture, clientSessionsFixture, CLIENT_ID, COACH_ID, coachWorkouts, clientSummaries, myAssignmentsFixture, notesFixture, pendingInvites } from '../fixtures';
import { ClientDetailScreen } from './client-detail-screen';
import { CoachDashboardScreen } from './coach-dashboard-screen';
import { CoachesPage } from './coaches-page';
import { FromCoach } from './from-coach';
import { JoinScreen } from './join-screen';
import { MyCoachCard } from './my-coach-card';

const phone = (S: React.ComponentType) => (
  <div className="relative mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line bg-canvas">
    <S />
  </div>
);
const ok = async () => null;
const noop = () => {};

const meta = {
  title: 'Coaching/Screens',
  component: CoachDashboardScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'The PT side (dashboard, one client) and the client side (invite link, From your coach, the Me card), with example data.' } } },
  args: { clients: clientSummaries(), invites: pendingInvites(), onInvite: ok, onShareInvite: noop, onDeleteInvite: noop, onOpenClient: noop, onHowItWorks: noop, onBack: noop },
  decorators: [phone],
} satisfies Meta<typeof CoachDashboardScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Four clients: one quiet, one new, two trained this week; two invites waiting. */
export const Dashboard: Story = {};
export const DashboardEmpty: Story = { args: { clients: [], invites: [] } };
/** Migration 0008 not applied yet: one line, no lists. */
export const DashboardNotSwitchedOn: Story = { args: { clients: [], invites: [], notice: 'Coaching is not switched on yet.', onInvite: undefined } };

const lookup = (id: string) => coachWorkouts().find(w => w.id === id);
const exercise = (k: string) => ({ name: EX[k]?.name ?? k, unit: EX[k]?.unit ?? '' });

/** Send a workout, what was sent and done, sessions set against the plan, notes, End coaching. */
export const ClientDetail: Story = {
  render: () => (
    <ClientDetailScreen
      client={{ id: CLIENT_ID, name: 'Sam Patel', since: clientSummaries()[0].since }}
      me={COACH_ID}
      workouts={coachWorkouts()}
      assignments={assignmentsFixture()}
      sessions={clientSessionsFixture()}
      notes={notesFixture()}
      lookup={lookup}
      exercise={exercise}
      onAssign={ok}
      onUnassign={noop}
      onAddNote={ok}
      onEnd={noop}
      onBack={noop}
    />
  ),
};

const info = { coach: COACH_ID, name: 'Nick Holzherr', accepted: false };
const signIn = <SignInCard title="Sign in to accept" reasons={['A free account; no password, we email you a 6-digit code']} onSendCode={async () => {}} onVerify={async () => {}} />;
/** Signed out: who invited you, the one line on accounts, the sign-in card. */
export const Join: Story = { render: () => <JoinScreen info={info} signedIn={false} signIn={signIn} onAccept={ok} onContinue={noop} appHref="tigerworkouts://join/k3x9q2m7v1" /> };
export const JoinSignedIn: Story = { render: () => <JoinScreen info={info} signedIn onAccept={ok} onContinue={noop} appHref="tigerworkouts://join/k3x9q2m7v1" /> };
export const JoinBadLink: Story = { render: () => <JoinScreen info={null} signedIn onAccept={ok} onContinue={noop} /> };

/** Top of Discover for a coached client; the done one sorts last. */
export const FromYourCoach: Story = { render: () => <div className="p-3"><FromCoach assignments={myAssignmentsFixture()} isDone={a => a.id === 'a1'} onOpen={noop} /></div> };

/** Me tab: notes with the coach, a reply box, Leave coach. */
export const MeCoachCard: Story = {
  render: () => (
    <div className="p-3">
      <MyCoachCard coach={{ coach: COACH_ID, name: 'Nick Holzherr', since: '' }} me={CLIENT_ID} notes={notesFixture()} onReply={ok} onLeave={noop} />
    </div>
  ),
};

/** #/coaches without screenshots. */
export const ForCoachesPage: Story = { render: () => <CoachesPage onBack={noop} onStart={noop} /> };
