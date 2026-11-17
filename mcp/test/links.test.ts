/**
 * The apple-app-site-association file (src/links.ts): served as JSON, and the same as the copy the
 * site's own build ships in public/.well-known/.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { AASA, AASA_PATH } from '../src/links';

describe('apple-app-site-association', () => {
  it('is served as application/json, not a redirect', async () => {
    const res = await worker.fetch(new Request(`https://tigerworkouts.com${AASA_PATH}`), {} as never, {} as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual(AASA);
  });

  it('matches the copy in the site', () => {
    const site = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../public/.well-known/apple-app-site-association'), 'utf8'));
    expect(site).toEqual(AASA);
  });
});
