import { Camera, ChevronRight, Share2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Equipment } from '@/features/runsheet/plates';
import { EquipmentSheet, equipmentSummary } from './equipment-sheet';
import { Button } from '@/shared/components/ui/button';
import { Stepper } from '@/shared/components/ui/stepper';
import { Chip } from '@/shared/components/ui/chip';
import { Sheet } from '@/shared/components/ui/sheet';
import type { Avatar } from '@/features/cloud/sync';
import { INTENTS, type Intent } from '@/features/runsheet/targets';

const EMOJIS = ['', '💪', '🏋️', '🏃', '🚴', '🧘', '🥊', '🎾', '⚽', '🏊', '🔥', '⚡', '🦁', '🐯', '🦊', '🐻'];
const COLORS = ['#ff4d2e', '#f59e0b', '#a78bfa', '#38bdf8', '#34d399', '#fb7185', '#4ade80', '#e879f9'];

export interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  avatar?: Avatar;
  email?: string;
  onChange: (p: { name?: string; avatar?: Avatar; units?: 'metric' | 'imperial' }) => void;
  onInvite: () => void;
  onSignOut?: () => void;
  /** Delete the account and its data on the server. `clearDevice` also forgets what is on this
   * device; otherwise it stays here, as if signed out. Resolves with a message to show. */
  onDeleteAccount?: (clearDevice: boolean) => Promise<string>;
  /** Timer beep volume 0–1. */
  volume?: number;
  onVolume?: (v: number) => void;
  /** Seconds a rest gets when one is added in the editor. */
  defaultRest?: number;
  onDefaultRest?: (sec: number) => void;
  /** How hard today's targets push. Maintain until changed. */
  intent?: Intent;
  onIntent?: (v: Intent) => void;
  /** My equipment: what suggested loads snap to, and the plate calculator's plates. */
  equipment?: Equipment;
  onEquipment?: (e: Equipment | undefined) => void;
}

/** 56px avatar: photo, or an emoji / initial on a coloured disc. */
export const AvatarView = ({ name, avatar, size = 56 }: { name: string; avatar?: Avatar; size?: number }) =>
  avatar?.photo ? (
    <img src={avatar.photo} alt="" style={{ width: size, height: size }} className="rounded-full object-cover" />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full font-extrabold text-white" style={{ width: size, height: size, background: avatar?.color ?? '#ff4d2e', fontSize: size * 0.42 }}>
      {avatar?.emoji || (name[0] ?? '?').toUpperCase()}
    </span>
  );

/**
 * Settings sheet: avatar preview with name field, emoji and colour chips, photo upload (resized
 * to 256px and stored as a data URL), Invite someone, Sign out. Loads are in kg everywhere; the
 * Units setting did nothing and went on 27 Sep 2026.
 */
