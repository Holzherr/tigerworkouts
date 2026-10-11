/**
 * The plugin in ../plugin against this server: what the Claude directory review checks on every tool,
 * and that the skills only name tools that exist.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { handleMcp } from '../src/server';
import { db as makeDb } from '../src/supabase';

const PLUGIN = path.resolve(import.meta.dirname, '../../plugin');

const listTools = async (): Promise<{ name: string; title?: string; annotations?: Record<string, unknown> }[]> => {
  const db = makeDb({ userId: 'u', accessToken: 't' }, () => Promise.reject(new Error('no network in this test')));
  const res = await handleMcp(
    new Request('https://mcp.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }),
    db,
    { anonymous: true, claim: async () => ({}) },
  );
  return ((await res.json()) as { result: { tools: Awaited<ReturnType<typeof listTools>> } }).result.tools;
};

const skills = readdirSync(path.join(PLUGIN, 'skills')).map(name => ({ name, text: readFileSync(path.join(PLUGIN, 'skills', name, 'SKILL.md'), 'utf8') }));

describe('plugin', () => {
  it('every tool has a title and explicit read-only, destructive and open-world hints', async () => {
    for (const t of await listTools()) {
      expect(t.title, t.name).toBeTruthy();
      expect(t.name.length, t.name).toBeLessThanOrEqual(64);
      for (const hint of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) expect(typeof t.annotations?.[hint], `${t.name}.${hint}`).toBe('boolean');
    }
  });

  it('skills name only tools the server has, and only skills that exist', async () => {
    const tools = new Set((await listTools()).map(t => t.name));
    const names = new Set(skills.map(s => s.name));
    for (const s of skills) {
      expect(s.text, s.name).toMatch(new RegExp(`^---\\nname: ${s.name}\\ndescription: .+\\n---\\n`));
      for (const [, word] of s.text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) if (/^(get|list|search|create|update|preview|start|log|claim)_/.test(word)) expect(tools, `${s.name} names ${word}`).toContain(word);
      for (const [, other] of s.text.matchAll(/the ([a-z-]+) skill/g)) expect(names, `${s.name} points at ${other}`).toContain(other);
    }
  });

  it('both manifests carry the same version', () => {
    const claude = JSON.parse(readFileSync(path.join(PLUGIN, '.claude-plugin/plugin.json'), 'utf8'));
    const openai = JSON.parse(readFileSync(path.join(PLUGIN, 'plugin.json'), 'utf8'));
    expect(openai.version).toBe(claude.version);
  });
});
