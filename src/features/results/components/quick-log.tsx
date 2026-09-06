import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Chip } from '@/shared/components/ui/chip';
import { Sheet } from '@/shared/components/ui/sheet';
import { Stepper } from '@/shared/components/ui/stepper';
import type { Favorite } from '@/features/cloud/sync';
import type { SessionResult } from '@/features/runsheet/progression';

const ICONS = ['🎾', '🏃', '🚴', '🏊', '🥾', '⚽', '🧘', '🥊', '🏓', '⛳', '🏋️', '🚶'];
const INTENSITY = ['easy', 'steady', 'hard'];

export interface QuickLogRowProps {
  favorites: Favorite[];
  onLog: (f: Favorite) => void;
  onManage: () => void;
}

/** Horizontal strip of favourite activities (padel, a run) that log in one tap, plus an add tile. */
export const QuickLogRow = ({ favorites, onLog, onManage }: QuickLogRowProps) => (
  <div>
    <div className="flex items-baseline justify-between px-1 pb-1">
      <span className="text-[11px] font-bold tracking-widest text-muted uppercase">Quick log</span>
      <button type="button" onClick={onManage} className="text-[12px] text-muted">
        Edit
      </button>
    </div>
    <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
      {favorites.map(f => (
        <button key={f.name} type="button" onClick={() => onLog(f)} className="flex shrink-0 items-center gap-2 rounded-card border border-line bg-surface px-3 py-2 text-left active:bg-line-soft">
          <span className="grid size-9 place-items-center rounded-control bg-brand-soft text-[18px]">{f.icon ?? '🏃'}</span>
          <span className="leading-tight">
            <span className="block text-[13px] font-semibold">{f.name}</span>
            <span className="block text-[11px] text-muted">{f.minutes} min · tap to log</span>
          </span>
        </button>
      ))}
      <button type="button" onClick={onManage} className="flex shrink-0 items-center gap-1.5 rounded-card border border-dashed border-hint px-3 py-2 text-[13px] font-semibold text-muted">
        <Plus className="size-4" /> Favourite
      </button>
    </div>
  </div>
);

export interface QuickLogSheetProps {
  favorite: Favorite | null;
  onClose: () => void;
  onSave: (r: SessionResult) => void;
}

/** Confirm a quick log: minutes stepper, intensity chips, date defaults to now, optional note. */
export const QuickLogSheet = ({ favorite, onClose, onSave }: QuickLogSheetProps) => {
  const [minutes, setMinutes] = useState(favorite?.minutes ?? 60);
  const [intensity, setIntensity] = useState(favorite?.intensity ?? 'steady');
  const [notes, setNotes] = useState('');
  const [when, setWhen] = useState(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  if (!favorite) return null;
  return (
    <Sheet open onOpenChange={o => !o && onClose()} title={`Log ${favorite.name}`} height="auto">
      <div className="space-y-3 pb-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px]">Minutes</span>
          <Stepper aria-label="Minutes" value={minutes} step={5} min={5} max={600} onChange={setMinutes} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px]">Intensity</span>
          <div className="flex gap-1.5">
            {INTENSITY.map(i => (
              <Chip key={i} variant={intensity === i ? 'on' : 'outline'} onClick={() => setIntensity(i)}>
                {i}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px]">When</span>
          <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className="h-11 rounded-control border border-line bg-surface px-2 text-[14px]" />
        </div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" rows={2} className="w-full rounded-card border border-line bg-surface px-3 py-2 text-[16px] outline-none" />
        <Button block onClick={() => onSave({ runsheetId: `activity:${favorite.name}`, title: favorite.name, startedAt: new Date(when).toISOString(), endedAt: new Date(new Date(when).getTime() + minutes * 60000).toISOString(), durationSec: minutes * 60, completed: true, activity: { name: favorite.name, icon: favorite.icon, minutes, intensity }, steps: [], notes: notes || undefined })}>
          Save
        </Button>
      </div>
    </Sheet>
  );
};

export interface ManageFavoritesSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  favorites: Favorite[];
  onChange: (f: Favorite[]) => void;
}

/** Add or remove favourites: name, icon picker, default minutes. */
export const ManageFavoritesSheet = ({ open, onOpenChange, favorites, onChange }: ManageFavoritesSheetProps) => {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🎾');
  const [minutes, setMinutes] = useState(60);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Favourites" height="auto">
      <div className="space-y-3 pb-2">
        {favorites.map((f, i) => (
          <div key={f.name} className="flex items-center gap-3">
            <span className="text-[18px]">{f.icon}</span>
            <span className="flex-1 text-[15px]">
              {f.name} <span className="text-muted">· {f.minutes} min</span>
            </span>
            <Button variant="quiet" size="icon-sm" aria-label="Remove" onClick={() => onChange(favorites.filter((_, j) => j !== i))}>
              <X />
            </Button>
          </div>
        ))}
        <form
          className="space-y-2 rounded-card border border-line bg-canvas p-3"
          onSubmit={e => {
            e.preventDefault();
            if (!name.trim()) return;
            onChange([...favorites, { name: name.trim(), icon, minutes }]);
            setName('');
          }}
        >
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Activity, e.g. Game of padel" className="h-11 w-full rounded-control border border-line bg-surface px-3 text-[16px] outline-none" />
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map(i => (
              <Chip key={i} variant={icon === i ? 'on' : 'outline'} onClick={() => setIcon(i)}>
                {i}
              </Chip>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px]">Usual minutes</span>
            <Stepper aria-label="Minutes" value={minutes} step={5} min={5} max={600} onChange={setMinutes} />
          </div>
          <Button type="submit" block variant="ghost">
            <Plus /> Add favourite
          </Button>
        </form>
      </div>
    </Sheet>
  );
};
