/**
 * The MCP server: tool names, the descriptions agents read, and input schemas. Stateless — a new
 * server per request over Streamable HTTP with JSON responses, so no Durable Object is needed.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { FOR_MODE_HELP, RunsheetError, runsheetInput } from './runsheet';
import { SupabaseError, type Db } from './supabase';
import * as T from './tools';

export const INSTRUCTIONS = `TigerWorkouts (tigerworkouts.com) is a workout app with a guided timer. You are connected as one signed-in user and see what they see: their own workouts, their training history, and the public catalogue (about 480 workouts: CrossFit benchmarks, NHS, lifting programmes, follow-along videos, coach programmes).

A workout is a "runsheet": an ordered list of items. Each item is a step (an exercise or a rest) or a block (a named group of steps repeated N times, or run as AMRAP / EMOM / for time / a rep ladder). Items have a role (warmup, main, cooldown). Loads are kilograms ("kg" or "kg per arm"), treadmill speed is kph, incline is %, rests and caps are seconds.

Coaching flow that works: get_profile → list_sessions (what they did, with loads and reps actually used) → list_workouts / get_workout for ideas → search_exercises for keys → create_workout (private by default) → give the user previewUrl or appUrl.`;

const RUNSHEET_HELP = `A runsheet. items is a list of:
- {"kind":"exercise","exercise":"<key from search_exercises>","forMode":"reps","forValue":8,"target":60} — forMode: ${FOR_MODE_HELP}. target is the load/speed in the exercise's unit; omit it for bodyweight.
- {"kind":"rest","seconds":90}
- {"kind":"block","name":"Main","repeat":3,"mode":"rounds","steps":[...steps...]} — a block holds steps (not other blocks).
Add "role":"warmup"|"main"|"cooldown" to put an item in a part. ids are optional and filled in.

Example (about 25 min):
{"title":"Upper push, 25 min","description":"Bench then shoulders, finish with a plank.","level":"Medium","tags":["Strength"],
 "items":[
  {"kind":"exercise","exercise":"cardio_rower","forMode":"minutes","forValue":5,"role":"warmup"},
  {"kind":"block","name":"Bench","repeat":4,"steps":[{"kind":"exercise","exercise":"bb_bench","forMode":"reps","forValue":6,"target":60},{"kind":"rest","seconds":120}]},
  {"kind":"block","name":"Accessories","repeat":3,"steps":[{"kind":"exercise","exercise":"db_shoulder_press","forMode":"reps","forValue":10,"forMax":12,"target":14},{"kind":"exercise","exercise":"bw_pushup","forMode":"max"},{"kind":"rest","seconds":60}]},
  {"kind":"exercise","exercise":"bw_plank","forMode":"seconds","forValue":60,"role":"cooldown"}]}
(Check keys with search_exercises; an unknown key is rejected with a list of what to fix.)`;

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };
const ok = (v: unknown): Result => ({ content: [{ type: 'text', text: JSON.stringify(v, null, 2) }] });
const fail = (msg: string): Result => ({ content: [{ type: 'text', text: msg }], isError: true });

/** Expected failures become readable tool errors; anything else is rethrown. */
const run = async (f: () => Promise<unknown>): Promise<Result> => {
  try {
    return ok(await f());
  } catch (e) {
    if (e instanceof T.ToolError) return fail(e.message);
    if (e instanceof RunsheetError) return fail(`The workout needs fixing:\n${e.message}`);
    if (e instanceof SupabaseError) return fail(e.status === 401 ? 'Your TigerWorkouts sign-in has expired. Reconnect the TigerWorkouts connector.' : `TigerWorkouts could not do that (${e.status}): ${e.message}`);
    throw e;
  }
};

const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

