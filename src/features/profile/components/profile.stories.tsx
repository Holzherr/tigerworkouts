import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EX } from '@/features/runsheet/fixtures';
import { ExercisePicker } from '@/features/exercises/components/exercise-picker';
import { LIBRARY, type LibraryExercise } from '@/features/exercises/library';
import { ImportScreen } from '@/features/share/components/import-screen';
import { priyanka } from '@/features/runsheet/fixtures';
import { ManageFavoritesSheet, QuickLogRow, QuickLogSheet } from '@/features/results/components/quick-log';
import type { Favorite } from '@/features/cloud/sync';
import { Button } from '@/shared/components/ui/button';
import { SettingsSheet } from './settings-sheet';

const meta = {
  title: 'Profile/Sheets',
  component: SettingsSheet,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'The sheets and small screens around the profile: Settings (avatar, name, units, invite, sign out), the exercise picker (search, grouped list, add custom), quick log (favourite tiles, confirm sheet, manage favourites) and the shared-link import screen.' } } },
  args: { open: true, onOpenChange: () => {}, name: 'Nick', units: 'metric', onChange: () => {}, onInvite: () => {} },
  decorators: [S => <div className="relative mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line bg-canvas"><S /></div>],
} satisfies Meta<typeof SettingsSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const Settings = () => {
  const [p, setP] = useState<{ name: string; avatar?: { emoji?: string; color?: string; photo?: string }; units: 'metric' | 'imperial' }>({ name: 'Nick', units: 'metric', avatar: { emoji: '🐯', color: '#ff4d2e' } });
  const [open, setOpen] = useState(true);
  return (
    <div className="p-4">
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Open settings
      </Button>
      <SettingsSheet open={open} onOpenChange={setOpen} name={p.name} avatar={p.avatar} units={p.units} email="nick@example.com" onChange={x => setP({ ...p, ...x })} onInvite={() => alert('invite')} onSignOut={() => alert('sign out')} />
    </div>
  );
};
export const Settings_: Story = { render: () => <Settings /> };

const Picker = () => {
  const [open, setOpen] = useState(true);
  const [lib, setLib] = useState<Record<string, LibraryExercise>>(LIBRARY);
  const [picked, setPicked] = useState('');
  return (
    <div className="p-4">
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Pick exercise
      </Button>
      <div className="mt-2 text-[13px] text-muted">Picked: {picked}</div>
      <ExercisePicker open={open} onOpenChange={setOpen} library={lib} onPick={e => setPicked(e.name)} onCreate={e => setLib({ ...lib, [e.key]: e })} usage={{ kb_swing: 12, bw_pullup: 40 }} />
    </div>
  );
};
export const Picker_: Story = { render: () => <Picker /> };

const Quick = () => {
  const [favs, setFavs] = useState<Favorite[]>([{ name: 'Game of padel', icon: '🎾', minutes: 60 }, { name: 'Run', icon: '🏃', minutes: 30 }]);
  const [logging, setLogging] = useState<Favorite | null>(null);
  const [manage, setManage] = useState(false);
  return (
    <div className="p-3">
      <QuickLogRow favorites={favs} onLog={setLogging} onManage={() => setManage(true)} />
      <QuickLogSheet favorite={logging} onClose={() => setLogging(null)} onSave={r => (alert(JSON.stringify(r, null, 1)), setLogging(null))} />
      <ManageFavoritesSheet open={manage} onOpenChange={setManage} favorites={favs} onChange={setFavs} />
    </div>
  );
};
export const QuickLog: Story = { render: () => <Quick /> };
export const Import: Story = { render: () => <ImportScreen runsheet={priyanka()} onSave={() => alert('saved')} onDiscard={() => alert('discard')} /> };
export const ImportBroken: Story = { render: () => <ImportScreen runsheet={null} onSave={() => {}} onDiscard={() => {}} /> };
void EX;
