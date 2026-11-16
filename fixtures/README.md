# Shared fixtures

`runsheets.json` is the stored runsheet shape (the `data` column of `workouts`), with every field
the model has. Three tests read it, so the three places that know the shape cannot drift apart
without one of them failing:

- web: `src/features/runsheet/fixtures.test.ts` (shape check, engine expands it)
- MCP: `mcp/test/fixtures.test.ts` (every field is one the agent schema knows, or is listed as app-only)
- iOS: `CatalogueTests.swift`, "the shared fixtures round-trip" (decode, encode, same JSON back)

A new field in `src/features/runsheet/model.ts` goes in here too.
