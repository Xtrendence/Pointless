# Pointless

Real-time ticket estimation for agile teams, using the Fibonacci sequence. It works the same way as [Slashgear/poker-planning](https://github.com/Slashgear/poker-planning), with a dark theme and an orange accent. It runs as a static site on GitHub Pages.

**Live:** https://xtrendence.github.io/Pointless/

## Features

- Create a room and share the link. Everyone who opens it joins that room.
- Vote with Fibonacci values (1–89), `?` or `☕`. Votes stay hidden until someone reveals them, either immediately or after a 3-second countdown.
- After a reveal: each vote, the average, a distribution chart, and confetti when everyone agrees.
- Anyone in the room can reveal, reset, or remove a member.
- Keyboard shortcuts: `1`–`9` vote, `V` reveal, `R` reset.
- **Name set once:** you have to set a name before creating or joining a room. It's remembered and reused across rooms, and you can change it at any time.
- **Rooms persist:** a room and its members survive everyone closing their tabs. Open the same link later and you're back as the same member. If you've lost your local data, enter the same name and choose "Rejoin".
- Rooms expire after **24 hours** of inactivity.
- "Clear local data" in the footer wipes everything this browser has stored.
- **Linear import (optional):** only shown when `LINEAR_API_KEY` is set (see [Linear integration](#linear-integration)). Pick a team and a status to create a room with those tickets, step through them, and save a score per ticket. Saved scores are written back to Linear as the issue's estimate.

## How it works without a server

GitHub Pages only serves static files, so there is no backend:

- Each room is a small set of last-writer-wins records: room metadata, the current round, and one record per member.
- Each browser keeps its copy of the room in **IndexedDB**.
- Changes are **encrypted with AES-GCM using a key derived from the room code**, then exchanged through several public [Nostr](https://nostr.com) relays.
- The relays also store the latest copy of each record. That's how someone opening the link for the first time gets the room, even if nobody else is online.
- When a member returns, their browser re-publishes anything the relays no longer have.
- Online dots come from short-lived heartbeat messages that the relays don't store.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/, including 404.html for client-side routing
```

To test with more than one person locally, open the room in a normal window and a private window.

Every push to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Linear integration

The "Import tickets from Linear" option **only renders if `LINEAR_API_KEY` is set** when the app is built or served. Without it, Pointless works exactly as before.

- **Locally:** copy `.env.example` to `.env` and fill in a [Linear personal API key](https://linear.app/settings/account/security). `npm run dev` and `npm run build` both read it.
- **GitHub Pages:** add a repository secret named `LINEAR_API_KEY` (Settings → Secrets and variables → Actions). The deploy workflow passes it to the build. Delete the secret and redeploy to turn the integration off again.

> [!WARNING]
> The key is compiled into the JavaScript bundle. On a public GitHub Pages site, **anyone who loads the page can read it** and use it with your Linear permissions. Only set it for a deploy you're comfortable sharing that access with, ideally using a key from an account limited to the teams you estimate.

Tickets are fetched from Linear in the browser. Only each ticket's identifier, title and URL are shared with the room, encrypted like the rest of the room data.
