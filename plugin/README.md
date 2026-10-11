# TigerWorkouts

Coaching from your real training history, new workouts written straight into the [TigerWorkouts](https://tigerworkouts.com) app, and a guided timer in the chat. Works in Claude (chat, Cowork, Claude Code) and ChatGPT.

## Install

- **Claude Code:** `/plugin marketplace add Holzherr/tigerworkouts`, then `/plugin install tigerworkouts@tigerworkouts`, then `/mcp` to sign in.
- **claude.ai / Cowork:** Customize → Plugins → Add → Add marketplace → `Holzherr/tigerworkouts`, install TigerWorkouts, then connect it from the plugin's Connectors tab.
- **Connector only:** add `https://mcp.tigerworkouts.com/mcp` as a custom connector. Steps for each app: https://mcp.tigerworkouts.com

## Use it

Connect and sign in with your TigerWorkouts email, or tap "Start now" for a temporary account you can keep later with your email. Then ask:

- "Look at my last month and tell me what to change."
- "Write me a 30-minute upper-body session for tomorrow using my last loads."
- "Find a 20-minute kettlebell workout and start it."

## What's inside

- A connector to `https://mcp.tigerworkouts.com/mcp` (OAuth sign-in): profile, training history, workout search, create and update workouts, a timer view, session logging, and keeping an anonymous account.
- Skills: `get-started` (setup, accounts, data) and `coach` (how to read history, pick loads, write and run workouts).

## Data

The connector acts as you, through your TigerWorkouts account: it reads your own workouts and training history and public workouts, and writes the workouts and sessions you ask for. Nothing of anyone else's. Data is stored with Supabase for TigerWorkouts; the connector keeps your sign-in encrypted with Cloudflare. Privacy policy: https://tigerworkouts.com/privacy/. Support: brambruesch@nickholzherr.com.
