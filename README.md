# 🕵️ Who Is She

A Kahoot-style party game for one room. A big screen reveals a photo **tile by tile**; players
join from their phones, type **who they think it is**, and the **earlier you guess correctly, the
more points you score**. Built for in-person parties: one shared screen + everyone's phones.

Bilingual out of the box: **Spanish (default) and Chinese**, switchable per device.

## Quick start

```bash
npm install
npm start                 # serves on http://localhost:3000
```

Then open:

| Page | URL | Who |
|------|-----|-----|
| Config | `http://localhost:3000/admin` | Host, before the game — upload photos + set answers |
| Big screen | `http://localhost:3000/host` | Projector/TV — shows the QR code, photo, countdown, scores |
| Player | `http://localhost:3000/play` | Each phone — scan the QR on the big screen to reach it |

Phones must be on the **same Wi-Fi** as the host machine; the big screen shows a join URL with the
LAN IP. (Testing solo on one machine? Just open `/play` in another tab.)

## How to play

1. **/admin** — upload a few photos, each with the correct name and optional comma-separated aliases;
   pick the grid size (default 4×4) and reveal interval (default 3000 ms). Saved to `quiz.json`.
2. **/host** — players scan the QR and land in a **waiting room (sala de espera)** where everyone
   sees who has joined. Press **Start**.
3. A synchronized **3 · 2 · 1** plays on the big screen and every phone, then round 1 begins.
4. The photo reveals tile by tile while a **Kahoot-style countdown ring** runs. As each player locks
   in an answer, a ✓ chip with their name pops up on the big screen — **without revealing if they're
   right**. Players do **not** see their score yet (suspense!).
5. The round ends when all tiles are revealed or the host hits **Skip**. The answer, who got it, and
   the **leaderboard (with a rank-change slide animation)** appear on the big screen — and each phone
   now reveals its own result and updated total.
6. **Next** moves to the next photo. After the last one, the **final ranking** shows with a
   **Play again** button that resets scores and returns everyone to the waiting room.

## Scoring

`score = ceil(1000 × (totalTiles − tilesRevealedWhenYouAnswered) / totalTiles)`, with a floor of 50
if you only get it on the very last tile. Everyone who answers correctly scores (not just the first),
each based on how early they locked in. One submission per player per round.

Answer matching is forgiving: case-insensitive, ignores extra spaces and punctuation, accepts any
listed alias, and tolerates a single-character typo (Damerau–Levenshtein distance ≤ 1).

## Project layout

```
server/
  scoring.js     pure: the scoring formula
  matching.js    pure: answer normalization + fuzzy match
  game.js        GameState machine (LOBBY → REVEALING → ROUND_RESULT → GAME_OVER)
  quizStore.js   reads/writes quiz.json (honors the QUIZ_PATH env override)
  index.js       Express + Socket.IO server: pages, uploads, QR, realtime
public/
  i18n.js        translation dictionary (es default + zh) + t()/applyI18n()/language switch
  shared.css     shared styling
  admin.{html,js}  config page
  host.{html,js}   big screen
  play.{html,js}   phone
test/            node:test suites (unit + socket integration)
scripts/
  e2e.mjs        headless Playwright end-to-end test (npm run test:e2e)
  demo.mjs       headed Playwright visual demo: 1 host + 3 phones (npm run demo)
```

No build step — plain HTML/CSS/JS on the front end, ES modules on the server.

## Testing

This project is tested at two levels, and **both must pass**:

```bash
npm test          # node:test — unit (scoring, matching, game state, i18n) + socket integration
npm run test:e2e  # Playwright — headless full game with 1 host + 3 players, asserts the real UI
```

`npm run test:e2e` spawns its own server on an isolated port with a temporary quiz file, so it never
touches your real `quiz.json`. See [CLAUDE.md](./CLAUDE.md) for the development workflow (every feature
gets a test).

Want to *watch* a game instead of just asserting it? `npm run demo` opens four real browser windows
(the big screen + three phones) and plays a full round-trip you can watch live.

## Configuration

- `PORT` — server port (default `3000`).
- `QUIZ_PATH` — path to the quiz JSON file (default `./quiz.json`). Used by the tests for isolation.

`quiz.json` and uploaded images (`uploads/`) are git-ignored — they're per-event data, not code.
