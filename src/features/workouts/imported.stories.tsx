import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EditorScreen } from '@/features/runsheet/components/editor-screen';
import { modeLabel, runsheetMinutes, type Runsheet } from '@/features/runsheet/model';
import { Chip } from '@/shared/components/ui/chip';
import { bySource, IMPORTED } from './imported';

const Browser = () => {
  const groups = bySource();
  const [sel, setSel] = useState<Runsheet | null>(IMPORTED[0]?.runsheet ?? null);
  return (
    <div className="flex h-[860px] gap-4 p-3">
      <div className="w-[360px] shrink-0 space-y-4 overflow-y-auto pr-1">
        <div className="text-[12px] text-muted">{IMPORTED.length} imported workouts</div>
        {Object.entries(groups).map(([src, list]) => (
          <section key={src}>
            <h3 className="mb-1 text-[11px] font-bold tracking-widest text-muted uppercase">
              {src} · {list.length}
            </h3>
            <div className="space-y-1">
              {list.map(w => (
                <button key={w.runsheet.id} type="button" onClick={() => setSel(w.runsheet)} className={`block w-full rounded-control px-2 py-1.5 text-left text-[13px] ${sel?.id === w.runsheet.id ? 'bg-brand-soft text-brand-ink' : 'hover:bg-line-soft'}`}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold">{w.runsheet.title}</span>
                    <span className="text-[11px] text-muted">{runsheetMinutes(w.runsheet)} min</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {w.runsheet.items.filter(i => i.kind === 'block').slice(0, 3).map(b => (
                      <Chip key={b.id} size="sm" variant="outline">
                        {modeLabel(b)}
                      </Chip>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="h-full w-[393px] shrink-0 overflow-hidden rounded-[30px] border-8 border-ink">
        {sel && <EditorScreen key={sel.id} runsheet={sel} onChange={setSel} onPickExercise={async () => null} mode="author" />}
      </div>
      {sel && (
        <div className="min-w-0 flex-1 space-y-2 overflow-y-auto text-[13px]">
          <div className="font-bold">{sel.title}</div>
          <p className="text-body">{sel.description}</p>
          {sel.source && (
            <div className="text-muted">
              {sel.source.kind} · {sel.source.author ?? sel.creator} ·{' '}
              <a className="underline" href={sel.source.url} target="_blank" rel="noreferrer">
                source
              </a>
              <div>{sel.source.license}</div>
            </div>
          )}
          <pre className="max-h-[560px] overflow-auto rounded-card border border-line bg-surface p-2 text-[11px]">{JSON.stringify({ ...sel, items: sel.items }, (k, v) => (k === 'exercise' && v && typeof v === 'object' ? v.key : v), 1)}</pre>
        </div>
      )}
    </div>
  );
};

const meta = {
  title: 'Workouts/Imported',
  component: Browser,
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: 'Three-pane browser over every workout imported under /imports: source-grouped list on the left, the workout rendered in the real editor in a phone frame in the middle, and its description, attribution and raw JSON on the right. The test bench for whether the runsheet model can carry public workouts.' } },
  },
} satisfies Meta<typeof Browser>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Browse: Story = {};
