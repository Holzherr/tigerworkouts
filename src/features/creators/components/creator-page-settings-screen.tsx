import { ChevronLeft, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { myProfile, saveProfile } from '@/features/cloud/sync';

export interface CreatorPageSettingsScreenProps {
  /** Workouts you have made public; the page lists these. */
  publicCount: number;
  onOpenPage: (key: string) => void;
  onBack: () => void;
}

/** Me → Creator page: your public page's name in the link, a short bio, and how many workouts it shows (review round 2 U12). */
export const CreatorPageSettingsScreen = ({ publicCount, onOpenPage, onBack }: CreatorPageSettingsScreenProps) => {
  const [id, setId] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    myProfile().then(p => {
      if (!p) return;
      setId(p.id);
      setHandle(p.handle ?? '');
      setBio(p.bio ?? '');
    });
  }, []);
  const save = async () => {
    setBusy(true);
    const err = await saveProfile({ handle: handle.trim().toLowerCase(), bio: bio.trim() });
    setBusy(false);
    setMsg(err ?? 'Saved');
  };
  const key = handle.trim() || id;
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-2 pb-3">
        <Button variant="quiet" size="inline" onClick={onBack} className="-ml-1 text-muted">
          <ChevronLeft /> Me
        </Button>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="text-[22px] font-extrabold">Creator page</h1>
          {key && (
            <Button variant="text" size="inline" onClick={() => onOpenPage(key)}>
              View <ExternalLink className="size-3.5" />
            </Button>
          )}
        </div>
        <div className="text-[12px] text-muted">
          {publicCount ? `${publicCount} public ${publicCount === 1 ? 'workout' : 'workouts'}.` : 'No public workouts yet.'} Make one public from its page.
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        <label className="flex h-11 items-center rounded-tile border border-line bg-surface px-3 text-[15px]">
          <span className="text-faint">tigerworkouts.com/#/c/</span>
          <input value={handle} onChange={e => setHandle(e.target.value)} placeholder="your-name" aria-label="Page name" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={400} placeholder="A line or two about you and how you train" aria-label="Bio" className="w-full rounded-tile border border-line bg-surface p-3 text-[15px] outline-none" />
        <div className="flex items-center justify-between">
          <span className={msg && msg !== 'Saved' ? 'text-[12px] text-danger' : 'text-[12px] text-muted'}>{msg}</span>
          <Button size="sm" onClick={save} disabled={busy}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};
