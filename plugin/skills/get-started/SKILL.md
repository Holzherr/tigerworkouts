---
name: get-started
description: Set up and introduce TigerWorkouts. Use when the person first connects TigerWorkouts, asks what it can do, has trouble connecting or signing in, or asks about keeping their account, the iPhone app or their data.
---

# Getting started with TigerWorkouts

1. Call `get_profile`. It says who is connected, their units and training maxes, how many recent sessions they have, and whether the account is anonymous.
2. Say in two or three lines what you can do, picked to fit what they have:
   - With history: review what they did lately and suggest the next session with real loads.
   - Without: find a workout that fits their time and kit, or write one, and run it now with the timer in the chat.
3. Offer one concrete first step ("Want a 25-minute kettlebell session now?"). Don't list every tool.

## Not connected or sign-in trouble

- The server is `https://mcp.tigerworkouts.com/mcp`. Setup for each app is at https://mcp.tigerworkouts.com.
- On the sign-in page: "Start now, no account needed" makes a temporary account in one tap. People who already use TigerWorkouts should sign in with their email instead, or they will not see their workouts.
- "Sign-in has expired" means remove and reconnect the connector; nothing is lost.

## Anonymous accounts

When `get_profile` says `anonymous: true`:

- Nothing can be made public, and the account is deleted 7 days after it started unless it is kept. `keepAccount` on results says when, or that a confirmation is waiting.
- Once there is something worth keeping (a saved workout, a finished session) or they ask about the app, offer to keep it: ask for their email and call `claim_account`. If they would rather not type it in the chat, call it without an email and give them `claimUrl`.
- Pass on the result's `next`. Usually a confirmation email goes out and the account is kept only once they click its link (check spam). The link opens tigerworkouts.com signed in.
- Then the iPhone app (https://testflight.apple.com/join/r8uFaWKY): sign in with the same email.
- If the email already has an account, the two cannot be merged yet. Explain that and let them choose.

## Data

The connector acts as the person: it sees their own workouts and history plus public workouts, nothing of anyone else's. New workouts are private unless they ask for public. Privacy policy: https://tigerworkouts.com/privacy/
