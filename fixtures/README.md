# Shared fixtures

`runsheets.json` is the stored runsheet shape (the `data` column of `workouts`), with every field
the model has. Three tests read it, so the three places that know the shape cannot drift apart
without one of them failing:

- web: `src/features/runsheet/fixtures.test.ts` (shape check, engine expands it)
- MCP: `mcp/test/fixtures.test.ts` (every field is one the agent schema knows, or is listed as app-only)
- iOS: `CatalogueTests.swift`, "the shared fixtures round-trip" (decode, encode, same JSON back)

A new field in `src/features/runsheet/model.ts` goes in here too.

`sessions.json` is three `sessions` rows (`id` and the `data` column) with every field a session
has, plus keys no app knows yet (`futureField`, `futureStepField`, `futureSetField`).
`runsheet-unknown-mode.json` is a workout with a block mode no app knows yet. Read by:

- web: `src/features/cloud/fixtures.test.ts` (rows read and written back unchanged; the unknown mode is
  still a runsheet and unrolls)
- MCP: `mcp/test/fixtures.test.ts` (every session field is one log_session takes, or is listed as
  the apps' own)
- iOS: `SessionFixturesTests` in `CatalogueTests.swift` (decoded, through the cache and back to a row,
  nothing lost; the unknown mode survives an edit)

A new session field goes in `sessions.json` too.
