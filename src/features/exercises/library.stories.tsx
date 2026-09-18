import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { GROUP_LABEL, LIBRARY, type ExerciseGroup } from './library';

const Library = () => {
  const groups = Object.keys(GROUP_LABEL) as ExerciseGroup[];
  const all = Object.values(LIBRARY);
  return (
    <div className="w-[760px] space-y-6 p-4">
      <div className="text-[12px] text-muted">
        {all.length} exercises · {all.filter(e => e.clip).length} with clips · {all.filter(e => e.poster && !e.clip).length} with stills
      </div>
      {groups.map(g => {
        const items = all.filter(e => e.group === g);
        if (!items.length) return null;
        return (
          <section key={g}>
            <h3 className="mb-2 text-[11px] font-bold tracking-widest text-muted uppercase">{GROUP_LABEL[g]}</h3>
            <div className="grid grid-cols-3 gap-2">
              {items.map(e => (
                <div key={e.key} className="flex items-center gap-2.5 rounded-card border border-line bg-surface p-2">
                  <ClipThumb clip={e.clip} poster={e.poster} icon="🏋️" />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold">{e.name}</div>
                    <div className="text-[11px] text-muted">
                      {e.unit || 'bodyweight'} · {e.clip ? 'clip' : e.poster ? 'still' : 'icon'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

const meta = {
  title: 'Exercises/Library',
  component: Library,
  parameters: {
    docs: {
      description: {
        component:
          'Every exercise in the library, grouped by equipment, each with its 48px thumbnail: a looping clip where one exists, otherwise the generated still of the same model on white. Three-column card grid; this is the reference sheet for what the picker will show.',
      },
    },
  },
} satisfies Meta<typeof Library>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {};
