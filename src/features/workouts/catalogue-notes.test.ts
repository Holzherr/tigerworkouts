import { describe, expect, it } from 'vitest';
import { IMPORTED } from './imported';

/** Words of whoever built the catalogue, not of the workout: field names, where a number came
 * from, another file's id. A block's note is its subtitle on the workout page. */
const INTERNAL = /startSeconds|timestamp|key[- ]moment|placeholder|\bsource\b|from the description|chapter|\btodo\b|\bfixme\b|\bnote:|interval grid|\b[a-z]+(?:-[a-z0-9]+){2,}\b\)/i;

describe('catalogue notes', () => {
  it('have no internal notes in what a block or a step shows', () => {
    const found: string[] = [];
    for (const { runsheet: r } of IMPORTED)
      for (const it of r.items) {
        const texts = [it.kind === 'block' ? it.name : undefined, (it as { note?: string }).note, ...(it.kind === 'block' ? it.steps.map(s => (s as { note?: string }).note) : [])];
        for (const t of texts) if (t && INTERNAL.test(t)) found.push(`${r.title}: ${t}`);
      }
    expect(found).toEqual([]);
  });
});
