import { Camera, Share2 } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Stepper } from '@/shared/components/ui/stepper';
import { Chip } from '@/shared/components/ui/chip';
import { Dropdown } from '@/shared/components/ui/dropdown';
import { Sheet } from '@/shared/components/ui/sheet';
import type { Avatar } from '@/features/cloud/sync';

const EMOJIS = ['', '💪', '🏋️', '🏃', '🚴', '🧘', '🥊', '🎾', '⚽', '🏊', '🔥', '⚡', '🦁', '🐯', '🦊', '🐻'];
const COLORS = ['#ff4d2e', '#f59e0b', '#a78bfa', '#38bdf8', '#34d399', '#fb7185', '#4ade80', '#e879f9'];
const UNITS = [
  { value: 'metric', label: 'kg · km' },
  { value: 'imperial', label: 'lb · miles' },
] as const;

export interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  avatar?: Avatar;
  units: 'metric' | 'imperial';
  email?: string;
  onChange: (p: { name?: string; avatar?: Avatar; units?: 'metric' | 'imperial' }) => void;
  onInvite: () => void;
  onSignOut?: () => void;
  /** Timer beep volume 0–1. */
  volume?: number;
  onVolume?: (v: number) => void;
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
 * to 256px and stored as a data URL), units dropdown, Invite someone, Sign out.
 */
export const SettingsSheet = ({ open, onOpenChange, name, avatar, units, email, onChange, onInvite, onSignOut, volume, onVolume }: SettingsSheetProps) => {
  const file = useRef<HTMLInputElement>(null);
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
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px]">Units</span>
          <Dropdown aria-label="Units" value={units} options={UNITS} onValueChange={u => onChange({ units: u })} />
        </div>
        {onVolume && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px]">Timer volume</span>
          <Stepper aria-label="Timer volume" value={Math.round((volume ?? 0.8) * 10)} min={0} max={10} step={1} onChange={v => onVolume(v / 10)} />
        </div>
      )}
      <Button variant="ghost" block onClick={onInvite}>
          <Share2 /> Invite someone
        </Button>
        {onSignOut && (
          <Button variant="quiet" block onClick={onSignOut}>
            Sign out
          </Button>
        )}
      </div>
    </Sheet>
  );
};
