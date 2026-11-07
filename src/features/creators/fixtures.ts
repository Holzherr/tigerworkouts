import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';

/** A workout an admin adapted from an Instagram reel (made-up creator), as the MCP server stores it. */
export const adaptedReel = (over: Partial<Runsheet> = {}): Runsheet => ({
  id: 'u-fixture-reel',
  title: 'Full-body kettlebell complex',
  creator: 'Sam Fixture',
  description: 'Five kettlebell moves back to back without putting the bell down, then rest. Pick a weight you can press five times.',
  public: true,
  ownerId: 'admin',
  source: { title: 'KB complex reel', kind: 'social', url: 'https://www.instagram.com/reel/FIXTURE/', author: 'Sam Fixture', handle: 'samfixture', platform: 'instagram', importedAt: '2026-11-07' },
  items: [
    {
      kind: 'block',
      id: 'b1',
      name: 'Complex',
      mode: 'rounds',
      repeat: 5,
      steps: [makeExercise(EX.kb_swing, { forMode: 'reps', forValue: 10, target: 16 }), makeExercise(EX.kb_goblet_squat, { forMode: 'reps', forValue: 8, target: 16 }), { kind: 'rest', id: 'r1', seconds: 60 }],
    },
  ],
  ...over,
});