export const SettingsSheet = ({ open, onOpenChange, name, avatar, email, onChange, onInvite, onSignOut, onDeleteAccount, volume, onVolume, defaultRest, onDefaultRest, intent = 'maintain', onIntent, equipment, onEquipment }: SettingsSheetProps) => {
  const file = useRef<HTMLInputElement>(null);
  const [kit, setKit] = useState(false);
  const [deleting, setDeleting] = useState<'ask' | 'busy' | null>(null);
  const [clearDevice, setClearDevice] = useState(false);
  const [deleted, setDeleted] = useState<string | null>(null);
  const onPhoto = (f: File) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const s = Math.min(img.width, img.height);
      c.width = c.height = 256;
      c.getContext('2d')?.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
      onChange({ avatar: { ...avatar, photo: c.toDataURL('image/jpeg', 0.8) } });
    };
    img.src = URL.createObjectURL(f);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Settings" height="auto">
      <div className="space-y-4 pb-2">
        <div className="flex items-center gap-3">
          <AvatarView name={name} avatar={avatar} />
          <input value={name} onChange={e => onChange({ name: e.target.value })} placeholder="Your name" className="h-11 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-[16px] outline-none focus:border-hint" />
        </div>
        {email && <div className="-mt-2 text-[12px] text-muted">{email}</div>}
        <div>
          <div className="mb-1 text-[11px] font-bold tracking-widest text-muted uppercase">Avatar</div>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map(e => (
              <Chip key={e || 'initial'} variant={(avatar?.emoji ?? '') === e && !avatar?.photo ? 'on' : 'outline'} onClick={() => onChange({ avatar: { ...avatar, emoji: e, photo: undefined } })}>
                {e || (name[0] ?? '?').toUpperCase()}
              </Chip>
            ))}
            <Chip variant="outline" onClick={() => file.current?.click()}>
              <Camera className="size-3.5" /> Photo
            </Chip>
            <input ref={file} type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && onPhoto(e.target.files[0])} />
          </div>
          <div className="mt-2 flex gap-2">
            {COLORS.map(c => (
              <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => onChange({ avatar: { ...avatar, color: c } })} className="size-7 rounded-full" style={{ background: c, outline: (avatar?.color ?? '#ff4d2e') === c ? '2px solid #0f172a' : 'none', outlineOffset: 2 }} />
            ))}
          </div>
        </div>
      {onVolume && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px]">Timer volume</span>
          <Stepper aria-label="Timer volume" value={Math.round((volume ?? 0.8) * 10)} min={0} max={10} step={1} onChange={v => onVolume(v / 10)} />
        </div>
      )}
      {onDefaultRest && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px]">
            Default rest <span className="text-muted">(s)</span>
          </span>
          <Stepper aria-label="Default rest" value={defaultRest ?? 30} min={5} max={600} step={15} onChange={onDefaultRest} />
        </div>
      )}
      {onIntent && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14px]">Suggestions</span>
            <div className="flex gap-1" role="radiogroup" aria-label="Suggestions">
              {INTENTS.map(i => (
                <Chip key={i.id} role="radio" aria-checked={intent === i.id} variant={intent === i.id ? 'on' : 'outline'} onClick={() => onIntent(i.id)}>
                  {i.label}
                </Chip>
              ))}
            </div>
          </div>
          <div className="mt-1 text-[12px] text-muted">{INTENTS.find(i => i.id === intent)?.note} Ignoring a suggestion costs nothing.</div>
        </div>
      )}
      {onEquipment && (
        <>
          <button type="button" onClick={() => setKit(true)} className="flex w-full items-center justify-between gap-3 text-left">
            <span className="min-w-0">
              <span className="block text-[14px]">My equipment</span>
              <span className="block truncate text-[12px] text-muted">{equipmentSummary(equipment)}</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-faint" />
          </button>
          {kit && <EquipmentSheet open={kit} onOpenChange={setKit} equipment={equipment} onChange={onEquipment} />}
        </>
      )}
      <Button variant="ghost" block onClick={onInvite}>
          <Share2 /> Invite someone
        </Button>
        {onSignOut && (
          <Button variant="quiet" block onClick={onSignOut}>
            Sign out
          </Button>
        )}
        {deleted && <p className="text-center text-[13px] text-muted">{deleted}</p>}
        {onDeleteAccount && !deleting && (
          <Button variant="quiet" block className="text-danger" onClick={() => setDeleting('ask')}>
            Delete account
          </Button>
        )}
        {onDeleteAccount && deleting && (
          <div role="alertdialog" aria-label="Delete account" className="space-y-2 rounded-card border border-danger/40 bg-surface p-3">
            <p className="text-[14px] font-bold">Delete your account?</p>
            <p className="text-[13px] text-muted">Your sessions, workouts, exercises and settings are deleted from the server, and the account with them. This cannot be undone. Workouts you made public come off your page.</p>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={clearDevice} onChange={e => setClearDevice(e.target.checked)} />
              Also clear this device (otherwise your history stays here, not synced)
            </label>
            <div className="flex gap-2">
              <Button variant="danger" block disabled={deleting === 'busy'} onClick={async () => { setDeleting('busy'); const msg = await onDeleteAccount(clearDevice); setDeleting(null); setDeleted(msg); }}>
                {deleting === 'busy' ? 'Deleting…' : 'Delete account'}
              </Button>
              <Button variant="ghost" disabled={deleting === 'busy'} onClick={() => setDeleting(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
};
