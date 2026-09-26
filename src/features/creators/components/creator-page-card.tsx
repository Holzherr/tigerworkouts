import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { myProfile, saveProfile } from '@/features/cloud/sync';

export interface CreatorPageCardProps {
  /** Workouts you have made public; the page lists these. */
  publicCount: number;
  onOpenPage: (key: string) => void;
}

/** Me tab: your public page's name in the link, a short bio, and how many workouts it shows. */
export const CreatorPageCard = ({ publicCount, onOpenPage }: CreatorPageCardProps) => {
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
    <div className="space-y-2 rounded-card border border-line bg-surface p-3">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-bold">Your creator page</div>
        {key && (
          <Button variant="text" size="inline" onClick={() => onOpenPage(key)}>
            View <ExternalLink className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="text-[12px] text-muted">
        {publicCount ? `${publicCount} public ${publicCount === 1 ? 'workout' : 'workouts'}.` : 'No public workouts yet.'} Make one public from its page.
      </div>
      <label className="flex h-11 items-center rounded-tile border border-line bg-canvas px-3 text-[15px]">
        <span className="text-faint">tigerworkouts.com/#/c/</span>
        <input value={handle} onChange={e => setHandle(e.target.value)} placeholder="your-name" aria-label="Page name" className="min-w-0 flex-1 bg-transparent outline-none" />
      </label>
      <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={400} placeholder="A line or two about you and how you train" aria-label="Bio" className="w-full rounded-tile border border-line bg-canvas p-3 text-[15px] outline-none" />
      <div className="flex items-center justify-between">
        <span className={msg && msg !== 'Saved' ? 'text-[12px] text-danger' : 'text-[12px] text-muted'}>{msg}</span>
        <Button size="sm" onClick={save} disabled={busy}>
          Save
        </Button>
      </div>
    </div>
  );
};
