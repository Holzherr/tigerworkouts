/**
 * The least a stored or shared workout must be for the screens to draw it: checked wherever a
 * runsheet arrives from somewhere this app did not write it (a share link, another person's row in
 * the database, the MCP worker's reads). Pure, no browser globals: the MCP worker imports it too.
 */
import type { Runsheet } from './model';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStep = (s: unknown): boolean =>
  isObj(s) &&
  typeof s.id === 'string' &&
  (s.kind === 'rest'
    ? typeof s.seconds === 'number'
    : s.kind === 'exercise' && isObj(s.exercise) && typeof s.exercise.key === 'string' && typeof s.exercise.name === 'string' && typeof s.forMode === 'string' && typeof s.forValue === 'number');
export const isItem = (it: unknown): boolean =>
  isObj(it) &&
  (it.kind === 'block' ? typeof it.id === 'string' && typeof it.name === 'string' && Array.isArray(it.steps) && it.steps.every(isStep) : it.kind === 'ref' ? typeof it.id === 'string' && typeof it.runsheetId === 'string' : isStep(it));

/** A title and a list of items, each one a step, a block of steps or a ref. */
export const isRunsheet = (r: unknown): r is Runsheet => isObj(r) && typeof r.title === 'string' && !!r.title.trim() && Array.isArray(r.items) && r.items.every(isItem);
