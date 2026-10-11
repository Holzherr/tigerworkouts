/**
 * /legacy/ is served on the app's own origin, so script injected there reads the app's Supabase
 * session. Its templates put ids into href and onclick and numbers in raw, so data from a link or
 * from other people's public rows goes through tame() first. The function is taken from the page.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('legacy/index.html', 'utf8');
const cloud = readFileSync('legacy/cloud.js', 'utf8');
const src = page.match(/^const tame = [\s\S]*?: v;$/m)?.[0];
const tame = new Function(`${src}; return tame;`)() as (v: unknown) => any;

describe('legacy tame()', () => {
  it('keeps hostile ids and numbers inside the attribute and the JS string they land in', () => {
    const w = tame({ id: `"><img src=x onerror=alert(1)>');alert(1);//&#39;`, duration_min: '<img src=x onerror=alert(1)>', blocks: [{ n: 3 }] });
    const div = document.createElement('div');
    div.innerHTML = `<a href="#/w/${w.id}" onclick="go('do/${w.id}')">${w.duration_min} min</a>`;
    expect(div.querySelector('img')).toBeNull();
    expect(div.querySelectorAll('a')).toHaveLength(1);
    expect(div.querySelector('a')!.getAttribute('onclick')).toBe(`go('do/${w.id}')`);
    expect(w.blocks).toEqual([{ n: 3 }]);
  });

  it('is applied wherever someone else’s data comes in', () => {
    expect(page).toContain('const { w, ex } = tame(JSON.parse(b64d(payload)));');
    expect(page).toContain('const { s } = tame(JSON.parse(b64d(payload)));');
    expect(cloud).toContain('.map(r => tame(r.data))');
    expect(cloud).toContain('[tame(r.key), tame(r.data)]');
  });
});