export const buildServer = (db: Db, email?: string) => {
  const s = new McpServer({ name: 'tigerworkouts', title: 'TigerWorkouts', version: '0.1.0', websiteUrl: 'https://tigerworkouts.com' }, { instructions: INSTRUCTIONS });

  s.registerTool('get_profile', { title: 'Profile', description: "The signed-in user's name, units, bodyweight, training maxes (kg, by exercise key), saved workout ids and a count of recent sessions. Start here.", inputSchema: {}, annotations: readOnly }, () => run(() => T.getProfile(db, email)));

  s.registerTool(
    'list_sessions',
    {
      title: 'Training history',
      description: 'Recent sessions, newest first, with what was actually done per exercise: load used (kg or the exercise unit), incline, reps per set, and whether every set hit its reps. Use it to judge progress and pick next loads.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe('Default 20'),
        since: z.string().optional().describe('ISO date/time, inclusive'),
        until: z.string().optional().describe('ISO date/time, exclusive'),
        workoutId: z.string().optional().describe('Only sessions of this workout'),
      },
      annotations: readOnly,
    },
    a => run(() => T.listSessions(db, a)),
  );

  s.registerTool('get_session', { title: 'Session', description: 'One session in full, with the outline of the workout it ran.', inputSchema: { id: z.string() }, annotations: readOnly }, a => run(() => T.getSession(db, a.id)));

  s.registerTool(
    'list_workouts',
    {
      title: 'Find workouts',
      description: "Search workouts the user can see: their own (owner \"me\", with public true/false), other people's public ones (\"other\") and the catalogue (\"catalogue\"; sources include coaches, crossfit-girls, crossfit-heroes, crossfit-open, nhs, programs, protocols, youtube). Returns summaries; get_workout has the full runsheet.",
      inputSchema: {
        scope: z.enum(['mine', 'public', 'catalogue', 'all']).optional().describe('Default all'),
        query: z.string().optional().describe('Words that must all appear in title, creator, programme, tags or exercise keys'),
        source: z.string().optional().describe('user, community, or a catalogue source'),
        tag: z.string().optional(),
        exercise: z.string().optional().describe('Only workouts using this exercise key'),
        minMinutes: z.number().optional(),
        maxMinutes: z.number().optional(),
        limit: z.number().int().min(1).max(100).optional().describe('Default 25'),
        offset: z.number().int().min(0).optional(),
      },
      annotations: readOnly,
    },
    a => run(() => T.listWorkouts(db, a)),
  );

  s.registerTool('get_workout', { title: 'Workout', description: 'One workout: a readable outline, the full runsheet (the same shape create_workout takes), whether the user can edit it, and its link in the app.', inputSchema: { id: z.string() }, annotations: readOnly }, a => run(() => T.getWorkout(db, a.id)));

  s.registerTool('search_exercises', { title: 'Exercise library', description: 'Find exercise keys for create_workout: key, name, unit of the load ("kg", "kg per arm", "kph", "" = bodyweight), stepper increment and a coaching cue. Includes the user\'s own custom exercises.', inputSchema: { query: z.string().optional().describe('e.g. "bench", "kettlebell swing", "row"'), group: z.string().optional().describe('kettlebell, dumbbell, barbell, body, core, band, treadmill, walk, run, rower, bike, swim, gym'), limit: z.number().int().min(1).max(200).optional() }, annotations: readOnly }, a => run(() => T.searchExercises(db, a)));

  s.registerTool(
    'create_workout',
    {
      title: 'Create workout',
      description: `Save a new workout to the user's account. Private unless public is true (public = it shows in everyone's Discover). It appears in the app under Me once it syncs. Returns appUrl and a no-sign-in previewUrl to show the user.\n\n${RUNSHEET_HELP}`,
      inputSchema: { workout: runsheetInput, public: z.boolean().optional().describe('Default false') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    a => run(() => T.createWorkout(db, a)),
  );

  s.registerTool(
    'update_workout',
    {
      title: 'Update workout',
      description: "Change one of the user's own workouts (owner \"me\"). workout replaces the whole runsheet (get_workout first, edit, send it back); public alone flips visibility. Catalogue and other people's workouts cannot be changed — copy them with create_workout.",
      inputSchema: { id: z.string(), workout: runsheetInput.optional(), public: z.boolean().optional() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    a => run(() => T.updateWorkout(db, a)),
  );

  s.registerTool(
    'preview_workout_url',
    {
      title: 'Preview link',
      description: 'A tigerworkouts.com link that opens a workout with no sign-in, for a saved workout (id) or an unsaved draft (workout). Good for "have a look before I save it".',
      inputSchema: { id: z.string().optional(), workout: runsheetInput.optional() },
      annotations: readOnly,
    },
    a => run(() => T.previewWorkoutUrl(db, a)),
  );

  return s;
};

/** One MCP request, stateless. */
export const handleMcp = async (request: Request, db: Db, email?: string) => {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = buildServer(db, email);
  await server.connect(transport);
  return transport.handleRequest(request);
};
